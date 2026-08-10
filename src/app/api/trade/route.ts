import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getLatestTick } from "@/lib/deriv-server";
import {
  MARKETS,
  DURATIONS,
  MULTIPLIERS,
  DIGIT_TICKS,
  PAYOUT_MULTIPLIER,
  MIN_STAKE,
  MAX_STAKE,
  stopOutPrice,
  marketBySymbol,
  digitPayoutMult,
  DigitSubtype,
} from "@/lib/markets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const KINDS = ["rise_fall", "mult", "digit"];

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

  const kind = KINDS.includes(body.kind) ? body.kind : "rise_fall";
  const symbol = String(body.symbol || "");
  const direction = String(body.direction || "");
  const stake = Math.round(Number(body.stake));

  const market = marketBySymbol(symbol);
  if (!market) {
    return NextResponse.json({ error: "Unknown market." }, { status: 400 });
  }
  if (!Number.isFinite(stake) || stake < MIN_STAKE || stake > MAX_STAKE) {
    return NextResponse.json({ error: "Stake is outside the allowed range." }, { status: 400 });
  }

  // Contract-specific validation.
  let duration = 0; // seconds until expiry
  let multiplier: number | null = null;
  let subtype: DigitSubtype | null = null;
  let barrier: number | null = null;
  let payoutMult = PAYOUT_MULTIPLIER;

  if (kind === "rise_fall") {
    if (direction !== "rise" && direction !== "fall") {
      return NextResponse.json({ error: "Direction must be rise or fall." }, { status: 400 });
    }
    duration = Math.round(Number(body.duration));
    if (!DURATIONS.some((d) => d.seconds === duration)) {
      return NextResponse.json({ error: "Unsupported duration." }, { status: 400 });
    }
  } else if (kind === "mult") {
    if (direction !== "up" && direction !== "down") {
      return NextResponse.json({ error: "Direction must be up or down." }, { status: 400 });
    }
    multiplier = Math.round(Number(body.multiplier));
    if (!MULTIPLIERS.includes(multiplier)) {
      return NextResponse.json({ error: "Unsupported multiplier." }, { status: 400 });
    }
  } else {
    // digit
    subtype = body.subtype as DigitSubtype;
    if (!["even_odd", "over_under", "matches_differs"].includes(subtype)) {
      return NextResponse.json({ error: "Unknown digit contract." }, { status: 400 });
    }
    barrier = Math.round(Number(body.barrier ?? 0));
    if (subtype === "even_odd") {
      if (direction !== "even" && direction !== "odd")
        return NextResponse.json({ error: "Pick even or odd." }, { status: 400 });
      barrier = 0;
    } else if (subtype === "over_under") {
      if (direction !== "over" && direction !== "under")
        return NextResponse.json({ error: "Pick over or under." }, { status: 400 });
      if (barrier < 0 || barrier > 9)
        return NextResponse.json({ error: "Barrier must be 0-9." }, { status: 400 });
      if (direction === "over" && barrier > 8)
        return NextResponse.json({ error: "Over barrier must be 0-8." }, { status: 400 });
      if (direction === "under" && barrier < 1)
        return NextResponse.json({ error: "Under barrier must be 1-9." }, { status: 400 });
    } else {
      if (direction !== "matches" && direction !== "differs")
        return NextResponse.json({ error: "Pick matches or differs." }, { status: 400 });
      if (barrier < 0 || barrier > 9)
        return NextResponse.json({ error: "Digit must be 0-9." }, { status: 400 });
    }
    const ticks = Math.round(Number(body.ticks));
    if (!DIGIT_TICKS.includes(ticks)) {
      return NextResponse.json({ error: "Unsupported duration." }, { status: 400 });
    }
    duration = ticks * market.tickSeconds;
    payoutMult = digitPayoutMult(subtype, direction, barrier);
  }

  await ensureSchema();
  const sql = db();

  let entry;
  try {
    entry = await getLatestTick(symbol);
  } catch (e: any) {
    return NextResponse.json(
      { error: `Couldn't reach the price feed. Try again. [${e?.message || "no response"}]` },
      { status: 503 }
    );
  }

  const debit = (await sql`
    UPDATE abetrade_users SET balance = balance - ${stake}
    WHERE id = ${session.id} AND balance >= ${stake}
    RETURNING balance
  `) as Array<{ balance: string | number }>;

  if (!debit.length) {
    return NextResponse.json({ error: "Insufficient balance." }, { status: 402 });
  }
  const newBalance = Number(debit[0].balance);

  let rows: any[];
  if (kind === "rise_fall") {
    const payout = Math.round(stake * PAYOUT_MULTIPLIER);
    const expiry = entry.epoch + duration;
    rows = (await sql`
      INSERT INTO abetrade_trades
        (user_id, kind, symbol, direction, stake, payout, entry_price, entry_epoch, expiry_epoch, status)
      VALUES
        (${session.id}, 'rise_fall', ${symbol}, ${direction}, ${stake}, ${payout},
         ${entry.price}, ${entry.epoch}, ${expiry}, 'open')
      RETURNING *
    `) as any[];
  } else if (kind === "mult") {
    const so = stopOutPrice(direction as "up" | "down", entry.price, multiplier!);
    rows = (await sql`
      INSERT INTO abetrade_trades
        (user_id, kind, symbol, direction, stake, payout, multiplier, entry_price,
         entry_epoch, expiry_epoch, stop_out_price, status)
      VALUES
        (${session.id}, 'mult', ${symbol}, ${direction}, ${stake}, 0, ${multiplier},
         ${entry.price}, ${entry.epoch}, 0, ${so}, 'open')
      RETURNING *
    `) as any[];
  } else {
    const payout = Math.round(stake * payoutMult);
    const expiry = entry.epoch + duration;
    rows = (await sql`
      INSERT INTO abetrade_trades
        (user_id, kind, symbol, direction, stake, payout, entry_price, entry_epoch,
         expiry_epoch, status, subtype, prediction, barrier)
      VALUES
        (${session.id}, 'digit', ${symbol}, ${direction}, ${stake}, ${payout},
         ${entry.price}, ${entry.epoch}, ${expiry}, 'open', ${subtype}, ${direction}, ${barrier})
      RETURNING *
    `) as any[];
  }

  await sql`
    INSERT INTO abetrade_transactions (user_id, type, amount, status, method, note)
    VALUES (${session.id}, 'trade_stake', ${-stake}, 'completed', 'trade', ${
      symbol + " " + direction
    })
  `;

  return NextResponse.json({ ok: true, trade: rows[0], balance: newBalance });
}
