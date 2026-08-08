import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  await ensureSchema();
  const sql = db();

  const [pending, users, stats] = await Promise.all([
    sql`
      SELECT t.*, u.email, u.name AS user_name
      FROM transactions t JOIN users u ON u.id = t.user_id
      WHERE t.status = 'pending'
      ORDER BY t.created_at ASC
    ` as Promise<any[]>,
    sql`SELECT id, name, email, role, balance, created_at FROM users ORDER BY created_at DESC LIMIT 100` as Promise<any[]>,
    sql`
      SELECT
        (SELECT COUNT(*) FROM users) AS user_count,
        (SELECT COALESCE(SUM(balance),0) FROM users) AS total_balance,
        (SELECT COUNT(*) FROM trades) AS trade_count
    ` as Promise<any[]>,
  ]);

  return NextResponse.json({
    pending,
    users: users.map((u) => ({ ...u, balance: Number(u.balance) })),
    stats: stats[0],
  });
}
