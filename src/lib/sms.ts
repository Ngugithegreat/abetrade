// SMS via Africa's Talking. Used for signup phone-OTP (Kenya). Configured with
// AFRICASTALKING_* (or the shorter AT_* aliases the account already uses in
// Vercel). If no credentials are set, isSmsConfigured() is false and callers
// skip OTP entirely — so signups are never blocked by a missing SMS setup.

function env(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

export function smsUsername(): string | undefined {
  return env("AFRICASTALKING_USERNAME", "AT_USERNAME");
}
export function smsApiKey(): string | undefined {
  return env("AFRICASTALKING_API_KEY", "AT_API_KEY");
}
export function smsSenderId(): string | undefined {
  return env("AFRICASTALKING_SENDER_ID", "AT_SENDER_ID", "AFRICASTALKING_SENDER_ID_KE");
}

export function isSmsConfigured(): boolean {
  return !!(smsUsername() && smsApiKey());
}

function endpoint(): string {
  // The special username "sandbox" targets AT's sandbox environment.
  return smsUsername() === "sandbox"
    ? "https://api.sandbox.africastalking.com/version1/messaging"
    : "https://api.africastalking.com/version1/messaging";
}

// Africa's Talking wants recipients in international format (+2547XXXXXXXX).
export function toIntlPhone(msisdn: string): string {
  const digits = String(msisdn).replace(/[^\d]/g, "");
  return digits.startsWith("+") ? msisdn : `+${digits}`;
}

/** Sends one SMS. Returns { ok } — throws only on a total transport failure. */
export async function sendSms(to: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const username = smsUsername();
  const apiKey = smsApiKey();
  if (!username || !apiKey) return { ok: false, error: "SMS not configured." };

  const body = new URLSearchParams({ username, to: toIntlPhone(to), message });
  const from = smsSenderId();
  if (from) body.set("from", from);

  try {
    const res = await fetch(endpoint(), {
      method: "POST",
      headers: {
        apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({} as any));
    const recipients = json?.SMSMessageData?.Recipients ?? [];
    const first = recipients[0];
    // "Success" (accepted) or "Sent" are both fine; anything else is a failure.
    if (first && /success|sent/i.test(String(first.status))) return { ok: true };
    const reason = first?.status || json?.SMSMessageData?.Message || `HTTP ${res.status}`;
    return { ok: false, error: String(reason) };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Could not reach the SMS provider." };
  }
}
