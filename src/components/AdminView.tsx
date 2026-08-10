"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  X,
  Users,
  Wallet,
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  TrendingUp,
  Landmark,
  Coins,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { money, shortTime } from "@/lib/format";

type Pending = {
  id: number;
  user_id: number;
  type: string;
  amount: number;
  method: string | null;
  reference: string | null;
  email: string;
  user_name: string;
  created_at: string;
};

export function AdminView() {
  const [data, setData] = useState<any>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin", { cache: "no-store" });
    if (res.status === 403) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(id: number, action: "approve" | "reject") {
    setBusyId(id);
    try {
      await fetch("/api/admin/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  if (forbidden)
    return <div className="card p-8 text-center text-muted">You don’t have access to the admin panel.</div>;
  if (loading || !data) return <div className="card p-8 text-center text-muted">Loading…</div>;

  const k = data.kpi;
  const pending: Pending[] = data.pending || [];
  const daily = (data.daily || []).map((d: any) => ({
    label: new Date(d.day).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    volume: d.volume / 100,
  }));
  const winRate = k.wonCount + k.lostCount ? Math.round((k.wonCount / (k.wonCount + k.lostCount)) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icon={Users} label="Users" value={String(k.userCount)} />
        <Kpi icon={Wallet} label="Player balances" value={money(k.totalBalance)} />
        <Kpi icon={ArrowDownToLine} label="Deposits" value={money(k.depositsTotal)} sub={`${k.depositsPending} pending`} accent="up" />
        <Kpi icon={ArrowUpFromLine} label="Withdrawals" value={money(k.withdrawalsTotal)} sub={`${k.withdrawalsPending} pending`} accent="gold" />
        <Kpi icon={Coins} label="Total staked" value={money(k.stakedTotal)} />
        <Kpi icon={TrendingUp} label="Total paid out" value={money(k.payoutTotal)} />
        <Kpi icon={Landmark} label="House P&L" value={money(k.houseProfit, { sign: true })} accent={k.houseProfit >= 0 ? "up" : "down"} />
        <Kpi icon={Activity} label="Trades" value={String(k.tradeCount)} sub={`${winRate}% player win`} />
      </div>

      {/* Payment setup diagnostics */}
      {data.setup && <SetupCard setup={data.setup} />}

      {/* Volume chart */}
      <div className="card p-5">
        <div className="mb-3 text-sm font-bold">Trade volume · last 14 days</div>
        {daily.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted">No trades yet.</div>
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fill: "#8b93a6", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#8b93a6", fontSize: 11 }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  cursor={{ fill: "rgba(124,92,255,0.08)" }}
                  contentStyle={{ background: "#12131b", border: "1px solid #262a38", borderRadius: 10, fontSize: 12 }}
                  formatter={(v: any) => [`$${Number(v).toLocaleString()}`, "Volume"]}
                />
                <Bar dataKey="volume" radius={[5, 5, 0, 0]}>
                  {daily.map((_: any, i: number) => (
                    <Cell key={i} fill="url(#vbar)" />
                  ))}
                </Bar>
                <defs>
                  <linearGradient id="vbar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#9E86FF" />
                    <stop offset="100%" stopColor="#6A47F5" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Pending */}
      <div className="card overflow-hidden">
        <div className="border-b border-border px-5 py-3 font-bold">Pending requests ({pending.length})</div>
        {pending.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted">Nothing waiting. You’re all caught up.</div>
        ) : (
          <div className="divide-y divide-border">
            {pending.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${p.type === "deposit" ? "bg-up/15 text-up" : "bg-gold/15 text-gold"}`}>
                      {p.type}
                    </span>
                    <span className="tabular">{money(Math.abs(Number(p.amount)))}</span>
                  </div>
                  <div className="text-xs text-muted">{p.user_name} · {p.email}</div>
                  <div className="text-[11px] text-muted">{p.method} · {p.reference || "—"} · {shortTime(p.created_at)}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => act(p.id, "approve")} disabled={busyId === p.id} className="btn py-1.5 px-3 text-xs text-white" style={{ background: "linear-gradient(180deg,#00e396,#00b877)" }}>
                    <Check className="h-3.5 w-3.5" /> Approve
                  </button>
                  <button onClick={() => act(p.id, "reject")} disabled={busyId === p.id} className="btn btn-ghost py-1.5 px-3 text-xs text-down">
                    <X className="h-3.5 w-3.5" /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top users by activity */}
      <div className="card overflow-hidden">
        <div className="border-b border-border px-5 py-3 font-bold">Players · by activity</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="px-5 py-2 font-medium">Player</th>
                <th className="px-3 py-2 text-right font-medium">Balance</th>
                <th className="px-3 py-2 text-right font-medium">Trades</th>
                <th className="px-5 py-2 text-right font-medium">Player P&L</th>
              </tr>
            </thead>
            <tbody>
              {(data.topUsers || []).map((u: any) => (
                <tr key={u.id} className="border-b border-border/60">
                  <td className="px-5 py-2.5">
                    <div className="font-medium">{u.name}</div>
                    <div className="text-[11px] text-muted">{u.email}</div>
                  </td>
                  <td className="tabular px-3 py-2.5 text-right text-brand">{money(u.balance)}</td>
                  <td className="tabular px-3 py-2.5 text-right">{u.trades}</td>
                  <td className={`tabular px-5 py-2.5 text-right font-bold ${u.pnl >= 0 ? "text-up" : "text-down"}`}>
                    {money(u.pnl, { sign: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SetupCard({ setup }: { setup: any }) {
  const groups: { title: string; ready?: boolean; items: [string, boolean][] }[] = [
    {
      title: "M-Pesa deposits (Kenya)",
      ready: setup.mpesa.deposits_ready,
      items: [
        ["MPESA_CONSUMER_KEY", setup.mpesa.MPESA_CONSUMER_KEY],
        ["MPESA_CONSUMER_SECRET", setup.mpesa.MPESA_CONSUMER_SECRET],
        ["MPESA_SHORTCODE", setup.mpesa.MPESA_SHORTCODE],
        ["MPESA_PASSKEY", setup.mpesa.MPESA_PASSKEY],
      ],
    },
    {
      title: "M-Pesa withdrawals (B2C)",
      items: [
        ["MPESA_INITIATOR_NAME", setup.mpesa.MPESA_INITIATOR_NAME],
        ["MPESA_SECURITY_CREDENTIAL", setup.mpesa.MPESA_SECURITY_CREDENTIAL],
      ],
    },
    {
      title: "Shared",
      items: [
        ["PUBLIC_BASE_URL", setup.shared.PUBLIC_BASE_URL],
        ["MPESA_CALLBACK_SECRET", setup.shared.MPESA_CALLBACK_SECRET],
      ],
    },
    { title: "Card & Bank (Paystack)", items: [["PAYSTACK_SECRET_KEY", setup.card_bank.PAYSTACK_SECRET_KEY]] },
    {
      title: "Crypto (NOWPayments)",
      items: [
        ["NOWPAYMENTS_API_KEY", setup.crypto.NOWPAYMENTS_API_KEY],
        ["NOWPAYMENTS_IPN_SECRET", setup.crypto.NOWPAYMENTS_IPN_SECRET],
      ],
    },
    {
      title: "Uganda (Collecto)",
      items: [
        ["COLLECTO_USERNAME", setup.uganda.COLLECTO_USERNAME],
        ["COLLECTO_BASE_URL", setup.uganda.COLLECTO_BASE_URL],
        ["COLLECTO_RELAY_SECRET / API_KEY", setup.uganda.COLLECTO_RELAY_SECRET || setup.uganda.COLLECTO_API_KEY],
      ],
    },
  ];

  return (
    <div className="card p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-bold">Payment setup</div>
        <span
          className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
            setup.mpesa.deposits_ready && setup.mpesa.is_production
              ? "bg-up/15 text-up"
              : "bg-down/15 text-down"
          }`}
        >
          M-Pesa {setup.mpesa.deposits_ready ? "keys ✓" : "OFF"} · MPESA_ENV=
          {setup.mpesa.MPESA_ENV ?? "(not set → sandbox)"}
          {setup.mpesa.is_production ? " · PRODUCTION" : " · SANDBOX"}
        </span>
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-muted">
        Green = the server can see this variable. Added a variable but it’s red? It isn’t in
        this deployment — make sure it’s set for <b>Production</b> in Vercel, then redeploy.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => (
          <div key={g.title} className="rounded-xl border border-border bg-white/[0.02] p-3">
            <div className="mb-1.5 text-xs font-semibold">{g.title}</div>
            <div className="space-y-1">
              {g.items.map(([name, ok]) => (
                <div key={name} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="tabular text-muted">{name}</span>
                  {ok ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-up" />
                  ) : (
                    <X className="h-3.5 w-3.5 shrink-0 text-down" />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: any;
  label: string;
  value: string;
  sub?: string;
  accent?: "up" | "down" | "gold";
}) {
  const color =
    accent === "up" ? "text-up" : accent === "down" ? "text-down" : accent === "gold" ? "text-gold" : "text-fg";
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-muted">{label}</span>
        <Icon className="h-4 w-4 text-muted" />
      </div>
      <div className={`tabular mt-1 text-xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted">{sub}</div>}
    </div>
  );
}
