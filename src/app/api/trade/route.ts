import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getLatestTick } from "@/lib/deriv-server";
import {
  MARKETS,
  DURATIONS,
  PAYOUT_MULTIPLIER,
  MIN_STAKE,
  MAX_STAKE,
} from "@/lib/markets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Please sign in to trade." }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const symbol = String(body.symbol || "");
  const direction = String(body.direction || "");
  const stake = Math.round(Number(body.stake));
  const duration = Math.round(Number(body.duration));

  if (!MARKETS.some((m) => m.symbol === symbol)) {
    return NextResponse.json({ error: "Unknown market." }, { status: 400 });
  }
  if (direction !== "rise" && direction !== "fall") {
    return NextResponse.json({ error: "Direction must be rise or fall." }, { status: 400 });
  }
  if (!Number.isFinite(stake) || stake < MIN_STAKE || stake > MAX_STAKE) {
    return NextResponse.json({ error: "Stake is outside the allowed range." }, { status: 400 });
  }
  if (!DURATIONS.some((d) => d.seconds === duration)) {
    return NextResponse.json({ error: "Unsupported duration." }, { status: 400 });
  }

  await ensureSchema();
  const sql = db();

  // Real entry price from Deriv.
  let entry;
  try {
    entry = await getLatestTick(symbol);
  } catch {
    return NextResponse.json(
      { error: "Couldn't reach the price feed. Try again." },
      { status: 503 }
    );
  }

  // Atomic debit — fails cleanly if the user can't cover the stake.
  const debit = (await sql`
    UPDATE users SET balance = balance - ${stake}
    WHERE id = ${session.id} AND balance >= ${stake}
    RETURNING balance
  `) as Array<{ balance: string | number }>;

  if (!debit.length) {
    return NextResponse.json({ error: "Insufficient balance." }, { status: 402 });
  }
  const newBalance = Number(debit[0].balance);

  const payout = Math.round(stake * PAYOUT_MULTIPLIER);
  const expiry = entry.epoch + duration;

  const rows = (await sql`
    INSERT INTO trades
      (user_id, symbol, direction, stake, payout, entry_price, entry_epoch, expiry_epoch, status)
    VALUES
      (${session.id}, ${symbol}, ${direction}, ${stake}, ${payout},
       ${entry.price}, ${entry.epoch}, ${expiry}, 'open')
    RETURNING *
  `) as any[];

  await sql`
    INSERT INTO transactions (user_id, type, amount, status, method, note)
    VALUES (${session.id}, 'trade_stake', ${-stake}, 'completed', 'trade', ${
      symbol + " " + direction
    })
  `;

  return NextResponse.json({ ok: true, trade: rows[0], balance: newBalance });
}
