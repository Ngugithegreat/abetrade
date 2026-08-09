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
} from "lucide-react";
import { useApp, Txn } from "./app-context";
import { money, shortTime } from "@/lib/format";

type MethodDef = { id: string; label: string; hint: string; icon: any };

const METHOD_DEFS: Record<string, MethodDef> = {
  mpesa: { id: "mpesa", label: "M-Pesa", hint: "Phone e.g. 0712345678", icon: Smartphone },
  card: { id: "card", label: "Card", hint: "", icon: CreditCard },
  bank: { id: "bank", label: "Bank", hint: "Account number / name", icon: Landmark },
  crypto: { id: "crypto", label: "Crypto", hint: "USDT / BTC & more", icon: Bitcoin },
};

export function WalletView() {
  const { balance, data, config, refresh, setBalance, loading } = useApp();
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  const rate = config?.usdKesRate ?? 130;

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
    </div>
  );
}

function MoneyForm({
  kind,
  max,
  rate,
  mpesaAutomated,
  config,
  refresh,
  onDone,
}: {
  kind: "deposit" | "withdraw";
  max: number;
  rate: number;
  mpesaAutomated: boolean;
  config: import("./app-context").AppConfig | null;
  refresh: () => Promise<void>;
  onDone: (newBalance: number | null) => void;
}) {
  const methodIds =
    kind === "deposit" ? ["mpesa", "card", "bank", "crypto"] : ["mpesa", "crypto", "bank"];
  const methods = methodIds.map((id) => METHOD_DEFS[id]);

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState(methods[0].id);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const methodDef = METHOD_DEFS[method];
  const amountNum = Number(amount) || 0;
  const isMpesa = method === "mpesa";
  const automated = isMpesa && mpesaAutomated;
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

  async function submit() {
    setMsg(null);
    if (amountNum < 1) {
      setMsg({ text: "Minimum is $1.00.", ok: false });
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
          Amount (USD)
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
            {isMpesa
              ? "M-Pesa phone number"
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

      {isMpesa && amountNum > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-surface2/50 px-3 py-2 text-xs">
          <span className="text-muted">
            {kind === "deposit" ? "You’ll pay" : "You’ll receive"}
          </span>
          <span className="tabular font-bold text-brand">
            KES {kes.toLocaleString("en-US")}
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
          : automated && kind === "deposit"
          ? "Pay with M-Pesa"
          : automated
          ? "Withdraw to M-Pesa"
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
          : automated && kind === "deposit"
          ? "You’ll get an M-Pesa prompt on your phone. Enter your PIN and your balance updates automatically."
          : automated
          ? "Money is sent straight to your M-Pesa and usually arrives within a minute."
          : kind === "deposit"
          ? "Deposits are confirmed by our team, typically within minutes during working hours."
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
