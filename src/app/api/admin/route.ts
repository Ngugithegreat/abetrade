import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { isAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  await ensureSchema();
  const sql = db();

  const [pending, users, kpi, daily, topUsers] = await Promise.all([
    sql`
      SELECT t.*, u.email, u.name AS user_name
      FROM abetrade_transactions t JOIN abetrade_users u ON u.id = t.user_id
      WHERE t.status = 'pending'
      ORDER BY t.created_at ASC
    ` as Promise<any[]>,
    sql`SELECT id, name, email, role, balance, created_at FROM abetrade_users ORDER BY created_at DESC LIMIT 100` as Promise<any[]>,
    sql`
      SELECT
        (SELECT COUNT(*) FROM abetrade_users) AS user_count,
        (SELECT COALESCE(SUM(balance),0) FROM abetrade_users) AS total_balance,
        (SELECT COUNT(*) FROM abetrade_trades) AS trade_count,
        (SELECT COUNT(*) FROM abetrade_trades WHERE status = 'won') AS won_count,
        (SELECT COUNT(*) FROM abetrade_trades WHERE status = 'lost') AS lost_count,
        (SELECT COALESCE(SUM(amount),0) FROM abetrade_transactions WHERE type='deposit' AND status='completed') AS deposits_total,
        (SELECT COALESCE(SUM(-amount),0) FROM abetrade_transactions WHERE type='withdrawal' AND status='completed') AS withdrawals_total,
        (SELECT COUNT(*) FROM abetrade_transactions WHERE type='deposit' AND status='pending') AS deposits_pending,
        (SELECT COUNT(*) FROM abetrade_transactions WHERE type='withdrawal' AND status='pending') AS withdrawals_pending,
        (SELECT COALESCE(SUM(-amount),0) FROM abetrade_transactions WHERE type='trade_stake') AS staked_total,
        (SELECT COALESCE(SUM(amount),0) FROM abetrade_transactions WHERE type='trade_payout') AS payout_total
    ` as Promise<any[]>,
    sql`
      SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
             COALESCE(SUM(-amount),0) AS volume
      FROM abetrade_transactions
      WHERE type='trade_stake' AND created_at > now() - interval '14 days'
      GROUP BY 1 ORDER BY 1
    ` as Promise<any[]>,
    sql`
      SELECT u.id, u.name, u.email, u.balance,
        COALESCE(SUM(CASE WHEN t.status='won' THEN t.payout - t.stake
                          WHEN t.status='lost' THEN -t.stake ELSE 0 END),0) AS pnl,
        COUNT(t.id) FILTER (WHERE t.status != 'open') AS trades
      FROM abetrade_users u
      LEFT JOIN abetrade_trades t ON t.user_id = u.id
      GROUP BY u.id
      ORDER BY trades DESC NULLS LAST
      LIMIT 12
    ` as Promise<any[]>,
  ]);

  const k = kpi[0] || {};
  const num = (v: any) => Number(v ?? 0);

  return NextResponse.json({
    pending,
    users: users.map((u) => ({ ...u, balance: num(u.balance) })),
    kpi: {
      userCount: num(k.user_count),
      totalBalance: num(k.total_balance),
      tradeCount: num(k.trade_count),
      wonCount: num(k.won_count),
      lostCount: num(k.lost_count),
      depositsTotal: num(k.deposits_total),
      withdrawalsTotal: num(k.withdrawals_total),
      depositsPending: num(k.deposits_pending),
      withdrawalsPending: num(k.withdrawals_pending),
      stakedTotal: num(k.staked_total),
      payoutTotal: num(k.payout_total),
      houseProfit: num(k.staked_total) - num(k.payout_total),
    },
    daily: daily.map((d) => ({ day: d.day, volume: num(d.volume) })),
    topUsers: topUsers.map((u) => ({
      ...u,
      balance: num(u.balance),
      pnl: num(u.pnl),
      trades: num(u.trades),
    })),
    // Payment setup diagnostics — booleans only, NEVER the secret values.
    setup: {
      mpesa: {
        MPESA_CONSUMER_KEY: !!process.env.MPESA_CONSUMER_KEY,
        MPESA_CONSUMER_SECRET: !!process.env.MPESA_CONSUMER_SECRET,
        MPESA_SHORTCODE: !!process.env.MPESA_SHORTCODE,
        MPESA_PASSKEY: !!process.env.MPESA_PASSKEY,
        MPESA_ENV: process.env.MPESA_ENV || "sandbox",
        deposits_ready:
          !!process.env.MPESA_CONSUMER_KEY &&
          !!process.env.MPESA_CONSUMER_SECRET &&
          !!process.env.MPESA_SHORTCODE &&
          !!process.env.MPESA_PASSKEY,
        MPESA_INITIATOR_NAME: !!process.env.MPESA_INITIATOR_NAME,
        MPESA_SECURITY_CREDENTIAL: !!process.env.MPESA_SECURITY_CREDENTIAL,
      },
      shared: {
        PUBLIC_BASE_URL: !!(process.env.PUBLIC_BASE_URL || process.env.MPESA_CALLBACK_BASE_URL),
        MPESA_CALLBACK_SECRET: !!process.env.MPESA_CALLBACK_SECRET,
      },
      card_bank: { PAYSTACK_SECRET_KEY: !!process.env.PAYSTACK_SECRET_KEY },
      crypto: {
        NOWPAYMENTS_API_KEY: !!process.env.NOWPAYMENTS_API_KEY,
        NOWPAYMENTS_IPN_SECRET: !!process.env.NOWPAYMENTS_IPN_SECRET,
      },
      uganda: {
        COLLECTO_USERNAME: !!process.env.COLLECTO_USERNAME,
        COLLECTO_BASE_URL: !!process.env.COLLECTO_BASE_URL,
        COLLECTO_RELAY_SECRET: !!process.env.COLLECTO_RELAY_SECRET,
        COLLECTO_API_KEY: !!process.env.COLLECTO_API_KEY,
      },
    },
  });
}
