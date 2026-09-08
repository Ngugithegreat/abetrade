import { NextResponse } from "next/server";
import { db, ensureSchema, hasDb } from "@/lib/db";
import { marketBySymbol } from "@/lib/markets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public, anonymized recent wins for the landing-page ticker (social proof).
// Never exposes full names, emails or account numbers — first name + initial only.
function anonymize(name: string): string {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "A trader";
  const first = parts[0];
  const initial = parts[1] ? ` ${parts[1][0].toUpperCase()}.` : "";
  return first.charAt(0).toUpperCase() + first.slice(1) + initial;
}

export async function GET() {
  if (!hasDb()) return NextResponse.json({ wins: [] });
  try {
    await ensureSchema();
    const sql = db();
    const rows = (await sql`
      SELECT t.payout, t.stake, t.symbol, u.name
      FROM abetrade_trades t
      JOIN abetrade_users u ON u.id = t.user_id
      WHERE t.status = 'won' AND t.is_demo = false AND t.payout > t.stake
      ORDER BY t.settled_at DESC NULLS LAST
      LIMIT 24
    `) as Array<{ payout: number | string; stake: number | string; symbol: string; name: string }>;

    const wins = rows.map((r) => ({
      name: anonymize(r.name),
      profitCents: Number(r.payout) - Number(r.stake),
      market: marketBySymbol(r.symbol)?.short ?? r.symbol,
    }));
    return NextResponse.json({ wins });
  } catch {
    return NextResponse.json({ wins: [] });
  }
}
