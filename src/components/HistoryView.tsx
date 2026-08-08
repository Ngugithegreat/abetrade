"use client";

import { useApp, Trade } from "./app-context";
import { marketBySymbol } from "@/lib/markets";
import { money, shortTime } from "@/lib/format";
import { ArrowUp, ArrowDown } from "lucide-react";

export function HistoryView() {
  const { data } = useApp();
  const trades = data?.closedTrades ?? [];

  const wins = trades.filter((t) => t.status === "won").length;
  const losses = trades.filter((t) => t.status === "lost").length;
  const settled = wins + losses;
  const winRate = settled ? Math.round((wins / settled) * 100) : 0;
  const pnl = trades.reduce((sum, t) => {
    if (t.status === "won") return sum + (Number(t.payout) - Number(t.stake));
    if (t.status === "lost") return sum - Number(t.stake);
    return sum;
  }, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Trades" value={String(settled)} />
        <Stat label="Win rate" value={`${winRate}%`} accent="brand" />
        <Stat label="Wins" value={String(wins)} accent="up" />
        <Stat
          label="Net P&L"
          value={money(pnl, { sign: true })}
          accent={pnl >= 0 ? "up" : "down"}
        />
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-border px-5 py-3 font-bold">
          Trade history
        </div>
        {trades.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted">
            No settled trades yet. Head to the terminal and place your first trade.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {trades.map((t) => (
              <TradeRow key={t.id} t={t} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TradeRow({ t }: { t: Trade }) {
  const m = marketBySymbol(t.symbol);
  const won = t.status === "won";
  const profit = won ? Number(t.payout) - Number(t.stake) : -Number(t.stake);
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${
            t.direction === "rise" ? "bg-up/15 text-up" : "bg-down/15 text-down"
          }`}
        >
          {t.direction === "rise" ? (
            <ArrowUp className="h-4 w-4" />
          ) : (
            <ArrowDown className="h-4 w-4" />
          )}
        </div>
        <div>
          <div className="text-sm font-semibold">
            {m?.short ?? t.symbol}{" "}
            <span className="font-normal text-muted">
              {t.direction === "rise" ? "Rise" : "Fall"}
            </span>
          </div>
          <div className="tabular text-[11px] text-muted">
            {Number(t.entry_price).toFixed(2)} →{" "}
            {t.exit_price != null ? Number(t.exit_price).toFixed(2) : "—"} ·{" "}
            {shortTime(t.created_at)}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div
          className={`tabular text-sm font-bold ${won ? "text-up" : "text-down"}`}
        >
          {money(profit, { sign: true })}
        </div>
        <div
          className={`text-[10px] font-semibold uppercase ${
            won ? "text-up" : "text-down"
          }`}
        >
          {t.status}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "brand" | "up" | "down";
}) {
  const color =
    accent === "brand"
      ? "text-brand"
      : accent === "up"
      ? "text-up"
      : accent === "down"
      ? "text-down"
      : "text-white";
  return (
    <div className="card p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`tabular mt-1 text-xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
