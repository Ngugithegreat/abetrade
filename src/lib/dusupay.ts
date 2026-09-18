import { createHmac, timingSafeEqual, randomBytes } from "crypto";

// DusuPay — pan-African aggregator (collections + payouts) for KES / UGX / TZS
// mobile money. The API is ASYNCHRONOUS: the request is accepted (HTTP 202) and
// the final status arrives later via a callback (see src/app/api/ipn/[token]).
//
// One DusuPay merchant account can serve ALL sites: every request carries a
// `merchant_reference` prefixed with this site's SITE_CODE, and the shared
// central callback routes the result back to the right site by that prefix.
//
// Env:
//   DUSUPAY_PUBLIC_KEY      public key     (header: public-key)
//   DUSUPAY_SECRET_KEY      secret key     (header: secret-key, payouts)
//   DUSUPAY_SIGNING_KEY     signing key    (verifies callback HMAC signatures)
//   DUSUPAY_ENV             "production" | "sandbox"   (default: sandbox)
//   DUSUPAY_IPN_TOKEN       opaque path segment used in the neutral callback URL
//   SITE_CODE               2-char code identifying THIS site in merchant_reference (e.g. "sn")
//   IPN_ROUTES              (hub only) JSON { "<code>": "https://site", ... } to fan callbacks out
//   DUSUPAY_PCODE_<METHOD>  optional provider_code override per method
//   DEPOSIT_PROVIDER / WITHDRAW_PROVIDER / PAYMENT_PROVIDER   rail switch (see *Rail below)

const SANDBOX = "https://sandboxapi.dusupay.com";
const PRODUCTION = "https://payments.dusupay.com";

export function dusupayIsProduction(): boolean {
  return (process.env.DUSUPAY_ENV || "").trim().toLowerCase() === "production";
}
function base(): string {
  return dusupayIsProduction() ? PRODUCTION : SANDBOX;
}

export function isDusupayConfigured(): boolean {
  return !!(
    process.env.DUSUPAY_PUBLIC_KEY &&
    process.env.DUSUPAY_SECRET_KEY &&
    process.env.DUSUPAY_SIGNING_KEY
  );
}
function pub(): string {
  return (process.env.DUSUPAY_PUBLIC_KEY || "").trim();
}
function secretKey(): string {
  return (process.env.DUSUPAY_SECRET_KEY || "").trim();
}
function signingKey(): string {
  return (process.env.DUSUPAY_SIGNING_KEY || "").trim();
}

// This deployment's 2-char site code — the prefix on every merchant_reference,
// and how the shared callback knows which site a result belongs to.
export function siteCode(): string {
  const v = (process.env.SITE_CODE || "sn").trim().toLowerCase().slice(0, 2);
  return v || "sn";
}
export function ipnToken(): string {
  return (process.env.DUSUPAY_IPN_TOKEN || "").trim();
}
export function siteFromRef(ref: string): string {
  return String(ref || "").slice(0, 2).toLowerCase();
}
// merchant_reference = <site code><random hex>, ≥8 chars (DusuPay minimum). The
// site prefix is what the central callback routes on.
export function newMerchantRef(): string {
  return siteCode() + randomBytes(9).toString("hex"); // 2 + 18 = 20 chars
}

// The DusuPay settlement currency for one of our app payment methods.
export function dusupayCurrency(method: string): string {
  const m = String(method).toLowerCase();
  if (m === "mtn" || m === "airtel") return "UGX";
  if (m === "tzmobile") return "TZS";
  return "KES"; // mpesa
}

// provider_code per method. DusuPay uses an <operator>_<country> convention;
// these are the defaults, overridable per method with DUSUPAY_PCODE_<METHOD>
// (e.g. DUSUPAY_PCODE_TZMOBILE=vodacom_tz). Confirm against the payment-options
// endpoint for your account if a code is rejected.
const DEFAULT_PCODE: Record<string, string> = {
  mpesa: "mpesa_ke",
  mtn: "mtn_ug",
  airtel: "airtel_ug",
  tzmobile: "tigopesa_tz",
};
export function dusupayProviderCode(method: string): string {
  const m = String(method).toLowerCase();
  const override = process.env[`DUSUPAY_PCODE_${m.toUpperCase()}`];
  return (override && override.trim()) || DEFAULT_PCODE[m] || "mpesa_ke";
}

type DResult<T> = { ok: true; data: T } | { ok: false; code?: string; error: string };

async function call<T = any>(
  path: string,
  body: unknown,
  withSecret: boolean
): Promise<DResult<T>> {
  if (!isDusupayConfigured()) return { ok: false, error: "Payments not configured." };
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-version": "1",
    "public-key": pub(),
  };
  if (withSecret) headers["secret-key"] = secretKey();
  try {
    const res = await fetch(`${base()}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as any;
    // Success: HTTP 200/202, status "accepted"/"successful", with a data object
    // carrying internal_reference + merchant_reference.
    if (res.ok && (json?.data?.internal_reference || json?.status === "accepted")) {
      return { ok: true, data: json.data as T };
    }
    const rawMsg = json?.message;
    return {
      ok: false,
      code: json?.code != null ? String(json.code) : undefined,
      error: typeof rawMsg === "string" && rawMsg ? rawMsg : `Payment error (HTTP ${res.status}).`,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Could not reach the payment provider." };
  }
}

export type DTxn = {
  internal_reference: string;
  merchant_reference: string;
  transaction_status?: string;
};

// Deposit: charge the customer's mobile money wallet. msisdn is international
// digits with NO plus (e.g. 254712345678).
export function dusupayCreateCollection(opts: {
  merchantReference: string;
  amount: number; // major units (e.g. KES 650)
  currency: string; // KES | UGX | TZS
  providerCode: string;
  msisdn: string;
  description: string;
  customerName?: string;
  customerEmail?: string;
}): Promise<DResult<DTxn>> {
  return call<DTxn>(
    "/collections/initialize",
    {
      merchant_reference: opts.merchantReference,
      transaction_method: "MOBILE_MONEY",
      currency: opts.currency,
      amount: opts.amount,
      provider_code: opts.providerCode,
      msisdn: opts.msisdn,
      description: opts.description,
      customer_name: opts.customerName,
      customer_email: opts.customerEmail,
    },
    false
  );
}

// Withdrawal: send money to the customer's mobile money wallet.
export function dusupayCreatePayout(opts: {
  merchantReference: string;
  amount: number; // major units
  currency: string;
  providerCode: string;
  accountNumber: string; // international digits, no plus
  customerName: string;
  description: string;
}): Promise<DResult<DTxn>> {
  return call<DTxn>(
    "/payout/send-funds",
    {
      merchant_reference: opts.merchantReference,
      transaction_method: "MOBILE_MONEY",
      currency: opts.currency,
      amount: opts.amount,
      provider_code: opts.providerCode,
      account_number: opts.accountNumber,
      customer_name: opts.customerName,
      description: opts.description,
    },
    true
  );
}

// Verify a callback: header `hmac-signature: t=<unix>,s=<hex>`, where the hex is
// HMAC-SHA256 of "event:merchant_reference:internal_reference:transaction_type:
// transaction_status" keyed by the signing key. Forged/unsigned bodies fail here
// and are never acted on.
export function verifyCallbackSignature(
  payload: {
    event?: string;
    merchant_reference?: string;
    internal_reference?: string;
    transaction_type?: string;
    transaction_status?: string;
  },
  header: string | null
): boolean {
  const key = signingKey();
  if (!key || !header) return false;
  const parts = Object.fromEntries(
    String(header)
      .split(",")
      .map((p) => p.split("=").map((s) => s.trim()))
  );
  const sig = parts.s;
  if (!sig) return false;
  const signed = [
    payload.event,
    payload.merchant_reference,
    payload.internal_reference,
    payload.transaction_type,
    payload.transaction_status,
  ].join(":");
  const expected = createHmac("sha256", key).update(signed).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function dusupayIsCompleted(status: string): boolean {
  return String(status).toUpperCase() === "COMPLETED";
}
export function dusupayIsFailed(status: string): boolean {
  return ["FAILED", "CANCELLED", "CANCELED", "REJECTED", "DECLINED", "EXPIRED", "REVERSED"].includes(
    String(status).toUpperCase()
  );
}

// Hub fan-out: code -> base URL. Only the deployment DusuPay actually posts to
// needs this; it forwards a callback for another site to that site's own
// endpoint (which re-verifies the signature and settles against its own DB).
export function ipnRoutes(): Record<string, string> {
  try {
    const v = JSON.parse(process.env.IPN_ROUTES || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

// ---- Provider switch -------------------------------------------------------
// Which rail this deployment uses. Deposits and withdrawals can differ; each
// falls back to PAYMENT_PROVIDER, then to the app's existing default (TeronaPay)
// when unset. Values: "dusupay" | "teronapay" | "paybill".
export type Rail = "dusupay" | "teronapay" | "paybill";
function readRail(...names: string[]): Rail | null {
  for (const n of names) {
    const v = (process.env[n] || "").trim().toLowerCase();
    if (v === "dusupay" || v === "teronapay" || v === "paybill") return v;
  }
  return null;
}
export function depositRail(): Rail | null {
  return readRail("DEPOSIT_PROVIDER", "PAYMENT_PROVIDER");
}
export function withdrawRail(): Rail | null {
  return readRail("WITHDRAW_PROVIDER", "PAYMENT_PROVIDER");
}
const MOBILE_METHODS = ["mpesa", "mtn", "airtel", "tzmobile"];
export function useDusupayForDeposit(method: string): boolean {
  return depositRail() === "dusupay" && isDusupayConfigured() && MOBILE_METHODS.includes(method);
}
export function useDusupayForWithdraw(method: string): boolean {
  return withdrawRail() === "dusupay" && isDusupayConfigured() && MOBILE_METHODS.includes(method);
}
