import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isBlocked } from "@/lib/settings";
import { sendEmail, withdrawalReceiptEmail } from "@/lib/email";
import { cents } from "@/lib/format";
import {
  isB2cConfigured,
  normalizePhone,
  centsToKes,
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

  // Reserve funds atomically.
  const debit = (await sql`
    UPDATE abetrade_users SET balance = balance - ${amount}
    WHERE id = ${session.id} AND balance >= ${amount}
    RETURNING balance
  `) as any[];

  if (!debit.length) {
    return NextResponse.json({ error: "Insufficient balance." }, { status: 402 });
  }
  const balanceAfter = Number(debit[0].balance);

  // ---- Automated M-Pesa payout via B2C ----
  if (automated && phone) {
    const amountKes = centsToKes(amount);
    try {
      const cbBase = callbackBase(req.url);
      const token = callbackToken();
      const q = token ? `?token=${encodeURIComponent(token)}` : "";

      const b2c = await b2cPayment({
        phone,
        amountKes,
        remarks: "SinTrades withdrawal",
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

  // ---- Manual withdrawal (admin approval) ----
  const rows = (await sql`
    INSERT INTO abetrade_transactions (user_id, type, amount, status, method, reference, note)
    VALUES (${session.id}, 'withdrawal', ${-amount}, 'pending', ${method}, ${rawRef}, 'Withdrawal request')
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
  });
}
