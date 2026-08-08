import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { callbackToken } from "@/lib/mpesa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Safaricom calls this if the B2C request times out in their queue. We do NOT
// auto-refund here (the payout may still have gone through) — we flag the
// pending withdrawal so an admin can reconcile it from the admin panel.
export async function POST(req: Request) {
  const token = callbackToken();
  if (token) {
    const url = new URL(req.url);
    if (url.searchParams.get("token") !== token) {
      return NextResponse.json({ ResultCode: 0, ResultDesc: "Ignored" });
    }
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  const result = payload?.Result || {};
  const conversationId: string | undefined = result?.ConversationID;
  const originatorId: string | undefined = result?.OriginatorConversationID;

  if (conversationId || originatorId) {
    await ensureSchema();
    const sql = db();
    await sql`
      UPDATE transactions
      SET note = 'B2C queue timeout — needs review'
      WHERE (provider_ref = ${conversationId ?? ""} OR provider_ref = ${originatorId ?? ""})
        AND type = 'withdrawal' AND status = 'pending'
    `;
  }

  return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
}
