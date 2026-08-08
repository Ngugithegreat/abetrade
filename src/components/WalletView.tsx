"use client";

import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Clock,
  CheckCircle2,
  XCircle,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { useApp, Txn } from "./app-context";
import { money, shortTime } from "@/lib/format";

const METHODS = [
  { id: "mpesa", label: "M-Pesa", hint: "Phone number e.g. 2547XXXXXXXX" },
  { id: "crypto", label: "Crypto (USDT)", hint: "Your USDT (TRC20) wallet address" },
  { id: "bank", label: "Bank", hint: "Account number / name" },
];

export function WalletView() {
  const { balance, data, refresh, setBalance, loading } = useApp();
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");

  return (
    <div className="space-y-5">
      {/* Balance banner */}
      <div className="card relative overflow-hidden p-6">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand/20 blur-3xl" />
        <div className="text-xs uppercase tracking-wider text-muted">
          Available balance
        </div>
        <div className="tabular mt-1 text-4xl font-black text-white">
          {loading ? "—" : money(balance)}
        </div>
        <div className="mt-1 text-xs text-muted">
          Funds are held securely and settle to your withdrawals on request.
        </div>
      </div>

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
              onDone={(newBal) => {
                if (newBal != null) setBalance(newBal);
                refresh();
              }}
            />
          ) : (
            <MoneyForm
              kind="withdraw"
              max={balance}
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
  onDone,
}: {
  kind: "deposit" | "withdraw";
  max: number;
  onDone: (newBalance: number | null) => void;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState(METHODS[0].id);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const methodDef = METHODS.find((m) => m.id === method)!;
  const amountNum = Number(amount) || 0;

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
      } else {
        setMsg({
          text:
            kind === "deposit"
              ? "Deposit request received — it will reflect once confirmed by our team."
              : "Withdrawal requested — funds reserved and sent after approval.",
          ok: true,
        });
        setAmount("");
        setReference("");
        onDone(typeof json.balance === "number" ? json.balance : null);
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
        <div className="grid grid-cols-3 gap-2">
          {METHODS.map((m) => (
            <button
              key={m.id}
              onClick={() => setMethod(m.id)}
              className={`btn py-1.5 text-xs ${
                method === m.id ? "btn-brand" : "btn-ghost"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">
          {kind === "deposit" ? "Sender reference" : "Send to"}
        </label>
        <input
          className="input"
          placeholder={methodDef.hint}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
      </div>

      <button
        onClick={submit}
        disabled={busy}
        className="btn btn-brand w-full py-2.5"
      >
        {busy
          ? "Submitting…"
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
        {kind === "deposit"
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
                Number(t.amount) >= 0 ? "text-up" : "text-white"
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
