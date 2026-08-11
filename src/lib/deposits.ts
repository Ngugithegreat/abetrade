import { db } from "./db";
import { sendEmail, depositReceiptEmail } from "./email";
import { payReferralOnDeposit } from "./referral";

// Shared, idempotent crediting for automated deposits. Every provider webhook
// funnels through here: it finds the PENDING deposit by its provider reference,
// atomically flips it to completed, and credits the user exactly once. A
// replayed or duplicate webhook is a no-op.

type PendingTx = {
  id: number;
  user_id: number;
  amount: number | string;
  status: string;
};

export async function creditPendingDeposit(
  providerRef: string,
  opts: { expectedCents?: number; receipt?: string | null; note?: string } = {}
): Promise<{ ok: boolean; reason?: string; credited?: number }> {
  if (!providerRef) return { ok: false, reason: "no_ref" };
  const sql = db();

  const rows = (await sql`
    SELECT id, user_id, amount, status FROM abetrade_transactions
    WHERE provider_ref = ${providerRef} AND type = 'deposit' AND status = 'pending'
    LIMIT 1
  `) as PendingTx[];
  if (!rows.length) return { ok: false, reason: "not_found_or_settled" };

  const tx = rows[0];
  const amount = Number(tx.amount);

  // Guard: never credit more than what was actually paid, when we know it.
  if (opts.expectedCents != null && opts.expectedCents < amount) {
    await sql`
      UPDATE abetrade_transactions
      SET status = 'rejected', note = ${`Underpaid: got ${opts.expectedCents} of ${amount}`}
      WHERE id = ${tx.id} AND status = 'pending'
    `;
    return { ok: false, reason: "underpaid" };
  }

  const claimed = (await sql`
    UPDATE abetrade_transactions
    SET status = 'completed', receipt = ${opts.receipt ?? null}, note = ${
      opts.note ?? "Deposit confirmed"
    }
    WHERE id = ${tx.id} AND status = 'pending'
    RETURNING id
  `) as Array<{ id: number }>;

  if (!claimed.length) return { ok: false, reason: "race" };

  await sql`UPDATE abetrade_users SET balance = balance + ${amount} WHERE id = ${tx.user_id}`;

  // Pay the referrer their share if this is the user's first deposit (idempotent).
  await payReferralOnDeposit(tx.user_id, amount).catch(() => {});

  // Email receipt — fire-and-forget so crediting never depends on email.
  void (async () => {
    try {
      const u = (await sql`
        SELECT u.email, u.name, t.method
        FROM abetrade_users u JOIN abetrade_transactions t ON t.id = ${tx.id}
        WHERE u.id = ${tx.user_id} LIMIT 1
      `) as Array<{ email: string; name: string; method: string | null }>;
      if (u.length && u[0].email) {
        const mail = depositReceiptEmail(u[0].name, amount / 100, u[0].method || "your payment method");
        await sendEmail({ to: u[0].email, subject: mail.subject, html: mail.html, text: mail.text });
      }
    } catch {
      /* non-fatal */
    }
  })();

  return { ok: true, credited: amount };
}

export async function rejectPendingDeposit(
  providerRef: string,
  note = "Payment failed"
): Promise<void> {
  if (!providerRef) return;
  const sql = db();
  await sql`
    UPDATE abetrade_transactions
    SET status = 'rejected', note = ${note}
    WHERE provider_ref = ${providerRef} AND type = 'deposit' AND status = 'pending'
  `;
}
