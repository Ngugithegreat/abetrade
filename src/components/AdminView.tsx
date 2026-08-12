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
  Percent,
  Ban,
  ShieldCheck,
  Gift,
  Megaphone,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { money, shortTime } from "@/lib/format";
import { AdminSkeleton } from "./Skeleton";

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

type Player = {
  id: number;
  name: string;
  email: string;
  account_no: string;
  status: string;
  promo: boolean;
  balance: number;
  pnl: number;
  trades: number;
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

  const post = useCallback(
    async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/admin/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await load();
      return res;
    },
    [load]
  );

  async function act(id: number, action: "approve" | "reject") {
    setBusyId(id);
    try {
      await post({ id, action });
    } finally {
      setBusyId(null);
    }
  }

  if (forbidden)
    return <div className="card p-8 text-center text-muted">You don’t have access to the admin panel.</div>;
  if (loading || !data) return <AdminSkeleton />;

  const k = data.kpi;
  const pending: Pending[] = data.pending || [];
  const players: Player[] = data.topUsers || [];
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

      {/* House edge + referral controls */}
      <div className="grid gap-3 lg:grid-cols-2">
        <HouseEdgeCard edge={Number(data.houseEdge ?? 0.05)} onSave={(pct) => post({ action: "set_house_edge", percent: pct })} />
        <RateCard
          icon={Gift}
          title="Referral reward"
          blurb={(pct) =>
            `Referrers earn ${pct || 0}% of each friend's first deposit (capped at $100), credited automatically.`
          }
          value={Number(data.referralPct ?? 0.1)}
          onSave={(pct) => post({ action: "set_referral_pct", percent: pct })}
        />
      </div>

      {/* Risk limits — protect the bankroll from big single trades */}
      <div className="grid gap-3 lg:grid-cols-2">
        <AmountCard
          title="Max stake per trade"
          blurb="The biggest amount a player can stake on one trade."
          value={Number(data.maxStakeCents ?? 50000) / 100}
          onSave={(usd) => post({ action: "set_max_stake", usd })}
        />
        <AmountCard
          title="Max payout per trade"
          blurb="The most any single trade can win — caps your loss on one trade."
          value={Number(data.maxPayoutCents ?? 200000) / 100}
          onSave={(usd) => post({ action: "set_max_payout", usd })}
        />
      </div>

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

      {/* KYC verifications */}
      {(data.kyc || []).length > 0 && (
        <div className="card overflow-hidden">
          <div className="border-b border-border px-5 py-3 font-bold">
            Identity verifications ({data.kyc.length})
          </div>
          <div className="divide-y divide-border">
            {(data.kyc as any[]).map((k) => (
              <div key={k.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div>
                  <div className="text-sm font-semibold">
                    {k.kyc_name} <span className="text-[11px] text-muted">({k.account_no})</span>
                  </div>
                  <div className="text-xs text-muted">
                    ID: {k.kyc_id_number} · {k.kyc_phone} · {k.email}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => post({ action: "kyc_approve", userId: k.id })}
                    className="btn py-1.5 px-3 text-xs text-white"
                    style={{ background: "linear-gradient(180deg,#00e396,#00b877)" }}
                  >
                    <Check className="h-3.5 w-3.5" /> Approve
                  </button>
                  <button
                    onClick={() => {
                      const r = window.prompt(`Reason for rejecting ${k.kyc_name}'s verification:`, "");
                      if (r != null) post({ action: "kyc_reject", userId: k.id, reason: r });
                    }}
                    className="btn btn-ghost py-1.5 px-3 text-xs text-down"
                  >
                    <X className="h-3.5 w-3.5" /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Player management */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <span className="font-bold">Players &amp; accounts</span>
          <span className="text-[11px] text-muted">Block abusers · grant promo credit · flag promo accounts</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="px-5 py-2 font-medium">Account</th>
                <th className="px-3 py-2 text-right font-medium">Balance</th>
                <th className="px-3 py-2 text-right font-medium">Trades</th>
                <th className="px-3 py-2 text-right font-medium">Player P&amp;L</th>
                <th className="px-5 py-2 text-right font-medium">Manage</th>
              </tr>
            </thead>
            <tbody>
              {players.map((u) => (
                <PlayerRow key={u.id} u={u} onAction={post} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PlayerRow({
  u,
  onAction,
}: {
  u: Player;
  onAction: (p: Record<string, unknown>) => Promise<Response>;
}) {
  const [busy, setBusy] = useState(false);
  const blocked = u.status === "blocked";

  async function run(p: Record<string, unknown>) {
    setBusy(true);
    try {
      await onAction(p);
    } finally {
      setBusy(false);
    }
  }

  function grantBonus() {
    const raw = window.prompt(`Grant promo credit to ${u.name} (${u.account_no}). Amount in USD (negative to remove):`, "10");
    if (raw == null) return;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount === 0) return;
    run({ action: "grant_bonus", userId: u.id, amount });
  }

  return (
    <tr className="border-b border-border/60">
      <td className="px-5 py-2.5">
        <div className="flex items-center gap-2">
          <span className="font-medium">{u.name}</span>
          {u.promo && (
            <span className="rounded bg-brand/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-brand">Promo</span>
          )}
          {blocked && (
            <span className="rounded bg-down/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-down">Blocked</span>
          )}
        </div>
        <div className="tabular text-[11px] text-muted">{u.account_no} · {u.email}</div>
      </td>
      <td className="tabular px-3 py-2.5 text-right text-brand">{money(u.balance)}</td>
      <td className="tabular px-3 py-2.5 text-right">{u.trades}</td>
      <td className={`tabular px-3 py-2.5 text-right font-bold ${u.pnl >= 0 ? "text-up" : "text-down"}`}>
        {money(u.pnl, { sign: true })}
      </td>
      <td className="px-5 py-2.5">
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={grantBonus}
            disabled={busy}
            title="Grant promo credit"
            className="btn btn-ghost h-8 px-2 text-[11px]"
          >
            <Gift className="h-3.5 w-3.5 text-brand" /> Bonus
          </button>
          <button
            onClick={() => run({ action: "toggle_promo", userId: u.id, value: !u.promo })}
            disabled={busy}
            title="Flag as promotional account"
            className={`btn h-8 px-2 text-[11px] ${u.promo ? "btn-brand" : "btn-ghost"}`}
          >
            <Megaphone className="h-3.5 w-3.5" /> Promo
          </button>
          {blocked ? (
            <button
              onClick={() => run({ action: "unblock_user", userId: u.id })}
              disabled={busy}
              className="btn btn-ghost h-8 px-2 text-[11px] text-up"
            >
              <ShieldCheck className="h-3.5 w-3.5" /> Unblock
            </button>
          ) : (
            <button
              onClick={() => run({ action: "block_user", userId: u.id })}
              disabled={busy}
              className="btn btn-ghost h-8 px-2 text-[11px] text-down"
            >
              <Ban className="h-3.5 w-3.5" /> Block
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function HouseEdgeCard({ edge, onSave }: { edge: number; onSave: (pct: number) => Promise<Response> }) {
  const [pct, setPct] = useState(String(Math.round(edge * 1000) / 10));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setPct(String(Math.round(edge * 1000) / 10));
  }, [edge]);

  async function save() {
    const v = Number(pct);
    if (!Number.isFinite(v) || v < 0 || v > 15) return;
    setSaving(true);
    setSaved(false);
    try {
      await onSave(v);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold">
            <Percent className="h-4 w-4 text-brand" /> House earn (margin)
          </div>
          <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-muted">
            The edge baked into every payout. At {pct || 0}% the house keeps ~{pct || 0}% of all
            volume over time. Rise/Fall pays {Math.max(1.05, 2 * (1 - (Number(pct) || 0) / 100)).toFixed(2)}×.
            Max 15% — a higher edge would leave winners no profit.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-xl border border-border bg-surface2 px-3 py-2">
            <input
              value={pct}
              onChange={(e) => setPct(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              className="tabular w-16 bg-transparent text-right text-lg font-bold outline-none"
            />
            <span className="ml-1 text-muted">%</span>
          </div>
          <button onClick={save} disabled={saving} className="btn btn-brand px-4 py-2.5 text-sm">
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RateCard({
  icon: Icon,
  title,
  blurb,
  value,
  onSave,
}: {
  icon: any;
  title: string;
  blurb: (pct: string) => string;
  value: number;
  onSave: (pct: number) => Promise<Response>;
}) {
  const [pct, setPct] = useState(String(Math.round(value * 1000) / 10));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setPct(String(Math.round(value * 1000) / 10));
  }, [value]);

  async function save() {
    const v = Number(pct);
    if (!Number.isFinite(v) || v < 0 || v > 50) return;
    setSaving(true);
    setSaved(false);
    try {
      await onSave(v);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 text-sm font-bold">
        <Icon className="h-4 w-4 text-brand" /> {title}
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-muted">{blurb(pct)}</p>
      <div className="mt-3 flex items-center gap-2">
        <div className="flex items-center rounded-xl border border-border bg-surface2 px-3 py-2">
          <input
            value={pct}
            onChange={(e) => setPct(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            className="tabular w-16 bg-transparent text-right text-lg font-bold outline-none"
          />
          <span className="ml-1 text-muted">%</span>
        </div>
        <button onClick={save} disabled={saving} className="btn btn-brand px-4 py-2.5 text-sm">
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
        </button>
      </div>
    </div>
  );
}

function AmountCard({
  title,
  blurb,
  value,
  onSave,
}: {
  title: string;
  blurb: string;
  value: number;
  onSave: (usd: number) => Promise<Response>;
}) {
  const [amt, setAmt] = useState(String(Math.round(value)));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setAmt(String(Math.round(value)));
  }, [value]);

  async function save() {
    const v = Number(amt);
    if (!Number.isFinite(v) || v <= 0) return;
    setSaving(true);
    setSaved(false);
    try {
      await onSave(v);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 text-sm font-bold">
        <Coins className="h-4 w-4 text-brand" /> {title}
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-muted">{blurb}</p>
      <div className="mt-3 flex items-center gap-2">
        <div className="flex items-center rounded-xl border border-border bg-surface2 px-3 py-2">
          <span className="mr-1 text-muted">$</span>
          <input
            value={amt}
            onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            className="tabular w-24 bg-transparent text-right text-lg font-bold outline-none"
          />
        </div>
        <button onClick={save} disabled={saving} className="btn btn-brand px-4 py-2.5 text-sm">
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
        </button>
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
