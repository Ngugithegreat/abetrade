import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { cents } from "@/lib/format";
import {
  isMpesaConfigured,
  normalizePhone,
  centsToKes,
  stkPush,
  callbackBase,
  callbackToken,
} from "@/lib/mpesa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Deposit. If method is 'mpesa' and Daraja is configured, an STK Push prompt is
// sent to the customer's phone and the transaction stays 'pending' until the
// M-Pesa callback confirms it. Otherwise it's a manual request an admin approves.
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

  // ---- Automated M-Pesa deposit via STK Push ----
  if (method === "mpesa" && isMpesaConfigured()) {
    const phone = normalizePhone(reference);
    if (!phone) {
      return NextResponse.json(
        { error: "Enter a valid M-Pesa phone number (e.g. 0712345678)." },
        { status: 400 }
      );
    }
    const amountKes = centsToKes(amount);

    try {
      const cbBase = callbackBase(req.url);
      const token = callbackToken();
      const callbackUrl = `${cbBase}/api/mpesa/stk-callback${
        token ? `?token=${encodeURIComponent(token)}` : ""
      }`;

      const stk = await stkPush({
        phone,
        amountKes,
        accountRef: `AT${session.id}`,
        description: "AbeTrade deposit",
        callbackUrl,
      });

      const rows = (await sql`
        INSERT INTO abetrade_transactions
          (user_id, type, amount, status, method, reference, provider_ref, note)
        VALUES
          (${session.id}, 'deposit', ${amount}, 'pending', 'mpesa', ${phone},
           ${stk.CheckoutRequestID}, ${"STK push sent · KES " + amountKes})
        RETURNING *
      `) as any[];

      return NextResponse.json({
        ok: true,
        mpesa: true,
        amountKes,
        transaction: rows[0],
        message: "Check your phone and enter your M-Pesa PIN to complete the deposit.",
      });
    } catch (e: any) {
      return NextResponse.json(
        { error: e?.message || "Could not start the M-Pesa prompt. Try again." },
        { status: 502 }
      );
    }
  }

  // ---- Manual deposit (admin approval) ----
  const rows = (await sql`
    INSERT INTO abetrade_transactions (user_id, type, amount, status, method, reference, note)
    VALUES (${session.id}, 'deposit', ${amount}, 'pending', ${method}, ${reference}, 'Deposit request')
    RETURNING *
  `) as any[];

  return NextResponse.json({ ok: true, transaction: rows[0] });
}
