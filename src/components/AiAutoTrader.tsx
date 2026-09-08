"use client";

import { useMemo, useRef, useState } from "react";
import { Sparkles, X, Radar, Play, Square, Target, ShieldAlert, TrendingUp } from "lucide-react";
import { money, cents } from "@/lib/format";
import { MARKETS, MIN_STAKE, MAX_STAKE, marketBySymbol } from "@/lib/markets";
import { computeSignals, type Signal } from "./AiScanner";
import type { MarketTick } from "@/lib/useDerivFeed";
import { primeAudio } from "@/lib/feedback";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Stats = { runs: number; wins: number; losses: number; pnlCents: number };
type RunLog = { n: number; label: string; profitCents: number; won: boolean };

/**
 * AI Auto-Trader — a self-driving popup. It scans EVERY market, trades the
 * single strongest live signal, then re-scans and continues on its own. The
 * user never picks a pair; the AI does. Trades on the active account (demo/real)
 * and honours test/sim mode.
 */
export function AiAutoTrader({
  open,
  onClose,
  markets,
  demo,
  testMode,
  digitTicks,
  duration,
  setBalance,
  refresh,
  showToast,
}: {
  open: boolean;
  onClose: () => void;
  markets: Record<string, MarketTick>;
  demo: boolean;
  testMode: boolean;
  digitTicks: number;
  duration: number;
  setBalance: (b: number) => void;
  refresh: () => void;
  showToast: (m: string, ok: boolean) => void;
}) {
  const [stake, setStake] = useState("10");
  const [takeProfit, setTakeProfit] = useState("50");
  const [stopLoss, setStopLoss] = useState("30");
  const [martingale, setMartingale] = useState("2");
  const [running, setRunning] = useState(false);
  const [pick, setPick] = useState<Signal | null>(null);
  const [stats, setStats] = useState<Stats>({ runs: 0, wins: 0, losses: 0, pnlCents: 0 });
  const [log, setLog] = useState<RunLog[]>([]);

  const stopRef = useRef(false);
  const marketsRef = useRef(markets);
  marketsRef.current = markets;

  const stakeCents = cents(Number(stake) || 0);
  const stakeValid = stakeCents >= MIN_STAKE && stakeCents <= MAX_STAKE;

  // Live preview of what the AI is seeing across the whole market.
  const top = useMemo(() => computeSignals(markets).slice(0, 3), [markets]);

  if (!open) return null;

  function bodyFor(sig: Signal, sc: number): Record<string, unknown> {
    const b: Record<string, unknown> =
      sig.contract === "digit"
        ? { kind: "digit", symbol: sig.symbol, direction: sig.side, stake: sc, subtype: sig.subtype, barrier: sig.barrier ?? 0, ticks: digitTicks }
        : { kind: "rise_fall", symbol: sig.symbol, direction: sig.side, stake: sc, duration };
    if (demo) b.demo = true;
    else if (testMode) b.testMode = true;
    return b;
  }

  async function placeAndSettle(sc: number) {
    const sig = computeSignals(marketsRef.current)[0];
    if (!sig) return { soft: true as const };
    setPick(sig);
    const short = marketBySymbol(sig.symbol)?.short ?? sig.symbol;
    const label = `${short} ${sig.label}`;

    const res = await fetch("/api/trade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyFor(sig, sc)),
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
        const profit = sj.trade.status === "won" ? Number(sj.trade.payout) - sc : -sc;
        return { status: sj.trade.status as "won" | "lost", profit, label };
      }
      await sleep(1000);
    }
    return { error: "Could not settle in time." };
  }

  async function run() {
    if (!stakeValid) return showToast("Set a valid stake first.", false);
    primeAudio();
    stopRef.current = false;
    setRunning(true);
    setLog([]);
    const base = stakeCents;
    const mult = Math.max(1, Number(martingale) || 1);
    const tp = cents(Number(takeProfit) || 0);
    const sl = cents(Number(stopLoss) || 0);

    let sc = base;
    let pnl = 0, runs = 0, wins = 0, losses = 0;
    let reason = "AI stopped";
    setStats({ runs, wins, losses, pnlCents: 0 });

    while (!stopRef.current) {
      if (tp > 0 && pnl >= tp) { reason = "🎯 Target profit reached"; break; }
      if (sl > 0 && -pnl >= sl) { reason = "🛑 Stop loss reached"; break; }

      const r = await placeAndSettle(sc);
      if ("soft" in r && r.soft) { await sleep(1200); continue; }
      if ("error" in r) { reason = r.error!; break; }

      runs++;
      pnl += r.profit;
      const won = r.status === "won";
      if (won) { wins++; sc = base; } else { losses++; sc = Math.min(Math.round(sc * mult), MAX_STAKE); }
      setStats({ runs, wins, losses, pnlCents: pnl });
      setLog((prev) => [{ n: runs, label: r.label!, profitCents: r.profit, won }, ...prev].slice(0, 12));
      refresh();
      await sleep(600);
    }

    stopRef.current = false;
    setRunning(false);
    setPick(null);
    showToast(`${reason} · P&L ${money(pnl, { sign: true })}`, pnl >= 0);
  }

  function stop() {
    stopRef.current = true;
    setRunning(false);
  }

  const winRate = stats.runs ? Math.round((stats.wins / stats.runs) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={running ? undefined : onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-brand/30 bg-surface shadow-glow">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/15 text-brand">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <div className="text-sm font-bold">AI Auto-Trader</div>
              <div className="text-[11px] text-muted">
                Scans all {MARKETS.length} markets · picks the best {demo ? "· demo" : ""}
              </div>
            </div>
          </div>
          <button onClick={onClose} disabled={running} className="btn btn-ghost h-8 w-8 p-0 disabled:opacity-40">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {/* Live scan / current pick */}
          <div className="rounded-xl border border-brand/30 bg-brand/[0.06] p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-muted">
              <Radar className={`h-3.5 w-3.5 text-brand ${running ? "animate-spin" : ""}`} />
              {running ? "AI is trading the strongest signal…" : "Live market scan"}
            </div>
            {(pick ? [pick] : top).length === 0 ? (
              <div className="py-2 text-center text-[11px] text-muted">Reading live ticks…</div>
            ) : (
              (pick ? [pick] : top).map((s, i) => {
                const mk = marketBySymbol(s.symbol);
                return (
                  <div key={s.symbol} className="flex items-center gap-2 py-1">
                    {!pick && <span className="text-[10px] font-bold text-brand">#{i + 1}</span>}
                    <span className="text-sm font-semibold">{mk?.short ?? s.symbol}</span>
                    <span className="rounded bg-brand/15 px-1.5 py-0.5 text-[10px] font-bold text-brand">{s.label}</span>
                    <span className="ml-auto flex items-center gap-1.5">
                      <span className="h-1 w-14 overflow-hidden rounded-full bg-surface2">
                        <span className="block h-full rounded-full bg-gradient-to-r from-brand-light to-brand" style={{ width: `${s.confidence}%` }} />
                      </span>
                      <span className="tabular text-[11px] font-bold">{s.confidence}%</span>
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* Settings */}
          {!running && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Stake (USD)</label>
                <input className="input tabular" inputMode="decimal" value={stake} onChange={(e) => setStake(e.target.value.replace(/[^0-9.]/g, ""))} />
                <div className="mt-2 grid grid-cols-5 gap-1.5">
                  {[1, 5, 10, 20, 50].map((v) => (
                    <button key={v} onClick={() => setStake(String(v))} className={`btn py-1.5 text-[11px] ${Number(stake) === v ? "btn-brand" : "btn-ghost"}`}>
                      ${v}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Take profit $" icon={<Target className="h-3 w-3 text-up" />} value={takeProfit} onChange={setTakeProfit} />
                <Field label="Stop loss $" icon={<ShieldAlert className="h-3 w-3 text-down" />} value={stopLoss} onChange={setStopLoss} />
                <Field label="Martingale ×" value={martingale} onChange={setMartingale} />
              </div>
            </>
          )}

          {/* Live stats */}
          {(running || stats.runs > 0) && (
            <div className="grid grid-cols-4 gap-2 rounded-xl border border-border bg-surface2/60 p-2 text-center">
              <Stat label="Trades" value={String(stats.runs)} />
              <Stat label="Win rate" value={`${winRate}%`} accent="brand" />
              <Stat label="W/L" value={`${stats.wins}/${stats.losses}`} />
              <Stat label="P&L" value={money(stats.pnlCents, { sign: true })} accent={stats.pnlCents >= 0 ? "up" : "down"} />
            </div>
          )}

          {log.length > 0 && (
            <div className="rounded-xl border border-border bg-surface2/60">
              <div className="border-b border-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">Recent</div>
              <div className="max-h-28 overflow-y-auto">
                {log.map((r) => (
                  <div key={r.n} className="flex items-center justify-between px-3 py-1.5 text-[11px]">
                    <span className="text-muted">#{r.n} <span className="text-fg">{r.label}</span></span>
                    <span className={`tabular font-bold ${r.won ? "text-up" : "text-down"}`}>{money(r.profitCents, { sign: true })}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action */}
        <div className="border-t border-border p-4">
          {running ? (
            <button onClick={stop} className="btn w-full py-3 text-white" style={{ background: "linear-gradient(180deg,#ff5b6a,#e13b4b)" }}>
              <Square className="h-4 w-4" /> Stop AI
            </button>
          ) : (
            <button onClick={run} disabled={!stakeValid} className="btn btn-brand w-full py-3">
              <Play className="h-4 w-4" /> Start AI auto-trade
            </button>
          )}
          <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-relaxed text-muted">
            <TrendingUp className="mt-0.5 h-3 w-3 shrink-0" />
            The AI scans every market and trades the strongest live signal, re-scanning after each
            trade. Signals are insights, not guarantees. Keep this open while it runs.
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, icon }: { label: string; value: string; onChange: (v: string) => void; icon?: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1 text-[10px] font-medium text-muted">{icon} {label}</label>
      <input className="input tabular py-2 text-sm" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))} />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: "up" | "down" | "brand" }) {
  const c = accent === "up" ? "text-up" : accent === "down" ? "text-down" : accent === "brand" ? "text-brand" : "text-fg";
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`tabular text-sm font-bold ${c}`}>{value}</div>
    </div>
  );
}
