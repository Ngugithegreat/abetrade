import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { cents } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Creates a PENDING deposit. Money is only credited when an admin approves it
// in /admin (or, later, when an automated PaymentProvider confirms collection).
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
    return NextResponse.json({ error: "Minimum deposit is $1.00." }, { status: 400 });
  }
  if (amount > 100000000) {
    return NextResponse.json({ error: "Amount too large." }, { status: 400 });
  }

  await ensureSchema();
  const sql = db();
  const rows = (await sql`
    INSERT INTO transactions (user_id, type, amount, status, method, reference, note)
    VALUES (${session.id}, 'deposit', ${amount}, 'pending', ${method}, ${reference}, 'Deposit request')
    RETURNING *
  `) as any[];

  return NextResponse.json({ ok: true, transaction: rows[0] });
}
