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

  const [pending, users, stats] = await Promise.all([
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
        (SELECT COUNT(*) FROM abetrade_trades) AS trade_count
    ` as Promise<any[]>,
  ]);

  return NextResponse.json({
    pending,
    users: users.map((u) => ({ ...u, balance: Number(u.balance) })),
    stats: stats[0],
  });
}
