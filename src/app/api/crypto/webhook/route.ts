import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { verifyIpnSignature } from "@/lib/crypto-pay";
import { creditPendingDeposit, rejectPendingDeposit } from "@/lib/deposits";
import { callbackToken } from "@/lib/mpesa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// NOWPayments IPN. Verified by HMAC signature (and an optional URL token).
// Credits the deposit only when the on-chain payment is confirmed/finished.
export async function POST(req: Request) {
  const token = callbackToken();
  if (token) {
    const url = new URL(req.url);
    if (url.searchParams.get("token") !== token) {
      return NextResponse.json({ ok: true });
    }
  }

  const raw = await req.text();
  const signature = req.headers.get("x-nowpayments-sig");
  if (!verifyIpnSignature(raw, signature)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let ipn: any;
  try {
    ipn = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }

  const orderId: string | undefined = ipn?.order_id;
  const status: string = String(ipn?.payment_status || "");
  if (!orderId) return NextResponse.json({ ok: true });

  await ensureSchema();

  if (status === "finished" || status === "confirmed") {
    await creditPendingDeposit(orderId, {
      receipt: ipn?.payment_id ? String(ipn.payment_id) : null,
      note: "Crypto deposit confirmed",
    });
  } else if (status === "failed" || status === "expired" || status === "refunded") {
    await rejectPendingDeposit(orderId, `Crypto payment ${status}`);
  }
  // partially_paid / waiting / confirming -> leave pending

  return NextResponse.json({ ok: true });
}
