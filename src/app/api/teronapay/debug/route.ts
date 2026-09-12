import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getPayout } from "@/lib/teronapay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// TEMPORARY diagnostic: confirms a payout id can now be read from TeronaPay with
// the correct currency account (X-Account-No). Session-gated, read-only.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const kes = await getPayout(id, "KES");
  const noAcct = await getPayout(id, undefined);
  return NextResponse.json({ id, kes, noAcct });
}
