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
} from "lucide-react";
import { useApp, Txn, Referral } from "./app-context";
import { money, shortTime } from "@/lib/format";
import { railsForCountry } from "@/lib/countries";

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
          <TxnList txns={data?.transactions ?? []} />
        </div>
      </div>

      {data?.referral && <ReferralCard referral={data.referral} />}
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
        body: JSON.stringify({ amount: amountNum, method, reference }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg({ text: json.error || "Request failed.", ok: false });
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
          ? "Pay with Crypto"
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
