import { db } from "./db";
import { getTickAtOrAfter } from "./deriv-server";

export type TradeRow = {
  id: number;
  user_id: number;
  symbol: string;
  direction: "rise" | "fall";
  stake: string | number;
  payout: string | number;
  entry_price: number;
  exit_price: number | null;
  entry_epoch: string | number;
  expiry_epoch: string | number;
  status: "open" | "won" | "lost";
  created_at: string;
  settled_at: string | null;
};

/**
 * Settles a single open trade against the real Deriv tick at/after expiry.
 * Credits the payout to the user's balance on a win. Idempotent: only acts on
 * rows still marked 'open'. Returns the updated trade, or the row unchanged if
 * the expiry tick isn't available yet.
 */
export async function settleTrade(trade: TradeRow): Promise<TradeRow> {
  if (trade.status !== "open") return trade;

  const nowSec = Math.floor(Date.now() / 1000);
  const expiry = Number(trade.expiry_epoch);
  if (nowSec < expiry) return trade; // not expired yet

  const tick = await getTickAtOrAfter(trade.symbol, expiry);
  if (!tick) return trade; // feed hasn't reached expiry; try again later

  const won =
    trade.direction === "rise"
      ? tick.price > trade.entry_price
      : tick.price < trade.entry_price;
  // A flat tick (exit == entry) counts as a loss, matching typical Rise/Fall rules.

  const status: "won" | "lost" = won ? "won" : "lost";
  const sql = db();

  // Atomically flip the row from 'open' so concurrent settles can't double-pay.
  const updated = (await sql`
    UPDATE trades
    SET status = ${status}, exit_price = ${tick.price}, settled_at = now()
    WHERE id = ${trade.id} AND status = 'open'
    RETURNING *
  `) as TradeRow[];

  if (!updated.length) {
    // Someone else settled it first; return latest state.
    const latest = (await sql`SELECT * FROM trades WHERE id = ${trade.id}`) as TradeRow[];
    return latest[0] ?? trade;
  }

  if (won) {
    const payout = Number(trade.payout);
    await sql`UPDATE users SET balance = balance + ${payout} WHERE id = ${trade.user_id}`;
    await sql`
      INSERT INTO transactions (user_id, type, amount, status, method, note)
      VALUES (${trade.user_id}, 'trade_payout', ${payout}, 'completed', 'trade', ${
        "Won " + trade.symbol + " " + trade.direction
      })
    `;
  }

  return updated[0];
}

/** Settles every expired open trade for a user. Best-effort; ignores per-trade errors. */
export async function settleExpiredTrades(userId: number): Promise<void> {
  const sql = db();
  const nowSec = Math.floor(Date.now() / 1000);
  const open = (await sql`
    SELECT * FROM trades
    WHERE user_id = ${userId} AND status = 'open' AND expiry_epoch <= ${nowSec}
    ORDER BY id ASC
    LIMIT 25
  `) as TradeRow[];

  for (const t of open) {
    try {
      await settleTrade(t);
    } catch {
      /* leave open, will retry on next call */
    }
  }
}
