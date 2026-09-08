"use client";

import { useEffect, useState } from "react";
import {
  Mail,
  Phone,
  Globe,
  Hash,
  CalendarDays,
  TrendingUp,
  Copy,
  Check,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { useApp } from "./app-context";
import { money } from "@/lib/format";
import { COUNTRIES } from "@/lib/countries";

type Profile = {
  name: string;
  email: string;
  phone: string | null;
  country: string | null;
  account_no: string;
  created_at: string;
  balance: number;
  deposited: number;
  withdrawn: number;
  trades: number;
  wins: number;
  pnl: number;
};

export function ProfileView() {
  const { user, logout } = useApp();
  const [p, setP] = useState<Profile | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/profile", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => j.profile && setP(j.profile))
      .catch(() => {});
  }, []);

  const name = p?.name ?? user?.name ?? "";
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("") || "U";
  const country = COUNTRIES.find((c) => c.code === (p?.country ?? user?.country));
  const winRate = p && p.trades ? Math.round((p.wins / p.trades) * 100) : 0;
  const memberSince = p?.created_at
    ? new Date(p.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "—";

  async function copyAcc() {
    try {
      await navigator.clipboard.writeText(p?.account_no ?? user?.account_no ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Identity card */}
      <div className="card relative overflow-hidden p-6">
        <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-brand/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-light to-brand-dark text-2xl font-black text-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xl font-bold">{name}</div>
            <div className="truncate text-sm text-muted">{p?.email ?? user?.email}</div>
            <button
              onClick={copyAcc}
              className="tabular mt-1 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface2/60 px-2 py-0.5 text-xs font-semibold transition hover:border-brand/40"
            >
              {p?.account_no ?? user?.account_no}
              {copied ? <Check className="h-3 w-3 text-up" /> : <Copy className="h-3 w-3 text-muted" />}
            </button>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-up/30 bg-up/10 px-3 py-1 text-[11px] font-semibold text-up">
            <ShieldCheck className="h-3.5 w-3.5" /> Live account
          </span>
        </div>
      </div>

      {/* Details */}
      <div className="card p-5">
        <div className="mb-3 text-sm font-bold">Account details</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Detail icon={Mail} label="Email" value={p?.email ?? user?.email ?? "—"} />
          <Detail icon={Phone} label="Phone" value={p?.phone ?? user?.phone ?? "Not set"} />
          <Detail icon={Globe} label="Country" value={country ? `${country.flag} ${country.name}` : "—"} />
          <Detail icon={Hash} label="Account number" value={p?.account_no ?? user?.account_no ?? "—"} />
          <Detail icon={CalendarDays} label="Member since" value={memberSince} />
          <Detail icon={TrendingUp} label="Balance" value={money(p?.balance ?? user?.balance ?? 0)} />
        </div>
      </div>

      {/* Trading stats */}
      <div className="card p-5">
        <div className="mb-3 text-sm font-bold">Your trading</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Deposited" value={money(p?.deposited ?? 0)} />
          <Stat label="Withdrawn" value={money(p?.withdrawn ?? 0)} accent="gold" />
          <Stat label="Trades" value={String(p?.trades ?? 0)} />
          <Stat label="Win rate" value={`${winRate}%`} accent="brand" />
          <Stat label="Wins" value={String(p?.wins ?? 0)} accent="up" />
          <Stat
            label="Net P&L"
            value={money(p?.pnl ?? 0, { sign: true })}
            accent={(p?.pnl ?? 0) >= 0 ? "up" : "down"}
          />
        </div>
      </div>

      <button onClick={logout} className="btn btn-ghost w-full border border-border py-3 text-sm text-down">
        <LogOut className="h-4 w-4" /> Log out
      </button>
    </div>
  );
}

function Detail({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface2/40 px-3.5 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface2 text-muted">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
        <div className="truncate text-sm font-semibold">{value}</div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: "up" | "down" | "gold" | "brand" }) {
  const c =
    accent === "up" ? "text-up" : accent === "down" ? "text-down" : accent === "gold" ? "text-gold" : accent === "brand" ? "text-brand" : "text-fg";
  return (
    <div className="rounded-xl border border-border bg-surface2/40 px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`tabular mt-0.5 text-lg font-bold ${c}`}>{value}</div>
    </div>
  );
}
