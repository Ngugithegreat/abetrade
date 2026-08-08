import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { settleExpiredTrades } from "@/lib/trades";
import { isMpesaConfigured, isB2cConfigured, usdKesRate } from "@/lib/mpesa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  await ensureSchema();

  // Opportunistically settle anything that has expired.
  try {
    await settleExpiredTrades(session.id);
  } catch {
    /* non-fatal */
  }

  const sql = db();
  const [userRows, txns, openTrades, closedTrades] = await Promise.all([
    sql`SELECT id, name, email, role, balance FROM users WHERE id = ${session.id}` as Promise<any[]>,
    sql`SELECT * FROM transactions WHERE user_id = ${session.id} ORDER BY created_at DESC LIMIT 40` as Promise<any[]>,
    sql`SELECT * FROM trades WHERE user_id = ${session.id} AND status = 'open' ORDER BY created_at DESC` as Promise<any[]>,
    sql`SELECT * FROM trades WHERE user_id = ${session.id} AND status != 'open' ORDER BY created_at DESC LIMIT 40` as Promise<any[]>,
  ]);

  const u = userRows[0];
  return NextResponse.json({
    user: u ? { ...u, balance: Number(u.balance) } : null,
    transactions: txns,
    openTrades,
    closedTrades,
    config: {
      mpesaDeposit: isMpesaConfigured(),
      mpesaWithdraw: isB2cConfigured(),
      usdKesRate: usdKesRate(),
    },
  });
}
