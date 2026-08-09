import { createHmac } from "crypto";

// Crypto deposits via NOWPayments (hosted invoice + signed IPN webhook).
// Priced directly in USD, so no FX conversion — the user pays USDT/BTC/etc.
// and we credit the same USD amount once the payment confirms on-chain.

const BASE = "https://api.nowpayments.io/v1";

export function isCryptoConfigured(): boolean {
  return !!process.env.NOWPAYMENTS_API_KEY;
}

export type CryptoInvoice = {
  id: string;
  invoice_url: string;
};

export async function createInvoice(opts: {
  amountUsd: number;
  orderId: string;
  ipnUrl: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<CryptoInvoice> {
  const res = await fetch(`${BASE}/invoice`, {
    method: "POST",
    headers: {
      "x-api-key": process.env.NOWPAYMENTS_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      price_amount: opts.amountUsd,
      price_currency: "usd",
      order_id: opts.orderId,
      order_description: "AbeTrade deposit",
      ipn_callback_url: opts.ipnUrl,
      success_url: opts.successUrl,
      cancel_url: opts.cancelUrl,
    }),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!json.invoice_url) {
    throw new Error(json.message || "Could not start the crypto payment.");
  }
  return { id: String(json.id), invoice_url: json.invoice_url };
}

// NOWPayments signs IPNs: HMAC-SHA512 of the JSON body with keys sorted
// recursively, using the IPN secret.
function sortDeep(value: any): any {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc: Record<string, any>, k) => {
        acc[k] = sortDeep(value[k]);
        return acc;
      }, {});
  }
  return value;
}

export function verifyIpnSignature(rawBody: string, signature: string | null): boolean {
  const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!ipnSecret || !signature) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return false;
  }
  const sorted = JSON.stringify(sortDeep(parsed));
  const hmac = createHmac("sha512", ipnSecret).update(sorted).digest("hex");
  return hmac === signature;
}
