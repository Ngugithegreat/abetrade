import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import {
  ipnToken,
  siteCode,
  siteFromRef,
  ipnRoutes,
  verifyCallbackSignature,
  dusupayIsCompleted,
  dusupayIsFailed,
} from "@/lib/dusupay";
import { creditPendingDeposit, rejectPendingDeposit } from "@/lib/deposits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Central payment-notification endpoint. Deliberately neutral: the path is an
// opaque token and reveals nothing about the rail, the method, or the brand.
// One shared DusuPay account posts here for every site; we route each result to
// the site that owns it by the merchant_reference prefix. Two layers of auth:
// the unguessable path token (first gate) and the HMAC signature (real auth).
// We always return 200 so the provider's activation probe passes; only signed,
// on-file transactions are ever acted on.
export async function POST(
  req: Request,
  { params }: { params: { token: string } }
) {
  const expected = ipnToken();
  if (!expected || params.token !== expected) {
    return NextResponse.json({ ok: true }); // bad/absent token → ignore
  }

  const raw = await req.text();
  let ev: any;
  try {
    ev = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }

  // DusuPay may nest the fields under `data`; read from either level.
  const d = ev?.data && typeof ev.data === "object" ? ev.data : ev;
  const payload = {
    event: String(ev?.event ?? d?.event ?? ""),
    merchant_reference: String(d?.merchant_reference ?? ev?.merchant_reference ?? ""),
    internal_reference: String(d?.internal_reference ?? ev?.internal_reference ?? ""),
    transaction_type: String(d?.transaction_type ?? ev?.transaction_type ?? ""),
    transaction_status: String(d?.transaction_status ?? ev?.transaction_status ?? ""),
  };

  const sigHeader = req.headers.get("hmac-signature");
  if (!verifyCallbackSignature(payload, sigHeader)) {
    return NextResponse.json({ ok: true }); // unsigned/forged → ignore
  }

  const owner = siteFromRef(payload.merchant_reference);

  // Not ours → forward the identical signed request to the owning site, which
  // re-verifies and settles against its own database. The x-ipn-forwarded guard
  // prevents any forwarding loop.
  if (owner && owner !== siteCode()) {
    if (!req.headers.get("x-ipn-forwarded")) {
      const dest = ipnRoutes()[owner];
      if (dest) {
        try {
          await fetch(`${dest.replace(/\/$/, "")}/api/ipn/${expected}`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "hmac-signature": sigHeader || "",
              "x-ipn-forwarded": "1",
            },
            body: raw,
          });
        } catch {
          /* best-effort; provider retries, and the per-user/cron reconcile backstops it */
        }
      }
    }
    return NextResponse.json({ ok: true });
  }

  // Ours → settle. Keyed on internal_reference (stored as provider_ref).
  await ensureSchema();
  const sql = db();
  const type = payload.transaction_type.toUpperCase();
  const ref = payload.internal_reference;
  if (!ref) return NextResponse.json({ ok: true });

  if (type === "COLLECTION") {
    if (dusupayIsCompleted(payload.transaction_status)) {
      await creditPendingDeposit(ref, { receipt: ref, note: "Wallet top-up received" });
    } else if (dusupayIsFailed(payload.transaction_status)) {
      await rejectPendingDeposit(ref, "Payment failed");
    }
    // any non-terminal status → leave pending
  } else if (type === "PAYOUT") {
    if (dusupayIsCompleted(payload.transaction_status)) {
      await sql`
        UPDATE abetrade_transactions
        SET status = 'completed', note = 'Payout completed'
        WHERE provider_ref = ${ref} AND type = 'withdrawal' AND status = 'pending'
      `;
    } else if (dusupayIsFailed(payload.transaction_status)) {
      const rows = (await sql`
        UPDATE abetrade_transactions
        SET status = 'rejected', note = 'Payout failed — refunded'
        WHERE provider_ref = ${ref} AND type = 'withdrawal' AND status = 'pending'
        RETURNING user_id, amount
      `) as Array<{ user_id: number; amount: string | number }>;
      if (rows.length) {
        const refund = Math.abs(Number(rows[0].amount));
        await sql`UPDATE abetrade_users SET balance = balance + ${refund} WHERE id = ${rows[0].user_id}`;
      }
    }
  }

  return NextResponse.json({ ok: true });
}
