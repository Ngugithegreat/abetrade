import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { b2cDiagnostics } from "@/lib/mpesa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// TEMPORARY diagnostic: tells exactly which B2C credential is failing. Session-
// gated; never returns any secret VALUE (only presence, lengths, non-secret
// fields, and the OAuth test result), plus the last few Daraja failure reasons.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const diag = await b2cDiagnostics();

  const sql = db();
  const recentFailures = (await sql`
    SELECT note, created_at FROM abetrade_transactions
    WHERE type = 'withdrawal' AND status = 'rejected'
    ORDER BY created_at DESC LIMIT 5
  `) as Array<{ note: string | null; created_at: string }>;

  return NextResponse.json({ b2c: diag, recentPayoutFailures: recentFailures });
}
