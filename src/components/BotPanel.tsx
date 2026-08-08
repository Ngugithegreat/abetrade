"use client";

import { useRef, useState } from "react";
import { Play, Square, Bot, Target, ShieldAlert, Sparkles } from "lucide-react";
import { money, cents } from "@/lib/format";
import { MAX_STAKE, DigitSubtype, marketBySymbol } from "@/lib/markets";
import { computeSignals } from "./AiScanner";
import type { MarketTick } from "@/lib/useDerivFeed";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Stats = { runs: number; wins: number; losses: number; pnlCents: number; stakeCents: number };
type RunLog = { n: number; label: string; stakeCents: number; profitCents: number; won: boolean };

const PRESETS = {
  Conservative: { martingale: "1.5", targetProfit: "20", stopLoss: "15", maxRuns: "30" },
  Balanced: { martingale: "2", targetProfit: "50", stopLoss: "30", maxRuns: "50" },
  Aggressive: { martingale: "2.5", targetProfit: "150", stopLoss: "80", maxRuns: "100" },
} as const;
type PresetName = keyof typeof PRESETS;

export function BotPanel({
  symbol,
  contract,
  subtype,
  barrier,
  ticks,
  duration,
  baseStakeCents,
  stakeValid,
  markets,
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
  markets: Record<string, MarketTick>;
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
  const [aiMode, setAiMode] = useState(false);
  const [preset, setPreset] = useState<PresetName>("Balanced");
  const [martingale, setMartingale] = useState<string>(PRESETS.Balanced.martingale);
  const [targetProfit, setTargetProfit] = useState<string>(PRESETS.Balanced.targetProfit);
  const [stopLoss, setStopLoss] = useState<string>(PRESETS.Balanced.stopLoss);
  const [maxRuns, setMaxRuns] = useState<string>(PRESETS.Balanced.maxRuns);
  const [running, setRunning] = useState(false);
  const [aiPick, setAiPick] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>({ runs: 0, wins: 0, losses: 0, pnlCents: 0, stakeCents: baseStakeCents });
  const [log, setLog] = useState<RunLog[]>([]);
  const stopRef = useRef(false);
  const marketsRef = useRef(markets);
  marketsRef.current = markets;

  if (!sides.includes(side)) setTimeout(() => setSide(sides[0]), 0);

  function applyPreset(name: PresetName) {
    setPreset(name);
    const p = PRESETS[name];
    setMartingale(p.martingale);
    setTargetProfit(p.targetProfit);
    setStopLoss(p.stopLoss);
    setMaxRuns(p.maxRuns);
  }

  async function placeAndSettle(stakeCents: number) {
    // Decide the trade — AI mode re-scans and takes the top signal each run.
    let body: Record<string, unknown>;
    let label: string;
    if (aiMode) {
      const top = computeSignals(marketsRef.current)[0];
      if (!top) return { error: "AI: gathering ticks…", soft: true as const };
      const short = marketBySymbol(top.symbol)?.short ?? top.symbol;
      setAiPick(`${short} · ${top.label} (${top.confidence}%)`);
      label = `${short} ${top.label}`;
      body =
        top.contract === "digit"
          ? { kind: "digit", symbol: top.symbol, direction: top.side, stake: stakeCents, subtype: top.subtype, barrier: top.barrier ?? 0, ticks }
          : { kind: "rise_fall", symbol: top.symbol, direction: top.side, stake: stakeCents, duration };
    } else {
      const short = marketBySymbol(symbol)?.short ?? symbol;
      label = `${short} ${side.toUpperCase()}${contract === "digit" && subtype !== "even_odd" ? " " + barrier : ""}`;
      body =
        contract === "rise_fall"
          ? { kind: "rise_fall", symbol, direction: side, stake: stakeCents, duration }
          : { kind: "digit", symbol, direction: side, stake: stakeCents, subtype, barrier, ticks };
    }

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
        const profit = sj.trade.status === "won" ? Number(sj.trade.payout) - stakeCents : -stakeCents;
        return { status: sj.trade.status as "won" | "lost", profit, label };
      }
      await sleep(1000);
    }
    return { error: "Could not settle in time." };
  }

  async function run() {
    if (!stakeValid) return showToast("Set a valid stake first.", false);
    stopRef.current = false;
    setRunning(true);
    setLog([]);
    const mult = Math.max(1, Number(martingale) || 2);
    const tpCents = cents(Number(targetProfit) || 0);
    const slCents = cents(Number(stopLoss) || 0);
    const runsCap = Math.max(1, Math.round(Number(maxRuns) || 50));

    let stake = baseStakeCents;
    let pnl = 0, runs = 0, wins = 0, losses = 0;
    let reason = "Bot stopped";
    setStats({ runs, wins, losses, pnlCents: 0, stakeCents: stake });

    while (!stopRef.current) {
      if (runs >= runsCap) { reason = "Max runs reached"; break; }
      if (tpCents > 0 && pnl >= tpCents) { reason = "🎯 Target profit reached"; break; }
      if (slCents > 0 && -pnl >= slCents) { reason = "🛑 Stop loss reached"; break; }

      const r = await placeAndSettle(stake);
      if ("soft" in r && r.soft) { await sleep(1200); continue; }
      if ("error" in r) { reason = r.error!; break; }

      runs++;
      pnl += r.profit;
      const won = r.status === "won";
      if (won) { wins++; stake = baseStakeCents; } else { losses++; stake = Math.min(Math.round(stake * mult), MAX_STAKE); }

      setStats({ runs, wins, losses, pnlCents: pnl, stakeCents: stake });
      setLog((prev) => [{ n: runs, label: r.label!, stakeCents: 0, profitCents: r.profit, won }, ...prev].slice(0, 12));
      refresh();
      await sleep(500);
    }

    stopRef.current = false;
    setRunning(false);
    setAiPick(null);
    showToast(`${reason} · P&L ${money(pnl, { sign: true })}`, pnl >= 0);
  }

  function stop() {
    stopRef.current = true;
    setRunning(false);
  }

  return (
    <div className="mt-3 space-y-3">
      {/* AI auto-trade toggle */}
      <button
        onClick={() => setAiMode((v) => !v)}
        disabled={running}
        className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-xs transition ${
          aiMode ? "border-brand bg-brand/10" : "border-border bg-surface2/60"
        }`}
      >
        <span className="flex items-center gap-1.5 font-semibold">
          <Sparkles className={`h-3.5 w-3.5 ${aiMode ? "text-brand" : "text-muted"}`} />
          Auto-trade top AI signal
        </span>
        <span className={`h-4 w-8 rounded-full p-0.5 transition ${aiMode ? "bg-brand" : "bg-surface2"}`}>
          <span className={`block h-3 w-3 rounded-full bg-white transition ${aiMode ? "translate-x-4" : ""}`} />
        </span>
      </button>

      {/* Side (hidden in AI mode — the AI picks) */}
      {!aiMode && (
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Bot trades</label>
          <div className="grid grid-cols-2 gap-2">
            {sides.map((s) => (
              <button key={s} disabled={running} onClick={() => setSide(s)} className={`btn py-2 text-xs ${side === s ? "btn-brand" : "btn-ghost"}`}>
                {s.toUpperCase()}
                {contract === "digit" && subtype !== "even_odd" ? ` ${barrier}` : ""}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Presets */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Risk preset</label>
        <div className="grid grid-cols-3 gap-1.5">
          {(Object.keys(PRESETS) as PresetName[]).map((name) => (
            <button key={name} disabled={running} onClick={() => applyPreset(name)} className={`btn py-1.5 text-[11px] ${preset === name ? "btn-brand" : "btn-ghost"}`}>
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* Params */}
      <div className="grid grid-cols-2 gap-2">
        <BotInput label="Martingale ×" value={martingale} onChange={setMartingale} disabled={running} />
        <BotInput label="Max runs" value={maxRuns} onChange={setMaxRuns} disabled={running} />
        <BotInput label="Target profit ($)" value={targetProfit} onChange={setTargetProfit} disabled={running} icon={<Target className="h-3 w-3 text-up" />} />
        <BotInput label="Stop loss ($)" value={stopLoss} onChange={setStopLoss} disabled={running} icon={<ShieldAlert className="h-3 w-3 text-down" />} />
      </div>

      {(running || stats.runs > 0) && (
        <div className="grid grid-cols-4 gap-2 rounded-xl border border-border bg-surface2/60 p-2 text-center">
          <BotStat label="Runs" value={String(stats.runs)} />
          <BotStat label="Wins" value={String(stats.wins)} accent="up" />
          <BotStat label="Losses" value={String(stats.losses)} accent="down" />
          <BotStat label="P&L" value={money(stats.pnlCents, { sign: true })} accent={stats.pnlCents >= 0 ? "up" : "down"} />
        </div>
      )}

      {aiMode && running && aiPick && (
        <div className="flex items-center gap-1.5 rounded-lg bg-brand/10 px-2.5 py-1.5 text-[11px] text-brand">
          <Sparkles className="h-3 w-3" /> AI trading: <span className="font-semibold">{aiPick}</span>
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

      {/* Run history */}
      {log.length > 0 && (
        <div className="rounded-xl border border-border bg-surface2/60">
          <div className="border-b border-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
            Run history
          </div>
          <div className="max-h-28 overflow-y-auto">
            {log.map((r) => (
              <div key={r.n} className="flex items-center justify-between px-3 py-1.5 text-[11px]">
                <span className="text-muted">
                  #{r.n} <span className="text-white">{r.label}</span>
                </span>
                <span className={`tabular font-bold ${r.won ? "text-up" : "text-down"}`}>
                  {money(r.profitCents, { sign: true })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-muted">
        <Bot className="mt-0.5 h-3 w-3 shrink-0" />
        {aiMode
          ? "The bot re-scans every run and trades the strongest live signal. Signals are insights, not guarantees."
          : "The bot auto-places trades and multiplies your stake after a loss (martingale)."}{" "}
        It stops at your target profit, stop loss, or max runs. Keep this tab open while it runs.
      </p>
    </div>
  );
}

function BotInput({ label, value, onChange, disabled, icon }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean; icon?: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1 text-[10px] font-medium text-muted">{icon} {label}</label>
      <input className="input tabular py-2 text-sm" inputMode="decimal" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))} />
    </div>
  );
}

function BotStat({ label, value, accent }: { label: string; value: string; accent?: "up" | "down" }) {
  const c = accent === "up" ? "text-up" : accent === "down" ? "text-down" : "text-fg";
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`tabular text-sm font-bold ${c}`}>{value}</div>
    </div>
  );
}
