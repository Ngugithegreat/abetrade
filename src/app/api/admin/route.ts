import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { getHouseEdge, getReferralPct, getMaxStakeCents, getMaxPayoutCents } from "@/lib/settings";
import { accountNo } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  await ensureSchema();
  const sql = db();

  const [pending, users, kpi, daily, topUsers, kycPending] = await Promise.all([
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
        (SELECT COALESCE(SUM(amount),0) FROM abetrade_transactions WHERE type='trade_payout') AS payout_total,
        (SELECT COALESCE(SUM(amount),0) FROM abetrade_transactions WHERE type='bonus' AND amount > 0) AS bonus_issued,
        (SELECT COALESCE(SUM(bonus_locked),0) FROM abetrade_users) AS bonus_locked
    ` as Promise<any[]>,
    sql`
      SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
             COALESCE(SUM(-amount),0) AS volume
      FROM abetrade_transactions
      WHERE type='trade_stake' AND created_at > now() - interval '14 days'
      GROUP BY 1 ORDER BY 1
    ` as Promise<any[]>,
    sql`
      SELECT u.id, u.name, u.email, u.balance, u.status, u.promo, u.created_at,
        COALESCE(SUM(CASE WHEN t.status='won' THEN t.payout - t.stake
                          WHEN t.status='lost' THEN -t.stake ELSE 0 END),0) AS pnl,
        COUNT(t.id) FILTER (WHERE t.status != 'open') AS trades
      FROM abetrade_users u
      LEFT JOIN abetrade_trades t ON t.user_id = u.id
      GROUP BY u.id
      ORDER BY trades DESC NULLS LAST, u.created_at DESC
      LIMIT 40
    ` as Promise<any[]>,
    sql`
      SELECT id, name, email, kyc_name, kyc_id_number, kyc_phone, kyc_submitted_at
      FROM abetrade_users
      WHERE kyc_status = 'pending'
      ORDER BY kyc_submitted_at ASC NULLS LAST
      LIMIT 50
    ` as Promise<any[]>,
  ]);

  const [houseEdge, referralPct, maxStakeCents, maxPayoutCents] = await Promise.all([
    getHouseEdge(),
    getReferralPct(),
    getMaxStakeCents(),
    getMaxPayoutCents(),
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
      bonusIssued: num(k.bonus_issued),
      bonusLocked: num(k.bonus_locked),
      // Real money the company actually holds: deposits in minus withdrawals out.
      netCash: num(k.deposits_total) - num(k.withdrawals_total),
    },
    daily: daily.map((d) => ({ day: d.day, volume: num(d.volume) })),
    houseEdge, // fraction, e.g. 0.05
    referralPct, // fraction, e.g. 0.10
    maxStakeCents,
    maxPayoutCents,
    kyc: kycPending.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      account_no: accountNo(u.id),
      kyc_name: u.kyc_name,
      kyc_id_number: u.kyc_id_number,
      kyc_phone: u.kyc_phone,
    })),
    topUsers: topUsers.map((u) => ({
      ...u,
      account_no: accountNo(u.id),
      status: u.status || "active",
      promo: !!u.promo,
      balance: num(u.balance),
      pnl: num(u.pnl),
      trades: num(u.trades),
    })),
  });
}
