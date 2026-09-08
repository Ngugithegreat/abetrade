import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isBlocked, getWithdrawDailyCount, getWithdrawDailyMaxCents } from "@/lib/settings";
import { sendEmail, withdrawalReceiptEmail } from "@/lib/email";
import { cents } from "@/lib/format";
import { BRAND_NAME } from "@/lib/brand";
import {
  isB2cConfigured,
  normalizePhone,
  centsToKesWithdraw,
  b2cPayment,
  callbackBase,
  callbackToken,
} from "@/lib/mpesa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Withdrawal. Funds are RESERVED (debited) immediately. If method is 'mpesa' and
// B2C is configured, money is sent to the phone automatically and the M-Pesa
// result callback marks it complete (or refunds on failure). Otherwise it's a
// manual request an admin approves/pays out.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const amount = cents(Number(body.amount));
  const method = String(body.method || "manual");
  const rawRef = String(body.reference || "").trim();

  if (!Number.isFinite(amount) || amount < 100) {
    return NextResponse.json({ error: "Minimum withdrawal is $1.00." }, { status: 400 });
  }
  if (!rawRef) {
    return NextResponse.json(
      { error: "Enter where to send the money (phone / address / account)." },
      { status: 400 }
    );
  }

  const automated = method === "mpesa" && isB2cConfigured();

  // Validate the phone BEFORE reserving funds for automated payouts.
  let phone: string | null = null;
  if (automated) {
    phone = normalizePhone(rawRef);
    if (!phone) {
      return NextResponse.json(
        { error: "Enter a valid M-Pesa phone number (e.g. 0712345678)." },
        { status: 400 }
      );
    }
  }

  await ensureSchema();
  const sql = db();

  if (await isBlocked(session.id)) {
    return NextResponse.json(
      { error: "Your account is suspended. Please contact support." },
      { status: 403 }
    );
  }

  // Withdrawals are PROFIT-ONLY. Your deposits can never be withdrawn — only
  // profit above your lifetime deposits (and never locked bonus funds). So if
  // you deposit $5, trade and drop to $2, that $2 is remaining deposit and
  // stays in to trade with; you can only cash out once your balance rises above
  // what you've put in. This is a trading platform, not a banking service.
  //   withdrawable = balance − lifetime deposits − locked bonus
  const posRows = (await sql`
    SELECT
      balance,
      COALESCE(bonus_locked, 0) AS bonus_locked,
      COALESCE((SELECT SUM(amount) FROM abetrade_transactions
                 WHERE user_id = ${session.id} AND type = 'deposit'
                   AND status = 'completed' AND is_demo = false), 0) AS deposited
    FROM abetrade_users WHERE id = ${session.id} LIMIT 1
  `) as Array<{ balance: string | number; bonus_locked: string | number; deposited: string | number }>;
  const posBal = Number(posRows[0]?.balance ?? 0);
  const posLocked = Number(posRows[0]?.bonus_locked ?? 0);
  const posDeposited = Number(posRows[0]?.deposited ?? 0);
  const withdrawable = Math.max(0, posBal - posDeposited - posLocked);
  if (amount > withdrawable) {
    const msg =
      withdrawable <= 0
        ? `Only your profit can be withdrawn — your deposits stay in to trade with. Keep trading, and once you're in profit you can cash it out. (${BRAND_NAME} is a trading platform, not a banking service.)`
        : `You can withdraw your profit of up to $${(withdrawable / 100).toFixed(2)} right now — deposits themselves can't be withdrawn, only profit.`;
    return NextResponse.json({ error: msg }, { status: 403 });
  }

  // Instant-withdrawal daily limits (per account, resets at UTC midnight).
  const [maxCount, maxDaily] = await Promise.all([getWithdrawDailyCount(), getWithdrawDailyMaxCents()]);
  const today = (await sql`
    SELECT COUNT(*)::int AS n, COALESCE(SUM(-amount), 0) AS total
    FROM abetrade_transactions
    WHERE user_id = ${session.id} AND type = 'withdrawal' AND status != 'rejected'
      AND created_at >= date_trunc('day', now())
  `) as Array<{ n: number; total: string | number }>;
  const usedCount = Number(today[0]?.n ?? 0);
  const usedTotal = Number(today[0]?.total ?? 0);
  if (usedCount >= maxCount) {
    return NextResponse.json(
      { error: `Daily withdrawal limit reached — you can make ${maxCount} withdrawal${maxCount === 1 ? "" : "s"} per day. Try again tomorrow.` },
      { status: 429 }
    );
  }
  if (usedTotal + amount > maxDaily) {
    const left = Math.max(0, maxDaily - usedTotal);
    return NextResponse.json(
      { error: `This exceeds your daily withdrawal limit of $${(maxDaily / 100).toFixed(0)}. You can still withdraw $${(left / 100).toFixed(2)} today.` },
      { status: 429 }
    );
  }

  // Reserve funds atomically on the PROFIT-ONLY withdrawable amount
  // (balance − lifetime deposits − locked bonus). This single guarded UPDATE is
  // the real security boundary: you can never withdraw a deposit or locked
  // bonus, never overdraw, and it's race-safe (two concurrent requests can't
  // both pass), so nobody can fire parallel withdrawals to get around it.
  const debit = (await sql`
    UPDATE abetrade_users u SET balance = balance - ${amount}
    WHERE u.id = ${session.id}
      AND u.balance
          - GREATEST(COALESCE(u.bonus_locked, 0), 0)
          - COALESCE((SELECT SUM(amount) FROM abetrade_transactions
                       WHERE user_id = u.id AND type = 'deposit'
                         AND status = 'completed' AND is_demo = false), 0)
          >= ${amount}
    RETURNING balance
  `) as any[];

  if (!debit.length) {
    return NextResponse.json(
      { error: `You can withdraw your profit of up to $${(withdrawable / 100).toFixed(2)} right now — deposits can't be withdrawn, only profit.` },
      { status: 402 }
    );
  }
  const balanceAfter = Number(debit[0].balance);

  // ---- Automated M-Pesa payout via B2C ----
  if (automated && phone) {
    const amountKes = centsToKesWithdraw(amount);
    try {
      const cbBase = callbackBase(req.url);
      const token = callbackToken();
      const q = token ? `?token=${encodeURIComponent(token)}` : "";

      const b2c = await b2cPayment({
        phone,
        amountKes,
        remarks: `${BRAND_NAME} withdrawal`,
        resultUrl: `${cbBase}/api/mpesa/b2c-result${q}`,
        timeoutUrl: `${cbBase}/api/mpesa/b2c-timeout${q}`,
      });

      const rows = (await sql`
        INSERT INTO abetrade_transactions
          (user_id, type, amount, status, method, reference, provider_ref, note)
        VALUES
          (${session.id}, 'withdrawal', ${-amount}, 'pending', 'mpesa', ${phone},
           ${b2c.ConversationID}, ${"B2C sent · KES " + amountKes})
        RETURNING *
      `) as any[];

      {
        const mail = withdrawalReceiptEmail(session.name, amount / 100, phone);
        void sendEmail({ to: session.email, subject: mail.subject, html: mail.html, text: mail.text }).catch(() => {});
      }
      return NextResponse.json({
        ok: true,
        mpesa: true,
        amountKes,
        transaction: rows[0],
        balance: balanceAfter,
        message: "Withdrawal is being sent to your M-Pesa. It usually arrives within a minute.",
      });
    } catch (e: any) {
      // Payout couldn't be initiated — refund the reservation.
      await sql`UPDATE abetrade_users SET balance = balance + ${amount} WHERE id = ${session.id}`;
      return NextResponse.json(
        { error: e?.message || "Could not send the M-Pesa payout. You were not charged." },
        { status: 502 }
      );
    }
  }

  // ---- Instant withdrawal (no admin approval) ----
  // Completed immediately within the daily caps; funds are paid out to the given
  // destination by the operator's payout process.
  const rows = (await sql`
    INSERT INTO abetrade_transactions (user_id, type, amount, status, method, reference, note)
    VALUES (${session.id}, 'withdrawal', ${-amount}, 'completed', ${method}, ${rawRef}, 'Instant withdrawal')
    RETURNING *
  `) as any[];

  {
    const mail = withdrawalReceiptEmail(session.name, amount / 100, rawRef);
    void sendEmail({ to: session.email, subject: mail.subject, html: mail.html, text: mail.text }).catch(() => {});
  }
  return NextResponse.json({
    ok: true,
    transaction: rows[0],
    balance: balanceAfter,
    message: `Withdrawal of $${(amount / 100).toFixed(2)} sent to ${rawRef}.`,
  });
}
