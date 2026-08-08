"use client";

import { useRef, useState } from "react";
import { Play, Square, Bot, Target, ShieldAlert } from "lucide-react";
import { money, cents } from "@/lib/format";
import { MAX_STAKE, DigitSubtype } from "@/lib/markets";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Stats = {
  runs: number;
  wins: number;
  losses: number;
  pnlCents: number;
  stakeCents: number;
};

export function BotPanel({
  symbol,
  contract,
  subtype,
  barrier,
  ticks,
  duration,
  baseStakeCents,
  stakeValid,
  setBalance,
  refresh,
  showToast,
}: {
  symbol: string;
  contract: "rise_fall" | "digit";
  subtype: DigitSubtype;
  barrier: number;
  ticks: number;
  duration: number;
  baseStakeCents: number;
  stakeValid: boolean;
  setBalance: (b: number) => void;
  refresh: () => void;
  showToast: (m: string, ok: boolean) => void;
}) {
  const sides: [string, string] =
    contract === "rise_fall"
      ? ["rise", "fall"]
      : subtype === "even_odd"
      ? ["even", "odd"]
      : subtype === "over_under"
      ? ["over", "under"]
      : ["matches", "differs"];

  const [side, setSide] = useState(sides[0]);
  const [martingale, setMartingale] = useState("2");
  const [targetProfit, setTargetProfit] = useState("50");
  const [stopLoss, setStopLoss] = useState("30");
  const [maxRuns, setMaxRuns] = useState("50");
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState<Stats>({
    runs: 0,
    wins: 0,
    losses: 0,
    pnlCents: 0,
    stakeCents: baseStakeCents,
  });
  const stopRef = useRef(false);

  // keep chosen side valid when the contract changes
  if (!sides.includes(side)) setTimeout(() => setSide(sides[0]), 0);

  async function placeAndSettle(stakeCents: number) {
    const body: Record<string, unknown> =
      contract === "rise_fall"
        ? { kind: "rise_fall", symbol, direction: side, stake: stakeCents, duration }
        : { kind: "digit", symbol, direction: side, stake: stakeCents, subtype, barrier, ticks };
    const res = await fetch("/api/trade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json();
    if (!res.ok) return { error: j.error || "Trade failed." };
    if (typeof j.balance === "number") setBalance(j.balance);
    const trade = j.trade;

    const expiryMs = Number(trade.expiry_epoch) * 1000;
    while (Date.now() < expiryMs + 400) {
      if (stopRef.current) break;
      await sleep(300);
    }
    for (let i = 0; i < 20 && !stopRef.current; i++) {
      const sr = await fetch("/api/trade/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: trade.id }),
      });
      const sj = await sr.json();
      if (sr.ok && sj.trade && sj.trade.status !== "open") {
        if (typeof sj.balance === "number") setBalance(sj.balance);
        const profit =
          sj.trade.status === "won"
            ? Number(sj.trade.payout) - stakeCents
            : -stakeCents;
        return { status: sj.trade.status as "won" | "lost", profit };
      }
      await sleep(1000);
    }
    return { error: "Could not settle in time." };
  }

  async function run() {
    if (!stakeValid) {
      showToast("Set a valid stake first.", false);
      return;
    }
    stopRef.current = false;
    setRunning(true);
    const mult = Math.max(1, Number(martingale) || 2);
    const tpCents = cents(Number(targetProfit) || 0);
    const slCents = cents(Number(stopLoss) || 0);
    const runsCap = Math.max(1, Math.round(Number(maxRuns) || 50));

    let stake = baseStakeCents;
    let pnl = 0;
    let runs = 0;
    let wins = 0;
    let losses = 0;
    let reason = "Bot stopped";

    setStats({ runs, wins, losses, pnlCents: 0, stakeCents: stake });

    while (!stopRef.current) {
      if (runs >= runsCap) { reason = "Max runs reached"; break; }
      if (tpCents > 0 && pnl >= tpCents) { reason = "🎯 Target profit reached"; break; }
      if (slCents > 0 && -pnl >= slCents) { reason = "🛑 Stop loss reached"; break; }

      const r = await placeAndSettle(stake);
      if ("error" in r) { reason = r.error!; break; }

      runs++;
      pnl += r.profit;
      if (r.status === "won") { wins++; stake = baseStakeCents; }
      else { losses++; stake = Math.min(Math.round(stake * mult), MAX_STAKE); }

      setStats({ runs, wins, losses, pnlCents: pnl, stakeCents: stake });
      refresh();
      await sleep(500);
    }

    stopRef.current = false;
    setRunning(false);
    showToast(`${reason} · P&L ${money(pnl, { sign: true })}`, pnl >= 0);
  }

  function stop() {
    stopRef.current = true;
    setRunning(false);
  }

  const sideLabel = (s: string) => s.toUpperCase();

  return (
    <div className="mt-3 space-y-3">
      {/* side */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Bot trades</label>
        <div className="grid grid-cols-2 gap-2">
          {sides.map((s) => (
            <button
              key={s}
              disabled={running}
              onClick={() => setSide(s)}
              className={`btn py-2 text-xs ${side === s ? "btn-brand" : "btn-ghost"}`}
            >
              {sideLabel(s)}
              {contract === "digit" && subtype !== "even_odd" ? ` ${barrier}` : ""}
            </button>
          ))}
        </div>
      </div>

      {/* params */}
      <div className="grid grid-cols-2 gap-2">
        <BotInput label="Martingale ×" value={martingale} onChange={setMartingale} disabled={running} />
        <BotInput label="Max runs" value={maxRuns} onChange={setMaxRuns} disabled={running} />
        <BotInput
          label="Target profit ($)"
          value={targetProfit}
          onChange={setTargetProfit}
          disabled={running}
          icon={<Target className="h-3 w-3 text-up" />}
        />
        <BotInput
          label="Stop loss ($)"
          value={stopLoss}
          onChange={setStopLoss}
          disabled={running}
          icon={<ShieldAlert className="h-3 w-3 text-down" />}
        />
      </div>

      {/* live stats */}
      {(running || stats.runs > 0) && (
        <div className="grid grid-cols-4 gap-2 rounded-xl border border-border bg-white/[0.02] p-2 text-center">
          <BotStat label="Runs" value={String(stats.runs)} />
          <BotStat label="Wins" value={String(stats.wins)} accent="up" />
          <BotStat label="Losses" value={String(stats.losses)} accent="down" />
          <BotStat
            label="P&L"
            value={money(stats.pnlCents, { sign: true })}
            accent={stats.pnlCents >= 0 ? "up" : "down"}
          />
        </div>
      )}

      {running ? (
        <button onClick={stop} className="btn w-full py-3 text-white" style={{ background: "linear-gradient(180deg,#ff5b6a,#e13b4b)" }}>
          <Square className="h-4 w-4" /> Stop bot · next stake {money(stats.stakeCents)}
        </button>
      ) : (
        <button onClick={run} disabled={!stakeValid} className="btn btn-brand w-full py-3">
          <Play className="h-4 w-4" /> Start bot
        </button>
      )}

      <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-muted">
        <Bot className="mt-0.5 h-3 w-3 shrink-0" />
        The bot auto-places {contract === "digit" ? "digit" : "rise/fall"} trades and
        multiplies your stake after a loss (martingale). It stops at your target profit,
        stop loss, or max runs. Keep this tab open while it runs.
      </p>
    </div>
  );
}

function BotInput({
  label,
  value,
  onChange,
  disabled,
  icon,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1 text-[10px] font-medium text-muted">
        {icon} {label}
      </label>
      <input
        className="input tabular py-2 text-sm"
        inputMode="decimal"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
      />
    </div>
  );
}

function BotStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "up" | "down";
}) {
  const c = accent === "up" ? "text-up" : accent === "down" ? "text-down" : "text-white";
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`tabular text-sm font-bold ${c}`}>{value}</div>
    </div>
  );
}
