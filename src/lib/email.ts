// Transactional email via Resend (https://resend.com). No SDK needed — a single
// authenticated fetch to their REST API works in the Vercel serverless runtime.
//
// Required env:  RESEND_API_KEY
// Optional env:  EMAIL_FROM   (default "SinTrades <noreply@sintrades.com>")
//                PUBLIC_BASE_URL (used to build links; default www.sintrades.com)
//
// If RESEND_API_KEY isn't set, sends are a safe no-op so signup/reset still work
// before the DNS + key setup is finished.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export function emailFrom(): string {
  return (process.env.EMAIL_FROM || "SinTrades <noreply@sintrades.com>").trim();
}

export function siteUrl(): string {
  const base = process.env.PUBLIC_BASE_URL || "https://www.sintrades.com";
  return base.replace(/\/$/, "");
}

type SendResult = { ok: boolean; skipped?: boolean; error?: string };

/** Send an email. Never throws — returns {ok:false} on failure so callers can fire-and-forget. */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, skipped: true };
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom(),
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        ...(opts.text ? { text: opts.text } : {}),
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "send failed" };
  }
}

/* ------------------------- Branded HTML template ------------------------- */

const BRAND = "#6A47F5";

// Inline sine-wave mark (matches the app logo) as a data URI so it renders in email.
const LOGO_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 32 32" fill="none">` +
  `<rect width="32" height="32" rx="8" fill="#6A47F5"/>` +
  `<path d="M4 18.5C6.6 18.5 7.6 11.5 10.5 11.5S14.3 21 17.5 21 21 14 24 13.6" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<circle cx="24" cy="13.6" r="2.7" fill="#fff"/></svg>`;
const LOGO_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(LOGO_SVG).toString("base64")}`;

function shell(inner: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#0b0c10;padding:24px 12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#12131b;border:1px solid #262a38;border-radius:16px;overflow:hidden;">
    <tr><td style="padding:24px 28px 8px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle;"><img src="${LOGO_DATA_URI}" width="34" height="34" alt="" style="display:block;border-radius:8px;"></td>
        <td style="vertical-align:middle;padding-left:10px;font-size:18px;font-weight:700;color:#ffffff;">SinTrades</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:8px 28px 28px;color:#c7ccd8;font-size:15px;line-height:1.6;">
      ${inner}
    </td></tr>
    <tr><td style="padding:16px 28px;border-top:1px solid #262a38;color:#7b8395;font-size:12px;line-height:1.6;">
      SinTrades · <a href="${siteUrl()}" style="color:#9E86FF;text-decoration:none;">www.sintrades.com</a><br>
      Trading volatility indices carries risk. Only trade what you can afford to lose.
    </td></tr>
  </table>
</body></html>`;
}

function button(label: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:12px;">${label}</a>`;
}

export function welcomeEmail(name: string): { subject: string; html: string; text: string } {
  const first = (name || "there").split(" ")[0];
  const url = `${siteUrl()}/trade`;
  const html = shell(
    `<h1 style="margin:0 0 12px;color:#ffffff;font-size:22px;">Welcome to SinTrades, ${first} 👋</h1>
     <p style="margin:0 0 16px;">Your account is live. You can trade Volatility Indices with instant deposits and withdrawals — Rise/Fall, Digits and Multipliers, all on the real live feed.</p>
     <p style="margin:0 0 22px;">${button("Start trading", url)}</p>
     <p style="margin:0;color:#9aa1b1;font-size:13px;">Need help? Just reply to this email.</p>`
  );
  const text = `Welcome to SinTrades, ${first}! Your account is live. Start trading at ${url}`;
  return { subject: "Welcome to SinTrades 🎉", html, text };
}

export function depositReceiptEmail(
  name: string,
  usd: number,
  method: string
): { subject: string; html: string; text: string } {
  const first = (name || "there").split(" ")[0];
  const amt = `$${usd.toFixed(2)}`;
  const url = `${siteUrl()}/trade`;
  const html = shell(
    `<h1 style="margin:0 0 12px;color:#ffffff;font-size:22px;">Deposit confirmed ✅</h1>
     <p style="margin:0 0 16px;">Hi ${first}, we've credited <b style="color:#00E39A;">${amt}</b> to your SinTrades balance via ${method}. It's ready to trade.</p>
     <p style="margin:0 0 22px;">${button("Go to the terminal", url)}</p>
     <p style="margin:0;color:#9aa1b1;font-size:13px;">If this wasn't you, contact support immediately.</p>`
  );
  return { subject: `Deposit confirmed — ${amt}`, html, text: `Your SinTrades deposit of ${amt} via ${method} is confirmed and ready to trade.` };
}

export function withdrawalReceiptEmail(
  name: string,
  usd: number,
  destination: string
): { subject: string; html: string; text: string } {
  const first = (name || "there").split(" ")[0];
  const amt = `$${usd.toFixed(2)}`;
  const html = shell(
    `<h1 style="margin:0 0 12px;color:#ffffff;font-size:22px;">Withdrawal request received</h1>
     <p style="margin:0 0 16px;">Hi ${first}, we've received your request to withdraw <b>${amt}</b> to <b>${destination}</b>. We're processing it now — most withdrawals complete within minutes.</p>
     <p style="margin:0;color:#9aa1b1;font-size:13px;">You'll get another note once it's sent. Didn't request this? Contact support right away.</p>`
  );
  return { subject: `Withdrawal request received — ${amt}`, html, text: `We received your SinTrades withdrawal request of ${amt} to ${destination}. Processing now.` };
}

export function resetPasswordEmail(name: string, link: string): { subject: string; html: string; text: string } {
  const first = (name || "there").split(" ")[0];
  const html = shell(
    `<h1 style="margin:0 0 12px;color:#ffffff;font-size:22px;">Reset your password</h1>
     <p style="margin:0 0 16px;">Hi ${first}, we got a request to reset your SinTrades password. Click below to choose a new one — this link expires in 1 hour.</p>
     <p style="margin:0 0 22px;">${button("Reset password", link)}</p>
     <p style="margin:0 0 8px;color:#9aa1b1;font-size:13px;">If the button doesn't work, paste this link into your browser:</p>
     <p style="margin:0 0 16px;word-break:break-all;color:#9E86FF;font-size:13px;">${link}</p>
     <p style="margin:0;color:#9aa1b1;font-size:13px;">Didn't request this? You can safely ignore this email — your password won't change.</p>`
  );
  const text = `Reset your SinTrades password (expires in 1 hour): ${link}`;
  return { subject: "Reset your SinTrades password", html, text };
}
