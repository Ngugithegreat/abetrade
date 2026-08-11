import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { setHouseEdge, setReferralPct } from "@/lib/settings";
import { sendEmail, depositReceiptEmail, kycApprovedEmail, kycRejectedEmail } from "@/lib/email";
import { payReferralOnDeposit } from "@/lib/referral";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin actions: approve/reject pending money requests, plus account &
// house-edge controls.
export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const action = String(body.action || "");

  await ensureSchema();
  const sql = db();

  // ---- House edge (percent, e.g. 5 => 0.05) ----
  if (action === "set_house_edge") {
    const pct = Number(body.percent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 50) {
      return NextResponse.json({ error: "Edge must be between 0 and 50%." }, { status: 400 });
    }
    const edge = await setHouseEdge(pct / 100);
    return NextResponse.json({ ok: true, houseEdge: edge });
  }

  // ---- Referral reward rate (percent, e.g. 10 => 0.10) ----
  if (action === "set_referral_pct") {
    const pct = Number(body.percent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 50) {
      return NextResponse.json({ error: "Referral rate must be between 0 and 50%." }, { status: 400 });
    }
    const rate = await setReferralPct(pct / 100);
    return NextResponse.json({ ok: true, referralPct: rate });
  }

  // ---- Account controls ----
  if (action === "block_user" || action === "unblock_user") {
    const userId = Number(body.userId);
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ error: "Bad user." }, { status: 400 });
    }
    const status = action === "block_user" ? "blocked" : "active";
    await sql`UPDATE abetrade_users SET status = ${status} WHERE id = ${userId}`;
    return NextResponse.json({ ok: true, status });
  }

  if (action === "toggle_promo") {
    const userId = Number(body.userId);
    const value = !!body.value;
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ error: "Bad user." }, { status: 400 });
    }
    await sql`UPDATE abetrade_users SET promo = ${value} WHERE id = ${userId}`;
    return NextResponse.json({ ok: true, promo: value });
  }

  if (action === "grant_bonus") {
    const userId = Number(body.userId);
    const usd = Number(body.amount);
    if (!Number.isFinite(userId) || !Number.isFinite(usd) || usd === 0 || Math.abs(usd) > 100000) {
      return NextResponse.json({ error: "Enter a valid bonus amount." }, { status: 400 });
    }
    const amount = Math.round(usd * 100); // cents; can be negative to claw back
    const rows = (await sql`
      UPDATE abetrade_users SET balance = balance + ${amount}
      WHERE id = ${userId} AND balance + ${amount} >= 0
      RETURNING balance
    `) as Array<{ balance: string | number }>;
    if (!rows.length) {
      return NextResponse.json({ error: "User not found or balance would go negative." }, { status: 400 });
    }
    await sql`
      INSERT INTO abetrade_transactions (user_id, type, amount, status, method, note)
      VALUES (${userId}, 'bonus', ${amount}, 'completed', 'promo', 'Promotional credit')
    `;
    return NextResponse.json({ ok: true, balance: Number(rows[0].balance) });
  }

  // ---- KYC verification: approve or reject with a reason ----
  if (action === "kyc_approve" || action === "kyc_reject") {
    const userId = Number(body.userId);
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ error: "Bad user." }, { status: 400 });
    }
    if (action === "kyc_approve") {
      await sql`UPDATE abetrade_users SET kyc_status = 'approved', kyc_reason = NULL WHERE id = ${userId}`;
    } else {
      const reason = String(body.reason || "").trim() || "Your details could not be verified.";
      await sql`UPDATE abetrade_users SET kyc_status = 'rejected', kyc_reason = ${reason} WHERE id = ${userId}`;
    }
    void (async () => {
      try {
        const u = (await sql`SELECT email, name FROM abetrade_users WHERE id = ${userId} LIMIT 1`) as Array<{
          email: string;
          name: string;
        }>;
        if (u.length && u[0].email) {
          const mail =
            action === "kyc_approve"
              ? kycApprovedEmail(u[0].name)
              : kycRejectedEmail(u[0].name, String(body.reason || ""));
          await sendEmail({ to: u[0].email, subject: mail.subject, html: mail.html, text: mail.text });
        }
      } catch {
        /* non-fatal */
      }
    })();
    return NextResponse.json({ ok: true });
  }

  // ---- Approve / reject a pending deposit or withdrawal ----
  const id = Number(body.id);
  if (!Number.isFinite(id) || (action !== "approve" && action !== "reject")) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  // Claim the pending row atomically so it can't be actioned twice.
  const newStatus = action === "approve" ? "completed" : "rejected";
  const claimed = (await sql`
    UPDATE abetrade_transactions SET status = ${newStatus}
    WHERE id = ${id} AND status = 'pending'
    RETURNING *
  `) as any[];

  if (!claimed.length) {
    return NextResponse.json(
      { error: "Already actioned or not found." },
      { status: 409 }
    );
  }
  const tx = claimed[0];
  const amount = Number(tx.amount); // deposits positive, withdrawals negative

  if (tx.type === "deposit" && action === "approve") {
    // Credit the user now.
    await sql`UPDATE abetrade_users SET balance = balance + ${amount} WHERE id = ${tx.user_id}`;
    // Pay referral reward on the user's first deposit (idempotent).
    await payReferralOnDeposit(tx.user_id, amount).catch(() => {});
    // Email receipt (fire-and-forget).
    void (async () => {
      try {
        const u = (await sql`SELECT email, name FROM abetrade_users WHERE id = ${tx.user_id} LIMIT 1`) as Array<{ email: string; name: string }>;
        if (u.length && u[0].email) {
          const mail = depositReceiptEmail(u[0].name, amount / 100, tx.method || "your payment method");
          await sendEmail({ to: u[0].email, subject: mail.subject, html: mail.html, text: mail.text });
        }
      } catch { /* non-fatal */ }
    })();
  } else if (tx.type === "withdrawal" && action === "reject") {
    // Refund the reserved funds (amount is negative, so subtract to add back).
    await sql`UPDATE abetrade_users SET balance = balance - ${amount} WHERE id = ${tx.user_id}`;
  }
  // deposit+reject: nothing was credited, nothing to undo.
  // withdrawal+approve: funds already reserved; admin pays out off-platform.

  return NextResponse.json({ ok: true, transaction: tx });
}
