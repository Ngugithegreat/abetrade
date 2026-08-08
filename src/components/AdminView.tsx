"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, X, Users, Wallet, Activity } from "lucide-react";
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

type AdminUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  balance: number;
  created_at: string;
};

export function AdminView() {
  const [pending, setPending] = useState<Pending[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<any>(null);
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
    const json = await res.json();
    setPending(json.pending || []);
    setUsers(json.users || []);
    setStats(json.stats || null);
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

  if (forbidden) {
    return (
      <div className="card p-8 text-center text-muted">
        You don’t have access to the admin panel.
      </div>
    );
  }
  if (loading) {
    return <div className="card p-8 text-center text-muted">Loading…</div>;
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <Stat icon={Users} label="Users" value={String(stats?.user_count ?? 0)} />
        <Stat
          icon={Wallet}
          label="Total balances"
          value={money(Number(stats?.total_balance ?? 0))}
        />
        <Stat icon={Activity} label="Trades" value={String(stats?.trade_count ?? 0)} />
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-border px-5 py-3 font-bold">
          Pending requests ({pending.length})
        </div>
        {pending.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted">
            Nothing waiting. You’re all caught up.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {pending.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                        p.type === "deposit"
                          ? "bg-up/15 text-up"
                          : "bg-gold/15 text-gold"
                      }`}
                    >
                      {p.type}
                    </span>
                    <span className="tabular">{money(Math.abs(Number(p.amount)))}</span>
                  </div>
                  <div className="text-xs text-muted">
                    {p.user_name} · {p.email}
                  </div>
                  <div className="text-[11px] text-muted">
                    {p.method} · {p.reference || "—"} · {shortTime(p.created_at)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => act(p.id, "approve")}
                    disabled={busyId === p.id}
                    className="btn py-1.5 px-3 text-xs text-white"
                    style={{ background: "linear-gradient(180deg,#00e396,#00b877)" }}
                  >
                    <Check className="h-3.5 w-3.5" /> Approve
                  </button>
                  <button
                    onClick={() => act(p.id, "reject")}
                    disabled={busyId === p.id}
                    className="btn btn-ghost py-1.5 px-3 text-xs text-down"
                  >
                    <X className="h-3.5 w-3.5" /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-border px-5 py-3 font-bold">Users</div>
        <div className="divide-y divide-border">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between px-5 py-2.5">
              <div>
                <div className="text-sm font-medium">
                  {u.name}
                  {u.role === "admin" && (
                    <span className="ml-2 rounded bg-brand/15 px-1.5 py-0.5 text-[10px] text-brand">
                      admin
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-muted">{u.email}</div>
              </div>
              <div className="tabular text-sm font-bold text-brand">
                {money(u.balance)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string;
}) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface2 text-brand">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
        <div className="tabular text-lg font-bold">{value}</div>
      </div>
    </div>
  );
}
