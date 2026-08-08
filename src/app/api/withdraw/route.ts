import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { cents } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Creates a PENDING withdrawal and immediately RESERVES the funds (debits the
// balance) so they can't be spent twice. If an admin rejects it, the funds are
// refunded (see /api/admin/action).
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const amount = cents(Number(body.amount));
  const method = String(body.method || "manual");
  const reference = String(body.reference || "").trim();

  if (!Number.isFinite(amount) || amount < 100) {
    return NextResponse.json({ error: "Minimum withdrawal is $1.00." }, { status: 400 });
  }
  if (!reference) {
    return NextResponse.json(
      { error: "Enter where to send the money (phone / address / account)." },
      { status: 400 }
    );
  }

  await ensureSchema();
  const sql = db();

  // Reserve funds atomically.
  const debit = (await sql`
    UPDATE users SET balance = balance - ${amount}
    WHERE id = ${session.id} AND balance >= ${amount}
    RETURNING balance
  `) as any[];

  if (!debit.length) {
    return NextResponse.json({ error: "Insufficient balance." }, { status: 402 });
  }

  const rows = (await sql`
    INSERT INTO transactions (user_id, type, amount, status, method, reference, note)
    VALUES (${session.id}, 'withdrawal', ${-amount}, 'pending', ${method}, ${reference}, 'Withdrawal request')
    RETURNING *
  `) as any[];

  return NextResponse.json({
    ok: true,
    transaction: rows[0],
    balance: Number(debit[0].balance),
  });
}
