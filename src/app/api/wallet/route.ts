import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { accountNo } from "@/lib/format";
import { referralStats } from "@/lib/referral";
import { settleExpiredTrades, settleStopOuts } from "@/lib/trades";
import { isMpesaConfigured, isB2cConfigured, usdKesRate } from "@/lib/mpesa";
import { isPaystackConfigured } from "@/lib/paystack";
import { isCryptoConfigured } from "@/lib/crypto-pay";
import { isCollectoConfigured, usdUgxRate } from "@/lib/collecto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  await ensureSchema();

  // Opportunistically settle expired Rise/Fall trades and stopped-out multipliers.
  try {
    await Promise.all([
      settleExpiredTrades(session.id),
      settleStopOuts(session.id),
    ]);
  } catch {
    /* non-fatal */
  }

  const sql = db();
  const [userRows, txns, openTrades, closedTrades, refStats] = await Promise.all([
    sql`SELECT id, name, email, role, balance, country, status, kyc_status, kyc_reason FROM abetrade_users WHERE id = ${session.id}` as Promise<any[]>,
    sql`SELECT * FROM abetrade_transactions WHERE user_id = ${session.id} ORDER BY created_at DESC LIMIT 40` as Promise<any[]>,
    sql`SELECT * FROM abetrade_trades WHERE user_id = ${session.id} AND status = 'open' ORDER BY created_at DESC` as Promise<any[]>,
    sql`SELECT * FROM abetrade_trades WHERE user_id = ${session.id} AND status != 'open' ORDER BY created_at DESC LIMIT 40` as Promise<any[]>,
    referralStats(session.id),
  ]);

  const u = userRows[0];
  return NextResponse.json({
    user: u ? { ...u, balance: Number(u.balance), account_no: accountNo(u.id) } : null,
    transactions: txns,
    openTrades,
    closedTrades,
    referral: u
      ? { code: accountNo(u.id), referredCount: refStats.referredCount, earnedCents: refStats.earnedCents }
      : null,
    config: {
      mpesaDeposit: isMpesaConfigured(),
      mpesaWithdraw: isB2cConfigured(),
      cardDeposit: isPaystackConfigured(),
      cryptoDeposit: isCryptoConfigured(),
      ugMobileDeposit: isCollectoConfigured(),
      usdKesRate: usdKesRate(),
      usdUgxRate: usdUgxRate(),
    },
  });
}
