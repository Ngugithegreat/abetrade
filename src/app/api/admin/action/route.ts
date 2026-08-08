import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { isAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Approve or reject a pending deposit/withdrawal.
export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const id = Number(body.id);
  const action = String(body.action);
  if (!Number.isFinite(id) || (action !== "approve" && action !== "reject")) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  await ensureSchema();
  const sql = db();

  // Claim the pending row atomically so it can't be actioned twice.
  const newStatus = action === "approve" ? "completed" : "rejected";
  const claimed = (await sql`
    UPDATE abetrade_transactions SET status = ${newStatus}
    WHERE id = ${id} AND status = 'pending'
    RETURNING *
  `) as any[];

  if (!claimed.length) {
    return NextResponse.json(
      { error: "Already actioned or not found." },
      { status: 409 }
    );
  }
  const tx = claimed[0];
  const amount = Number(tx.amount); // deposits positive, withdrawals negative

  if (tx.type === "deposit" && action === "approve") {
    // Credit the user now.
    await sql`UPDATE abetrade_users SET balance = balance + ${amount} WHERE id = ${tx.user_id}`;
  } else if (tx.type === "withdrawal" && action === "reject") {
    // Refund the reserved funds (amount is negative, so subtract to add back).
    await sql`UPDATE abetrade_users SET balance = balance - ${amount} WHERE id = ${tx.user_id}`;
  }
  // deposit+reject: nothing was credited, nothing to undo.
  // withdrawal+approve: funds already reserved; admin pays out off-platform.

  return NextResponse.json({ ok: true, transaction: tx });
}
