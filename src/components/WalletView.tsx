"use client";

import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Clock,
  CheckCircle2,
  XCircle,
  TrendingUp,
  TrendingDown,
  Smartphone,
  CreditCard,
  Landmark,
  Bitcoin,
  Loader2,
  Gift,
  Copy,
  Check,
  Users,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { useApp, Txn, Referral, AppUser } from "./app-context";
import { money, shortTime } from "@/lib/format";
import { railsForCountry } from "@/lib/countries";
import { ListSkeleton } from "./Skeleton";

type MethodDef = { id: string; label: string; hint: string; icon: any };

const METHOD_DEFS: Record<string, MethodDef> = {
  mpesa: { id: "mpesa", label: "M-Pesa", hint: "Phone e.g. 0712345678", icon: Smartphone },
  mtn: { id: "mtn", label: "MTN", hint: "Phone e.g. 0772123456", icon: Smartphone },
  airtel: { id: "airtel", label: "Airtel", hint: "Phone e.g. 0752123456", icon: Smartphone },
  card: { id: "card", label: "Card", hint: "", icon: CreditCard },
  bank: { id: "bank", label: "Bank", hint: "Account number / name", icon: Landmark },
  crypto: { id: "crypto", label: "Crypto", hint: "USDT / BTC & more", icon: Bitcoin },
};

// Deposit rails come from the user's country. Withdrawals swap card -> bank.
function depositMethods(country: string | null | undefined): string[] {
  return railsForCountry(country);
}
function withdrawMethods(country: string | null | undefined): string[] {
  const out: string[] = [];
  for (const r of railsForCountry(country)) out.push(r === "card" ? "bank" : r);
  return Array.from(new Set(out));
}

export function WalletView() {
  const { user, balance, data, config, refresh, setBalance, loading } = useApp();
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  const rate = config?.usdKesRate ?? 130;
  const country = user?.country ?? null;

  // Returning from a hosted checkout (?deposit=processing) — confirm & poll.
  const [processing, setProcessing] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search).get("deposit");
    if (p === "processing") {
      setProcessing(true);
      window.history.replaceState({}, "", "/wallet");
      let n = 0;
      const id = setInterval(() => {
        n += 1;
        refresh();
        if (n >= 15) {
          clearInterval(id);
          setProcessing(false);
        }
      }, 4000);
      return () => clearInterval(id);
    }
  }, [refresh]);

  return (
    <div className="space-y-5">
      {/* Balance banner */}
      <div className="card relative overflow-hidden p-6">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand/20 blur-3xl" />
        <div className="text-xs uppercase tracking-wider text-muted">
          Available balance
        </div>
        <div className="tabular mt-1 text-4xl font-black text-fg">
          {loading ? "—" : money(balance)}
        </div>
        <div className="mt-1 text-xs text-muted">
          Funds are held securely and settle to your withdrawals on request.
        </div>
      </div>

      {processing && (
        <div className="card flex items-center gap-3 border-brand/40 p-4">
          <Loader2 className="h-5 w-5 animate-spin text-brand" />
          <div>
            <div className="text-sm font-semibold">Confirming your payment…</div>
            <div className="text-xs text-muted">
              Your balance updates automatically once the payment is confirmed.
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        {/* Money form */}
        <div className="card p-5">
          <div className="mb-4 grid grid-cols-2 gap-2">
            <button
              onClick={() => setTab("deposit")}
              className={`btn py-2 ${tab === "deposit" ? "btn-brand" : "btn-ghost"}`}
            >
              <ArrowDownToLine className="h-4 w-4" /> Deposit
            </button>
            <button
              onClick={() => setTab("withdraw")}
              className={`btn py-2 ${tab === "withdraw" ? "btn-brand" : "btn-ghost"}`}
            >
              <ArrowUpFromLine className="h-4 w-4" /> Withdraw
            </button>
          </div>
          {tab === "deposit" ? (
            <MoneyForm
              kind="deposit"
              max={Infinity}
              rate={rate}
              methodIds={depositMethods(country)}
              mpesaAutomated={!!config?.mpesaDeposit}
              config={config}
              refresh={refresh}
              onDone={(newBal) => {
                if (newBal != null) setBalance(newBal);
                refresh();
              }}
            />
          ) : (
            <MoneyForm
              kind="withdraw"
              max={balance}
              rate={rate}
              methodIds={withdrawMethods(country)}
              mpesaAutomated={!!config?.mpesaWithdraw}
              config={config}
              refresh={refresh}
              onDone={(newBal) => {
                if (newBal != null) setBalance(newBal);
                refresh();
              }}
            />
          )}
        </div>

        {/* Transactions */}
        <div className="card overflow-hidden">
          <div className="border-b border-border px-5 py-3 font-bold">
            Recent activity
          </div>
          {loading && !data ? <ListSkeleton rows={5} /> : <TxnList txns={data?.transactions ?? []} />}
        </div>
      </div>

      {user && <KycCard user={user} refresh={refresh} />}
      {data?.referral && <ReferralCard referral={data.referral} />}
    </div>
  );
}

function CryptoDepositPanel({
  data,
  status,
  onReset,
}: {
  data: { address: string; amount: number; currency: string; network: string | null; usd: number; qr: string | null };
  status: "waiting" | "confirming" | "done" | "failed";
  onReset: () => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copyAddr() {
    try {
      await navigator.clipboard.writeText(data.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* select manually */
    }
  }

  if (status === "done") {
    return (
      <div className="flex flex-col items-center py-6 text-center">
        <CheckCircle2 className="h-12 w-12 text-up" />
        <div className="mt-3 text-lg font-bold">Payment received</div>
        <div className="mt-1 text-sm text-muted">
          ${data.usd.toFixed(2)} has been credited to your balance.
        </div>
        <button onClick={onReset} className="btn btn-brand mt-5 px-5 py-2.5">
          Make another deposit
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-sm font-bold">Send crypto to complete your deposit</div>
      <p className="text-xs text-muted">
        Send <b className="text-fg">exactly {data.amount} {data.currency.toUpperCase()}</b>
        {data.network ? ` on the ${data.network.toUpperCase()} network` : ""} to the address below.
        Your balance is credited automatically once the network confirms.
      </p>

      {data.qr && (
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={data.qr} alt="Deposit address QR" className="rounded-xl border border-border bg-white p-1" width={180} height={180} />
        </div>
      )}

      <div>
        <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted">
          {data.currency.toUpperCase()} address
        </label>
        <div className="flex gap-2">
          <div className="tabular flex-1 break-all rounded-xl border border-border bg-surface2 px-3 py-2.5 text-xs">
            {data.address}
          </div>
          <button onClick={copyAddr} className="btn btn-brand shrink-0 px-3 py-2.5 text-sm">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div
        className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${
          status === "failed" ? "border-down/40 text-down" : "border-brand/40 text-fg"
        }`}
      >
        {status === "failed" ? (
          <>
            <XCircle className="h-4 w-4 text-down" /> Payment failed or expired. Start a new deposit.
          </>
        ) : (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-brand" />
            {status === "confirming" ? "Payment detected — confirming on-chain…" : "Waiting for your payment…"}
          </>
        )}
      </div>

      <div className="rounded-xl border border-gold/30 bg-gold/5 px-3 py-2 text-[11px] text-muted">
        Send only <b>{data.currency.toUpperCase()}</b> to this address. Sending a different coin or network may lose your funds.
      </div>

      <button onClick={onReset} className="btn btn-ghost w-full py-2.5 text-sm">
        {status === "failed" ? "Start over" : "Cancel"}
      </button>
    </div>
  );
}

function KycCard({ user, refresh }: { user: AppUser; refresh: () => Promise<void> }) {
  const status = user.kyc_status || "none";
  const [name, setName] = useState(user.name || "");
  const [idNumber, setIdNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (status === "approved") {
    return (
      <div className="card flex items-center gap-3 p-4">
        <ShieldCheck className="h-6 w-6 text-up" />
        <div>
          <div className="text-sm font-bold">Identity verified</div>
          <div className="text-xs text-muted">Your account is fully verified — no withdrawal limits.</div>
        </div>
        <span className="ml-auto rounded-md bg-up/15 px-2 py-0.5 text-[10px] font-bold uppercase text-up">
          Verified
        </span>
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div className="card flex items-center gap-3 p-4">
        <Clock className="h-6 w-6 text-gold" />
        <div>
          <div className="text-sm font-bold">Verification under review</div>
          <div className="text-xs text-muted">
            We're reviewing your details — this is usually done within a few hours. We'll email you.
          </div>
        </div>
      </div>
    );
  }

  async function submit() {
    setErr(null);
    if (name.trim().length < 3 || idNumber.trim().length < 4 || phone.trim().length < 7) {
      setErr("Please fill in all fields correctly.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/kyc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, idNumber, phone }),
      });
      const json = await res.json();
      if (!res.ok) setErr(json.error || "Could not submit.");
      else await refresh();
    } catch {
      setErr("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 text-sm font-bold">
        <ShieldAlert className="h-4 w-4 text-brand" /> Verify your identity
      </div>
      <p className="mt-1 text-xs text-muted">
        Required for withdrawals of $200 or more. Verify once and it's done for good.
      </p>

      {status === "rejected" && user.kyc_reason && (
        <div className="mt-3 rounded-xl border border-down/40 bg-down/10 px-3 py-2 text-xs text-down">
          Your last submission was declined: {user.kyc_reason} — please correct and resubmit.
        </div>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <input className="input" placeholder="Full legal name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input" placeholder="ID / passport no." value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
        <input className="input" placeholder="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      {err && <p className="mt-2 text-xs text-down">{err}</p>}
      <button onClick={submit} disabled={busy} className="btn btn-brand mt-3 px-5 py-2.5 text-sm">
        {busy ? "Submitting…" : "Submit for verification"}
      </button>
    </div>
  );
}

function ReferralCard({ referral }: { referral: Referral }) {
  const [copied, setCopied] = useState(false);
  // Start with the relative path (matches on server + first client render),
  // then upgrade to the absolute URL after mount to avoid a hydration mismatch.
  const path = `/register?ref=${referral.code}`;
  const [link, setLink] = useState(path);
  useEffect(() => {
    setLink(window.location.origin + path);
  }, [path]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — user can select manually */
    }
  }

  return (
    <div className="card relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-brand/20 blur-3xl" />
      <div className="flex items-center gap-2 text-sm font-bold">
        <Gift className="h-4 w-4 text-brand" /> Invite friends, earn rewards
      </div>
      <p className="mt-1 text-xs text-muted">
        Share your link. When a friend signs up and makes their first deposit, you earn a bonus —
        credited straight to your balance.
      </p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <div className="tabular flex-1 truncate rounded-xl border border-border bg-surface2 px-3 py-2.5 text-sm">
          {link}
        </div>
        <button onClick={copy} className="btn btn-brand shrink-0 px-4 py-2.5 text-sm">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-surface2/60 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted">
            <Users className="h-3 w-3" /> Friends referred
          </div>
          <div className="tabular mt-0.5 text-xl font-bold">{referral.referredCount}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface2/60 px-3 py-2.5">
          <div className="text-[11px] uppercase tracking-wider text-muted">Rewards earned</div>
          <div className="tabular mt-0.5 text-xl font-bold text-up">{money(referral.earnedCents)}</div>
        </div>
      </div>
    </div>
  );
}

// Coins users can pay in (kept in the client so we avoid importing the
// server-only crypto lib). Mirrors CRYPTO_COINS in src/lib/crypto-pay.ts.
const CRYPTO_COINS = [
  { code: "usdttrc20", label: "USDT", note: "TRC20" },
  { code: "usdterc20", label: "USDT", note: "ERC20" },
  { code: "btc", label: "Bitcoin", note: "BTC" },
  { code: "eth", label: "Ethereum", note: "ETH" },
  { code: "trx", label: "TRON", note: "TRX" },
  { code: "bnbbsc", label: "BNB", note: "BSC" },
];

function MoneyForm({
  kind,
  max,
  rate,
  methodIds,
  mpesaAutomated,
  config,
  refresh,
  onDone,
}: {
  kind: "deposit" | "withdraw";
  max: number;
  rate: number;
  methodIds: string[];
  mpesaAutomated: boolean;
  config: import("./app-context").AppConfig | null;
  refresh: () => Promise<void>;
  onDone: (newBalance: number | null) => void;
}) {
  const methods = methodIds.map((id) => METHOD_DEFS[id]).filter(Boolean);

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState(methods[0]?.id ?? "card");
  const [reference, setReference] = useState("");
  const [coin, setCoin] = useState("usdttrc20");
  const [cryptoPay, setCryptoPay] = useState<any | null>(null);
  const [cryptoStatus, setCryptoStatus] = useState<"waiting" | "confirming" | "done" | "failed">("waiting");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const methodDef = METHOD_DEFS[method] ?? METHOD_DEFS.card;
  const amountNum = Number(amount) || 0;
  const isMpesa = method === "mpesa";
  const isUgMobile = method === "mtn" || method === "airtel";
  const needsPhone = isMpesa || isUgMobile;
  const automated =
    (isMpesa && mpesaAutomated) || (isUgMobile && !!config?.ugMobileDeposit);
  const kes = Math.max(0, Math.round(amountNum * rate));

  // Card/bank/crypto deposits go to a hosted checkout (gateway collects details).
  const gatewayReady =
    (method === "card" || method === "bank") ? !!config?.cardDeposit : method === "crypto" ? !!config?.cryptoDeposit : false;
  const isHostedDeposit = kind === "deposit" && gatewayReady;
  const showReference = kind === "withdraw" || (kind === "deposit" && !isHostedDeposit);

  // After an automated M-Pesa action, poll the wallet so the status flips from
  // pending to done (or the balance updates) without a manual refresh.
  function startPolling() {
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      refresh();
      if (n >= 12) clearInterval(id); // ~48s
    }, 4000);
  }

  // Poll the Collecto status endpoint after an MTN/Airtel prompt.
  function pollCollecto(ref: string) {
    let n = 0;
    const id = setInterval(async () => {
      n += 1;
      try {
        const res = await fetch(`/api/collecto/status?ref=${encodeURIComponent(ref)}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (json.status === "completed") {
          clearInterval(id);
          if (typeof json.balance === "number") onDone(json.balance);
          refresh();
          setMsg({ text: "Deposit received — your balance is updated.", ok: true });
        } else if (json.status === "failed") {
          clearInterval(id);
          setMsg({ text: "The payment was not completed. Please try again.", ok: false });
        }
      } catch {
        /* keep polling */
      }
      if (n >= 20) clearInterval(id); // ~80s
    }, 4000);
  }

  // Poll NOWPayments status until the on-chain payment confirms, then credit.
  function pollCrypto(paymentId: string) {
    let n = 0;
    const id = setInterval(async () => {
      n += 1;
      try {
        const res = await fetch(`/api/crypto/status?paymentId=${encodeURIComponent(paymentId)}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (json.credited) {
          clearInterval(id);
          setCryptoStatus("done");
          if (typeof json.balance === "number") onDone(json.balance);
          refresh();
        } else if (json.status === "confirming" || json.status === "sending") {
          setCryptoStatus("confirming");
        } else if (["failed", "expired", "refunded"].includes(json.status)) {
          clearInterval(id);
          setCryptoStatus("failed");
        }
      } catch {
        /* keep polling */
      }
      if (n >= 150) clearInterval(id); // ~15 min
    }, 6000);
  }

  function resetCrypto() {
    setCryptoPay(null);
    setCryptoStatus("waiting");
    setAmount("");
    setMsg(null);
    refresh();
  }

  async function submit() {
    setMsg(null);
    const minUsd = kind === "deposit" ? 5 : 1;
    if (amountNum < minUsd) {
      setMsg({ text: `Minimum ${kind} is $${minUsd}.00.`, ok: false });
      return;
    }
    if (kind === "withdraw" && amountNum * 100 > max) {
      setMsg({ text: "Amount exceeds your balance.", ok: false });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amountNum, method, reference, coin }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg({ text: json.error || "Request failed.", ok: false });
      } else if (json.crypto) {
        // Crypto: show the deposit address and poll until it confirms on-chain.
        setCryptoPay(json.crypto);
        setCryptoStatus("waiting");
        pollCrypto(json.crypto.paymentId);
      } else if (json.redirect && json.redirectUrl) {
        // Hand off to the hosted checkout (card / bank / crypto).
        setMsg({ text: "Redirecting to secure checkout…", ok: true });
        window.location.href = json.redirectUrl;
        return;
      } else if (json.poll && json.ref) {
        // MTN / Airtel prompt sent — poll until confirmed.
        setMsg({ text: json.message || "Approve the prompt on your phone.", ok: true });
        setAmount("");
        setReference("");
        pollCollecto(json.ref);
      } else {
        const fallback =
          kind === "deposit"
            ? "Deposit request received — it will reflect once confirmed by our team."
            : "Withdrawal requested — funds reserved and sent after approval.";
        setMsg({ text: json.message || fallback, ok: true });
        setAmount("");
        setReference("");
        onDone(typeof json.balance === "number" ? json.balance : null);
        if (json.mpesa) startPolling();
      }
    } catch {
      setMsg({ text: "Network error. Try again.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  if (cryptoPay) {
    return <CryptoDepositPanel data={cryptoPay} status={cryptoStatus} onReset={resetCrypto} />;
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">
          Amount (USD){kind === "deposit" ? " · min $5" : ""}
        </label>
        <input
          className="input tabular"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Method</label>
        <div className="grid grid-cols-4 gap-2">
          {methods.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                onClick={() => setMethod(m.id)}
                className={`btn flex-col gap-1 py-2 text-[11px] ${
                  method === m.id ? "btn-brand" : "btn-ghost"
                }`}
              >
                <Icon className="h-4 w-4" />
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {kind === "deposit" && method === "crypto" && gatewayReady && (
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Pay with</label>
          <div className="grid grid-cols-3 gap-2">
            {CRYPTO_COINS.map((c) => (
              <button
                key={c.code}
                onClick={() => setCoin(c.code)}
                className={`btn flex-col gap-0 py-2 text-[11px] ${coin === c.code ? "btn-brand" : "btn-ghost"}`}
              >
                <span className="font-bold">{c.label}</span>
                <span className="text-[9px] opacity-80">{c.note}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {showReference && (
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">
            {needsPhone
              ? `${methodDef.label} phone number`
              : kind === "deposit"
              ? "Sender reference"
              : method === "crypto"
              ? "Your payout wallet address"
              : "Send to"}
          </label>
          <input
            className="input"
            placeholder={methodDef.hint || "Account / name"}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </div>
      )}

      {needsPhone && amountNum > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-surface2/50 px-3 py-2 text-xs">
          <span className="text-muted">
            {kind === "deposit" ? "You’ll pay" : "You’ll receive"}
          </span>
          <span className="tabular font-bold text-brand">
            {isMpesa
              ? `KES ${kes.toLocaleString("en-US")}`
              : `UGX ${Math.max(500, Math.round(amountNum * (config?.usdUgxRate ?? 3750))).toLocaleString("en-US")}`}
          </span>
        </div>
      )}

      <button
        onClick={submit}
        disabled={busy}
        className="btn btn-brand w-full py-2.5"
      >
        {busy
          ? "Submitting…"
          : isHostedDeposit && method === "crypto"
          ? "Get deposit address"
          : isHostedDeposit && method === "bank"
          ? "Continue to Bank"
          : isHostedDeposit
          ? "Pay with Card"
          : needsPhone && kind === "deposit"
          ? `Pay with ${methodDef.label}`
          : needsPhone
          ? `Withdraw to ${methodDef.label}`
          : kind === "deposit"
          ? "Request deposit"
          : "Request withdrawal"}
      </button>

      {msg && (
        <p className={`text-center text-xs ${msg.ok ? "text-up" : "text-down"}`}>
          {msg.text}
        </p>
      )}

      <p className="text-center text-[11px] leading-relaxed text-muted">
        {isHostedDeposit && method === "crypto"
          ? "You’ll be taken to a secure page to pay with USDT, BTC and more. Your balance updates automatically once the payment confirms on-chain."
          : isHostedDeposit
          ? "You’ll be taken to a secure checkout to pay by card or bank. Your balance updates automatically once payment is confirmed."
          : needsPhone && kind === "deposit"
          ? `You’ll get a ${methodDef.label} prompt on your phone. Approve it and your balance is credited instantly.`
          : needsPhone
          ? `Money is sent straight to your ${methodDef.label} and usually arrives within a minute.`
          : kind === "deposit"
          ? "Complete the secure checkout to fund your account."
          : "Withdrawals are reviewed and paid to the destination above."}
      </p>
    </div>
  );
}

function TxnList({ txns }: { txns: Txn[] }) {
  if (!txns.length) {
    return (
      <div className="p-6 text-center text-sm text-muted">No activity yet.</div>
    );
  }
  return (
    <div className="divide-y divide-border">
      {txns.map((t) => (
        <div key={t.id} className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <TxnIcon type={t.type} />
            <div>
              <div className="text-sm font-medium capitalize">
                {t.type.replace("_", " ")}
                {t.method ? (
                  <span className="text-muted"> · {t.method}</span>
                ) : null}
              </div>
              <div className="text-[11px] text-muted">{shortTime(t.created_at)}</div>
            </div>
          </div>
          <div className="text-right">
            <div
              className={`tabular text-sm font-bold ${
                Number(t.amount) >= 0 ? "text-up" : "text-fg"
              }`}
            >
              {money(Number(t.amount), { sign: true })}
            </div>
            <StatusBadge status={t.status} />
          </div>
        </div>
      ))}
    </div>
  );
}

function TxnIcon({ type }: { type: string }) {
  const cls = "h-4 w-4";
  if (type === "deposit") return <ArrowDownToLine className={`${cls} text-up`} />;
  if (type === "withdrawal") return <ArrowUpFromLine className={`${cls} text-gold`} />;
  if (type === "trade_payout") return <TrendingUp className={`${cls} text-up`} />;
  if (type === "trade_stake") return <TrendingDown className={`${cls} text-down`} />;
  return <Clock className={`${cls} text-muted`} />;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "pending")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-gold">
        <Clock className="h-3 w-3" /> pending
      </span>
    );
  if (status === "rejected")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-down">
        <XCircle className="h-3 w-3" /> rejected
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted">
      <CheckCircle2 className="h-3 w-3" /> done
    </span>
  );
}
