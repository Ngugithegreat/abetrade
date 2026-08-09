import { db } from "./db";

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
