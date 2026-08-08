import { db } from "./db";
import { getLatestTick, getTickAtOrAfter, Tick } from "./deriv-server";
import { multiplierPnl } from "./markets";

export type TradeRow = {
  id: number;
  user_id: number;
  kind: "rise_fall" | "mult";
  symbol: string;
  direction: string; // rise|fall for rise_fall, up|down for mult
  stake: string | number;
  payout: string | number;
  multiplier: number | null;
  entry_price: number;
  exit_price: number | null;
  entry_epoch: string | number;
  expiry_epoch: string | number;
  stop_out_price: number | null;
  status: "open" | "won" | "lost";
  created_at: string;
  settled_at: string | null;
};

/**
 * Settles a single open Rise/Fall trade against the real Deriv tick at/after
 * expiry. Credits the payout on a win. Idempotent. Returns the row unchanged if
 * the expiry tick isn't available yet.
 */
export async function settleTrade(trade: TradeRow): Promise<TradeRow> {
  if (trade.status !== "open" || trade.kind !== "rise_fall") return trade;

  const nowSec = Math.floor(Date.now() / 1000);
  const expiry = Number(trade.expiry_epoch);
  if (nowSec < expiry) return trade;

  const tick = await getTickAtOrAfter(trade.symbol, expiry);
  if (!tick) return trade;

  const won =
    trade.direction === "rise"
      ? tick.price > trade.entry_price
      : tick.price < trade.entry_price;

  const status: "won" | "lost" = won ? "won" : "lost";
  const sql = db();

  const updated = (await sql`
    UPDATE abetrade_trades
    SET status = ${status}, exit_price = ${tick.price}, settled_at = now()
    WHERE id = ${trade.id} AND status = 'open'
    RETURNING *
  `) as TradeRow[];

  if (!updated.length) {
    const latest = (await sql`SELECT * FROM abetrade_trades WHERE id = ${trade.id}`) as TradeRow[];
    return latest[0] ?? trade;
  }

  if (won) {
    const payout = Number(trade.payout);
    await sql`UPDATE abetrade_users SET balance = balance + ${payout} WHERE id = ${trade.user_id}`;
    await sql`
      INSERT INTO abetrade_transactions (user_id, type, amount, status, method, note)
      VALUES (${trade.user_id}, 'trade_payout', ${payout}, 'completed', 'trade', ${
        "Won " + trade.symbol + " " + trade.direction
      })
    `;
  }

  return updated[0];
}

/** Settles every expired open Rise/Fall trade for a user. */
export async function settleExpiredTrades(userId: number): Promise<void> {
  const sql = db();
  const nowSec = Math.floor(Date.now() / 1000);
  const open = (await sql`
    SELECT * FROM abetrade_trades
    WHERE user_id = ${userId} AND status = 'open' AND kind = 'rise_fall'
      AND expiry_epoch <= ${nowSec}
    ORDER BY id ASC
    LIMIT 25
  `) as TradeRow[];

  for (const t of open) {
    try {
      await settleTrade(t);
    } catch {
      /* leave open, retry next call */
    }
  }
}

/**
 * Closes an open multiplier position at `tick` (fetched if omitted), realising
 * P&L. The payout = stake + P&L, floored at 0 (can't lose more than the stake).
 * Idempotent via an atomic status flip. Returns the settled row.
 */
export async function closeMultiplier(
  trade: TradeRow,
  tick?: Tick
): Promise<TradeRow> {
  if (trade.status !== "open" || trade.kind !== "mult") return trade;

  const px = tick ?? (await getLatestTick(trade.symbol));
  const stake = Number(trade.stake);
  const pnl = multiplierPnl({
    direction: trade.direction as "up" | "down",
    entry: Number(trade.entry_price),
    current: px.price,
    stakeCents: stake,
    multiplier: Number(trade.multiplier),
  });
  const payout = Math.max(0, stake + pnl);
  const status: "won" | "lost" = payout >= stake ? "won" : "lost";

  const sql = db();
  const updated = (await sql`
    UPDATE abetrade_trades
    SET status = ${status}, exit_price = ${px.price}, payout = ${payout}, settled_at = now()
    WHERE id = ${trade.id} AND status = 'open'
    RETURNING *
  `) as TradeRow[];

  if (!updated.length) {
    const latest = (await sql`SELECT * FROM abetrade_trades WHERE id = ${trade.id}`) as TradeRow[];
    return latest[0] ?? trade;
  }

  if (payout > 0) {
    await sql`UPDATE abetrade_users SET balance = balance + ${payout} WHERE id = ${trade.user_id}`;
    await sql`
      INSERT INTO abetrade_transactions (user_id, type, amount, status, method, note)
      VALUES (${trade.user_id}, 'trade_payout', ${payout}, 'completed', 'trade', ${
        "Closed " + trade.symbol + " " + trade.direction + " x" + trade.multiplier
      })
    `;
  }

  return updated[0];
}

/**
 * Auto-closes any open multiplier position that has hit its stop-out level, so
 * the platform isn't exposed beyond the staked amount even if the user never
 * closes manually. Best-effort.
 */
export async function settleStopOuts(userId: number): Promise<void> {
  const sql = db();
  const open = (await sql`
    SELECT * FROM abetrade_trades
    WHERE user_id = ${userId} AND status = 'open' AND kind = 'mult'
    ORDER BY id ASC
    LIMIT 25
  `) as TradeRow[];

  for (const t of open) {
    try {
      const px = await getLatestTick(t.symbol);
      const so = Number(t.stop_out_price);
      const stopped =
        t.direction === "up" ? px.price <= so : px.price >= so;
      if (stopped) await closeMultiplier(t, px);
    } catch {
      /* retry next call */
    }
  }
}
