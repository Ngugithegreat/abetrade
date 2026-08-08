"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ArrowDown,
  Zap,
  Timer,
  TrendingUp,
  Wifi,
  WifiOff,
  Wallet,
  Hash,
} from "lucide-react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useApp, Trade } from "./app-context";
import { useDerivFeed, useDerivMarkets } from "@/lib/useDerivFeed";
import { PriceChart } from "./PriceChart";
import { Sparkline } from "./Sparkline";
import { DigitHeatmap } from "./DigitHeatmap";
import { BotPanel } from "./BotPanel";
import { AiScanner, Signal } from "./AiScanner";
import {
  MARKETS,
  DURATIONS,
  MULTIPLIERS,
  DEFAULT_MULTIPLIER,
  DIGIT_TICKS,
  DEFAULT_DIGIT_TICKS,
  PAYOUT_MULTIPLIER,
  MIN_STAKE,
  MAX_STAKE,
  marketBySymbol,
  multiplierPnl,
  lastDigit,
  digitPayoutMult,
  DigitSubtype,
} from "@/lib/markets";
import { money, cents } from "@/lib/format";

const QUICK_STAKES = [1, 5, 10, 25, 50, 100];
type Contract = "rise_fall" | "mult" | "digit";

export function TradeTerminal() {
  const { balance, setBalance, data, refresh, loading } = useApp();
  const [symbol, setSymbol] = useState("1HZ100V");
  const [contract, setContract] = useState<Contract>("digit");
  const [stake, setStake] = useState("10");
  const [duration, setDuration] = useState(60);
  const [multiplier, setMultiplier] = useState(DEFAULT_MULTIPLIER);
  const [subtype, setSubtype] = useState<DigitSubtype>("over_under");
  const [barrier, setBarrier] = useState(5);
  const [digitTicks, setDigitTicks] = useState(DEFAULT_DIGIT_TICKS);
  const [mode, setMode] = useState<"manual" | "auto">("manual");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [placing, setPlacing] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const feed = useDerivFeed(symbol);
  const markets = useDerivMarkets(MARKETS.map((m) => m.symbol));
  const market = marketBySymbol(symbol)!;
  const dp = market.decimals;

  const rising = feed.last && feed.prev ? feed.last.price >= feed.prev.price : true;
  const sessionOpen = markets[symbol]?.open ?? feed.points[0]?.price ?? null;
  const changePct =
    feed.last && sessionOpen ? ((feed.last.price - sessionOpen) / sessionOpen) * 100 : 0;
  const hi = feed.points.length ? Math.max(...feed.points.map((p) => p.price)) : null;
  const lo = feed.points.length ? Math.min(...feed.points.map((p) => p.price)) : null;
  const curDigit = feed.last ? lastDigit(feed.last.price, dp) : null;

  const stakeNum = Number(stake) || 0;
  const stakeCents = cents(stakeNum);
  const stakeValid =
    stakeCents >= MIN_STAKE && stakeCents <= MAX_STAKE && stakeCents <= balance;

  const openTrades = data?.openTrades ?? [];
  const closed = data?.closedTrades ?? [];
  const hasOpenMult = openTrades.some((t) => t.kind === "mult");
  const wins = closed.filter((t) => t.status === "won").length;
  const settled = closed.filter((t) => t.status !== "open").length;
  const winRate = settled ? Math.round((wins / settled) * 100) : 0;

  const showToast = useCallback((msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    if (!hasOpenMult) return;
    const id = setInterval(() => refresh(), 6000);
    return () => clearInterval(id);
  }, [hasOpenMult, refresh]);

  async function place(direction: string, extra?: Record<string, unknown>) {
    if (!stakeValid || placing) return;
    setPlacing(direction);
    try {
      let body: Record<string, unknown>;
      if (contract === "rise_fall")
        body = { kind: "rise_fall", symbol, direction, stake: stakeCents, duration };
      else if (contract === "mult")
        body = { kind: "mult", symbol, direction, stake: stakeCents, multiplier };
      else
        body = {
          kind: "digit",
          symbol,
          direction,
          stake: stakeCents,
          subtype,
          barrier,
          ticks: digitTicks,
          ...extra,
        };
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) showToast(json.error || "Trade failed.", false);
      else {
        if (typeof json.balance === "number") setBalance(json.balance);
        showToast(`${direction.toUpperCase()} · ${market.short} · ${money(stakeCents)}`, true);
        refresh();
      }
    } catch {
      showToast("Network error. Try again.", false);
    } finally {
      setPlacing(null);
    }
  }

  function applySignal(s: Signal) {
    setSymbol(s.symbol);
    if (s.contract === "digit") {
      setContract("digit");
      if (s.subtype) setSubtype(s.subtype);
      if (typeof s.barrier === "number") setBarrier(s.barrier);
    } else {
      setContract("rise_fall");
    }
    setScannerOpen(false);
    showToast(`Loaded ${marketBySymbol(s.symbol)?.short ?? s.symbol} · ${s.label}`, true);
  }

  // AUTO bot supports time-settled contracts only (Rise/Fall + Digits).
  const botContract: "rise_fall" | "digit" = contract === "mult" ? "digit" : contract;

  return (
    <div className="mx-auto max-w-[1480px] px-3 py-3 lg:h-[calc(100vh-4rem)] lg:overflow-hidden">
      <AiScanner open={scannerOpen} onClose={() => setScannerOpen(false)} markets={markets} onApply={applySignal} />
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatChip label="Balance" value={loading ? "—" : money(balance)} accent />
        <StatChip label="Open positions" value={String(openTrades.length)} />
        <StatChip label="Win rate" value={settled ? `${winRate}%` : "—"} />
        <StatChip label="Trades settled" value={String(settled)} />
      </div>

      <div className="grid gap-3 lg:h-[calc(100%-4rem)] lg:grid-cols-[200px_1fr_346px]">
        {/* Watchlist */}
        <div className="card hidden min-h-0 flex-col overflow-hidden lg:flex">
          <div className="border-b border-border px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted">
            Markets
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {MARKETS.map((m) => {
              const t = markets[m.symbol];
              const chg =
                t?.last != null && t?.open != null && t.open !== 0
                  ? ((t.last - t.open) / t.open) * 100
                  : 0;
              const up = chg >= 0;
              const active = m.symbol === symbol;
              return (
                <button
                  key={m.symbol}
                  onClick={() => setSymbol(m.symbol)}
                  className={`flex w-full items-center justify-between gap-1.5 border-l-2 px-2.5 py-2 text-left transition ${
                    active ? "border-brand bg-brand/10" : "border-transparent hover:bg-white/[0.03]"
                  }`}
                >
                  <div className="min-w-0">
                    <div className={`text-[13px] font-bold ${active ? "text-brand" : ""}`}>
                      {m.short}
                    </div>
                    <div className="tabular text-[10px] text-muted">
                      {t?.last != null ? t.last.toFixed(m.decimals) : "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Sparkline points={t?.points ?? []} up={up} width={40} height={20} />
                    <span
                      className={`tabular w-11 text-right text-[10px] font-semibold ${
                        up ? "text-up" : "text-down"
                      }`}
                    >
                      {up ? "+" : ""}
                      {chg.toFixed(2)}%
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Chart + digit strip */}
        <div className="flex min-h-0 flex-col gap-3">
          <div className="card flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold">{market.name}</h2>
                  <ConnBadge connected={feed.connected} />
                </div>
                <div className="text-[11px] text-muted">
                  {market.volatility} volatility · synthetic index
                </div>
              </div>
              <div className="flex items-center gap-4">
                {curDigit != null && (
                  <div className="text-center">
                    <div className="text-[9px] uppercase tracking-wider text-muted">Last digit</div>
                    <div className="tabular text-2xl font-black leading-none text-brand">
                      {curDigit}
                    </div>
                  </div>
                )}
                <div className="text-right">
                  <div
                    className={`tabular text-2xl font-bold leading-none ${
                      rising ? "text-up" : "text-down"
                    }`}
                  >
                    {feed.last ? feed.last.price.toFixed(dp) : "—"}
                  </div>
                  <div
                    className={`mt-0.5 text-xs font-semibold ${
                      changePct >= 0 ? "text-up" : "text-down"
                    }`}
                  >
                    {changePct >= 0 ? "▲ +" : "▼ "}
                    {changePct.toFixed(2)}%
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 border-b border-border px-4 py-1.5 text-[11px] text-muted">
              <span>
                High <span className="tabular text-up">{hi ? hi.toFixed(dp) : "—"}</span>
              </span>
              <span>
                Low <span className="tabular text-down">{lo ? lo.toFixed(dp) : "—"}</span>
              </span>
              <span className="ml-auto">Live · Deriv feed</span>
            </div>
            <div className="relative min-h-0 flex-1">
              {feed.points.length === 0 ? (
                <ChartSkeleton connected={feed.connected} />
              ) : (
                <div className="h-full min-h-[220px]">
                  <PriceChart
                    points={feed.points}
                    up={rising}
                    entryPrice={openTrades.find((t) => t.symbol === symbol)?.entry_price ?? null}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Live digit heatmap */}
          <div className="card p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
                <Hash className="h-3.5 w-3.5" /> Last digits · last 50 ticks
              </span>
              <span className="text-[10px] text-muted">tap a digit to set barrier</span>
            </div>
            <DigitHeatmap
              points={feed.points}
              decimals={dp}
              onPick={(d) => {
                setContract("digit");
                setBarrier(d);
              }}
              selected={contract === "digit" && subtype !== "even_odd" ? barrier : null}
            />
          </div>
        </div>

        {/* Ticket + positions */}
        <div className="flex min-h-0 flex-col gap-3">
          <div className="card min-h-0 flex-1 overflow-y-auto p-3.5">
            {/* Manual / Auto + AI */}
            <div className="mb-3 flex items-center gap-2">
              <div className="flex flex-1 rounded-xl bg-white/[0.03] p-1">
                {(["manual", "auto"] as const).map((mo) => (
                  <button
                    key={mo}
                    onClick={() => {
                      setMode(mo);
                      if (mo === "auto" && contract === "mult") setContract("digit");
                    }}
                    className={`flex-1 rounded-lg py-1.5 text-xs font-semibold capitalize transition ${
                      mode === mo ? "bg-brand text-white shadow-glow" : "text-muted hover:text-white"
                    }`}
                  >
                    {mo}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setScannerOpen(true)}
                className="btn px-3 py-2 text-xs font-semibold text-white"
                style={{ background: "linear-gradient(180deg,#8b6dff,#6a47f5)" }}
              >
                <Sparkles className="h-3.5 w-3.5" /> AI
              </button>
            </div>

            <div className={`mb-3 grid gap-1.5 ${mode === "auto" ? "grid-cols-2" : "grid-cols-3"}`}>
              {(mode === "auto"
                ? ([["rise_fall", "Rise/Fall"], ["digit", "Digits"]] as [Contract, string][])
                : ([["rise_fall", "Rise/Fall"], ["digit", "Digits"], ["mult", "Multipliers"]] as [Contract, string][])
              ).map(([c, label]) => (
                <button
                  key={c}
                  onClick={() => setContract(c)}
                  className={`btn py-2 text-xs ${contract === c ? "btn-brand" : "btn-ghost"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-muted">Stake (USD)</label>
              <span className="flex items-center gap-1 text-[11px] text-muted">
                <Wallet className="h-3 w-3" /> {loading ? "—" : money(balance)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setStake(String(Math.max(0, Math.round((stakeNum - 1) * 100) / 100)))}
                className="btn btn-ghost h-10 w-10 shrink-0 p-0 text-lg"
              >
                −
              </button>
              <input
                className="input tabular text-center"
                inputMode="decimal"
                value={stake}
                onChange={(e) => setStake(e.target.value.replace(/[^0-9.]/g, ""))}
              />
              <button
                onClick={() => setStake(String(Math.round((stakeNum + 1) * 100) / 100))}
                className="btn btn-ghost h-10 w-10 shrink-0 p-0 text-lg"
              >
                +
              </button>
            </div>
            <div className="mt-2 grid grid-cols-6 gap-1.5">
              {QUICK_STAKES.map((q) => (
                <button
                  key={q}
                  onClick={() => setStake(String(q))}
                  className={`btn py-1.5 text-[11px] ${
                    stakeNum === q ? "btn-brand" : "btn-ghost"
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>

            {contract === "rise_fall" && (
              <RiseFallControls
                auto={mode === "auto"}
                duration={duration}
                setDuration={setDuration}
                stakeCents={stakeCents}
                placing={placing}
                stakeValid={stakeValid}
                onPlace={place}
              />
            )}
            {contract === "mult" && mode === "manual" && (
              <MultControls
                multiplier={multiplier}
                setMultiplier={setMultiplier}
                stakeCents={stakeCents}
                placing={placing}
                stakeValid={stakeValid}
                onPlace={place}
              />
            )}
            {contract === "digit" && (
              <DigitControls
                auto={mode === "auto"}
                subtype={subtype}
                setSubtype={setSubtype}
                barrier={barrier}
                setBarrier={setBarrier}
                ticks={digitTicks}
                setTicks={setDigitTicks}
                stakeCents={stakeCents}
                placing={placing}
                stakeValid={stakeValid}
                onPlace={place}
              />
            )}

            {mode === "auto" && (
              <BotPanel
                symbol={symbol}
                contract={botContract}
                subtype={subtype}
                barrier={barrier}
                ticks={digitTicks}
                duration={duration}
                baseStakeCents={stakeCents}
                stakeValid={stakeValid}
                setBalance={setBalance}
                refresh={refresh}
                showToast={showToast}
              />
            )}

            {!stakeValid && stakeNum > 0 && (
              <p className="mt-2 text-center text-xs text-down">
                {stakeCents > balance ? (
                  <>
                    Not enough balance —{" "}
                    <Link href="/wallet" className="underline">
                      deposit
                    </Link>
                  </>
                ) : stakeCents < MIN_STAKE ? (
                  "Below minimum ($0.50)."
                ) : (
                  "Above maximum stake."
                )}
              </p>
            )}
          </div>

          <div className="card flex h-40 shrink-0 flex-col overflow-hidden">
            <div className="border-b border-border px-3.5 py-2 text-xs font-semibold uppercase tracking-wider text-muted">
              Open positions ({openTrades.length})
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <OpenPositions
                trades={openTrades}
                onSettled={refresh}
                liveSymbol={symbol}
                livePrice={feed.last?.price ?? null}
                showToast={showToast}
                setBalance={setBalance}
              />
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <div
          className={`fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl border px-4 py-3 text-sm font-medium shadow-card ${
            toast.ok ? "border-up/40 bg-surface text-up" : "border-down/40 bg-surface text-down"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

/* ---------------- Contract controls ---------------- */

function RiseFallControls({
  auto,
  duration,
  setDuration,
  stakeCents,
  placing,
  stakeValid,
  onPlace,
}: any) {
  const payout = (stakeCents / 100) * PAYOUT_MULTIPLIER;
  return (
    <>
      <label className="mb-1 mt-3 block text-xs font-medium text-muted">
        <Timer className="mr-1 inline h-3.5 w-3.5" /> Duration
      </label>
      <div className="grid grid-cols-5 gap-1.5">
        {DURATIONS.map((d) => (
          <button
            key={d.seconds}
            onClick={() => setDuration(d.seconds)}
            className={`btn py-1.5 text-xs ${duration === d.seconds ? "btn-brand" : "btn-ghost"}`}
          >
            {d.label}
          </button>
        ))}
      </div>
      {auto ? null : (
      <>
      <PayoutRow label="Potential payout" value={money(cents(payout))} />
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        <BuyButton color="up" label="RISE" sub={placing === "rise" ? "placing…" : "higher"} icon={<ArrowUp className="h-4 w-4" />} disabled={!stakeValid || placing} onClick={() => onPlace("rise")} />
        <BuyButton color="down" label="FALL" sub={placing === "fall" ? "placing…" : "lower"} icon={<ArrowDown className="h-4 w-4" />} disabled={!stakeValid || placing} onClick={() => onPlace("fall")} />
      </div>
      </>
      )}
    </>
  );
}

function MultControls({
  multiplier,
  setMultiplier,
  stakeCents,
  placing,
  stakeValid,
  onPlace,
}: any) {
  const stopOutPct = (100 / multiplier).toFixed(2);
  return (
    <>
      <label className="mb-1 mt-3 block text-xs font-medium text-muted">
        <TrendingUp className="mr-1 inline h-3.5 w-3.5" /> Multiplier
      </label>
      <div className="grid grid-cols-4 gap-1.5">
        {MULTIPLIERS.map((m) => (
          <button
            key={m}
            onClick={() => setMultiplier(m)}
            className={`btn py-1.5 text-xs ${multiplier === m ? "btn-brand" : "btn-ghost"}`}
          >
            x{m}
          </button>
        ))}
      </div>
      <div className="mt-3 rounded-xl border border-border bg-white/[0.02] px-3 py-2 text-[11px]">
        <div className="flex items-center justify-between">
          <span className="text-muted">P&L moves</span>
          <span className="font-bold text-brand">{multiplier}× market</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between">
          <span className="text-muted">Stop out at</span>
          <span className="font-bold text-down">{stopOutPct}% move</span>
        </div>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        <BuyButton color="up" label="UP" sub={placing === "up" ? "placing…" : "higher"} icon={<ArrowUp className="h-4 w-4" />} disabled={!stakeValid || placing} onClick={() => onPlace("up")} />
        <BuyButton color="down" label="DOWN" sub={placing === "down" ? "placing…" : "lower"} icon={<ArrowDown className="h-4 w-4" />} disabled={!stakeValid || placing} onClick={() => onPlace("down")} />
      </div>
    </>
  );
}

const DIGIT_SUBTYPES: [DigitSubtype, string][] = [
  ["over_under", "Over / Under"],
  ["even_odd", "Even / Odd"],
  ["matches_differs", "Matches / Differs"],
];

function DigitControls({
  auto,
  subtype,
  setSubtype,
  barrier,
  setBarrier,
  ticks,
  setTicks,
  stakeCents,
  placing,
  stakeValid,
  onPlace,
}: any) {
  const stake = stakeCents / 100;
  function payoutFor(pred: string) {
    const mult = digitPayoutMult(subtype, pred, barrier);
    return { total: money(cents(stake * mult)), pct: `${Math.round((mult - 1) * 100)}%` };
  }

  const needsDigit = subtype !== "even_odd";

  return (
    <>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {DIGIT_SUBTYPES.map(([s, label]) => (
          <button
            key={s}
            onClick={() => setSubtype(s)}
            className={`btn px-1 py-1.5 text-[10px] ${subtype === s ? "btn-brand" : "btn-ghost"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {needsDigit && (
        <>
          <label className="mb-1 mt-3 block text-xs font-medium text-muted">
            {subtype === "over_under" ? "Barrier digit" : "Target digit"}
          </label>
          <div className="grid grid-cols-10 gap-1">
            {Array.from({ length: 10 }, (_, d) => (
              <button
                key={d}
                onClick={() => setBarrier(d)}
                className={`tabular rounded-md py-1.5 text-xs font-bold transition ${
                  barrier === d
                    ? "bg-brand text-white"
                    : "bg-white/[0.03] text-muted hover:text-white"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </>
      )}

      <label className="mb-1 mt-3 block text-xs font-medium text-muted">
        <Timer className="mr-1 inline h-3.5 w-3.5" /> Ticks
      </label>
      <div className="grid grid-cols-5 gap-1.5">
        {DIGIT_TICKS.map((t) => (
          <button
            key={t}
            onClick={() => setTicks(t)}
            className={`btn py-1.5 text-xs ${ticks === t ? "btn-brand" : "btn-ghost"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {!auto && (
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        {subtype === "even_odd" && (
          <>
            <DigitBuyButton label="EVEN" payout={payoutFor("even")} color="up" disabled={!stakeValid || placing} placing={placing === "even"} onClick={() => onPlace("even")} />
            <DigitBuyButton label="ODD" payout={payoutFor("odd")} color="down" disabled={!stakeValid || placing} placing={placing === "odd"} onClick={() => onPlace("odd")} />
          </>
        )}
        {subtype === "over_under" && (
          <>
            <DigitBuyButton label={`OVER ${barrier}`} payout={payoutFor("over")} color="up" disabled={!stakeValid || placing || barrier > 8} placing={placing === "over"} onClick={() => onPlace("over")} />
            <DigitBuyButton label={`UNDER ${barrier}`} payout={payoutFor("under")} color="down" disabled={!stakeValid || placing || barrier < 1} placing={placing === "under"} onClick={() => onPlace("under")} />
          </>
        )}
        {subtype === "matches_differs" && (
          <>
            <DigitBuyButton label={`MATCHES ${barrier}`} payout={payoutFor("matches")} color="up" disabled={!stakeValid || placing} placing={placing === "matches"} onClick={() => onPlace("matches")} />
            <DigitBuyButton label={`DIFFERS ${barrier}`} payout={payoutFor("differs")} color="down" disabled={!stakeValid || placing} placing={placing === "differs"} onClick={() => onPlace("differs")} />
          </>
        )}
      </div>
      )}
    </>
  );
}

/* ---------------- Small pieces ---------------- */

function StatChip({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card px-3.5 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`tabular mt-0.5 text-lg font-bold ${accent ? "text-brand" : ""}`}>{value}</div>
    </div>
  );
}

function ConnBadge({ connected }: { connected: boolean }) {
  return (
    <span
      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        connected ? "bg-up/10 text-up" : "bg-muted/10 text-muted"
      }`}
    >
      {connected ? <Wifi className="h-2.5 w-2.5" /> : <WifiOff className="h-2.5 w-2.5" />}
      {connected ? "LIVE" : "connecting"}
    </span>
  );
}

function ChartSkeleton({ connected }: { connected: boolean }) {
  return (
    <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3">
      <div className="relative h-10 w-10">
        <div className="absolute inset-0 animate-ping rounded-full bg-brand/30" />
        <div className="absolute inset-2 rounded-full bg-brand/60" />
      </div>
      <p className="text-sm text-muted">{connected ? "Loading market…" : "Connecting to live market…"}</p>
    </div>
  );
}

function PayoutRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-3 flex items-center justify-between rounded-xl border border-border bg-white/[0.02] px-3 py-2">
      <span className="flex items-center gap-1.5 text-xs text-muted">
        <Zap className="h-3.5 w-3.5 text-gold" /> {label}
      </span>
      <span className="tabular font-bold text-brand">{value}</span>
    </div>
  );
}

function BuyButton({ color, label, sub, icon, disabled, onClick }: any) {
  const bg =
    color === "up"
      ? "linear-gradient(180deg,#00e3a0,#00b87e)"
      : "linear-gradient(180deg,#ff5b6a,#e13b4b)";
  return (
    <button onClick={onClick} disabled={disabled} className="btn flex-col gap-0 py-2.5 text-white" style={{ background: bg }}>
      <span className="flex items-center gap-1 text-sm font-bold">
        {icon} {label}
      </span>
      <span className="text-[10px] opacity-90">{sub}</span>
    </button>
  );
}

function DigitBuyButton({
  label,
  payout,
  color,
  disabled,
  placing,
  onClick,
}: {
  label: string;
  payout: { total: string; pct: string };
  color: "up" | "down";
  disabled: boolean;
  placing: boolean;
  onClick: () => void;
}) {
  const bg =
    color === "up"
      ? "linear-gradient(180deg,#00e3a0,#00b87e)"
      : "linear-gradient(180deg,#ff5b6a,#e13b4b)";
  return (
    <button onClick={onClick} disabled={disabled} className="btn flex-col items-stretch gap-0 px-3 py-2 text-white" style={{ background: bg }}>
      <span className="flex items-center justify-between">
        <span className="text-sm font-bold">{placing ? "placing…" : label}</span>
        <span className="text-[11px] font-bold opacity-95">+{payout.pct}</span>
      </span>
      <span className="text-left text-[10px] opacity-90">Payout {payout.total}</span>
    </button>
  );
}

/* ---------------- Positions ---------------- */

function OpenPositions({ trades, onSettled, liveSymbol, livePrice, showToast, setBalance }: any) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const settling = useRef<Set<number>>(new Set());
  const [closing, setClosing] = useState<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const expired = (trades as Trade[]).filter(
      (t) =>
        (t.kind === "rise_fall" || t.kind === "digit") &&
        t.status === "open" &&
        Number(t.expiry_epoch) <= now &&
        !settling.current.has(t.id)
    );
    if (!expired.length) return;
    (async () => {
      for (const t of expired) {
        settling.current.add(t.id);
        try {
          await fetch("/api/trade/settle", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: t.id }),
          });
        } catch {
          settling.current.delete(t.id);
        }
      }
      onSettled();
    })();
  }, [now, trades, onSettled]);

  async function closeMult(id: number) {
    setClosing(id);
    try {
      const res = await fetch("/api/trade/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok) showToast(json.error || "Could not close.", false);
      else {
        if (typeof json.balance === "number") setBalance(json.balance);
        showToast(json.trade?.status === "won" ? "Closed in profit" : "Position closed", json.trade?.status === "won");
        onSettled();
      }
    } catch {
      showToast("Network error closing position.", false);
    } finally {
      setClosing(null);
    }
  }

  const list = trades as Trade[];
  if (!list.length) {
    return (
      <div className="flex h-full min-h-[80px] items-center justify-center px-4 py-6 text-center text-xs text-muted">
        No open positions yet.
      </div>
    );
  }

  function digitLabel(t: Trade) {
    if (t.subtype === "even_odd") return t.direction.toUpperCase();
    if (t.subtype === "over_under") return `${t.direction.toUpperCase()} ${t.barrier}`;
    return `${t.direction === "matches" ? "MATCH" : "DIFF"} ${t.barrier}`;
  }

  return (
    <div className="divide-y divide-border">
      {list.map((t) => {
        const m = marketBySymbol(t.symbol);
        const isLive = t.symbol === liveSymbol && livePrice != null;

        if (t.kind === "mult") {
          const pnl = isLive
            ? multiplierPnl({
                direction: t.direction as "up" | "down",
                entry: Number(t.entry_price),
                current: livePrice!,
                stakeCents: Number(t.stake),
                multiplier: Number(t.multiplier),
              })
            : null;
          const win = (pnl ?? 0) >= 0;
          return (
            <Row key={t.id} m={m?.short ?? t.symbol} tag={`${t.direction === "up" ? "UP" : "DOWN"} x${t.multiplier}`} tagColor={t.direction === "up" ? "up" : "down"} sub={`${money(Number(t.stake))} · ${Number(t.entry_price).toFixed(2)}`}>
              <span className={`tabular text-sm font-bold ${pnl == null ? "text-muted" : win ? "text-up" : "text-down"}`}>
                {pnl == null ? "—" : money(pnl, { sign: true })}
              </span>
              <button onClick={() => closeMult(t.id)} disabled={closing === t.id} className="btn btn-ghost px-2 py-1 text-[11px]">
                {closing === t.id ? "…" : "Close"}
              </button>
            </Row>
          );
        }

        const secs = Math.max(0, Number(t.expiry_epoch) - now);
        const isSettling = secs <= 0;

        if (t.kind === "digit") {
          const up = ["even", "over", "matches"].includes(t.direction);
          return (
            <Row key={t.id} m={m?.short ?? t.symbol} tag={digitLabel(t)} tagColor={up ? "up" : "down"} sub={`${money(Number(t.stake))} → ${money(Number(t.payout))}`}>
              {isSettling ? (
                <span className="text-xs font-medium text-gold">settling…</span>
              ) : (
                <span className="tabular text-base font-bold">{secs}s</span>
              )}
            </Row>
          );
        }

        const winning = isLive
          ? t.direction === "rise"
            ? livePrice! > t.entry_price
            : livePrice! < t.entry_price
          : null;
        return (
          <Row key={t.id} m={m?.short ?? t.symbol} tag={t.direction === "rise" ? "RISE" : "FALL"} tagColor={t.direction === "rise" ? "up" : "down"} sub={`${money(Number(t.stake))} → ${money(Number(t.payout))}`}>
            <div className="text-right">
              {isSettling ? (
                <span className="text-xs font-medium text-gold">settling…</span>
              ) : (
                <span className="tabular text-base font-bold">{secs}s</span>
              )}
              {isLive && !isSettling && (
                <div className={`text-[10px] font-semibold ${winning ? "text-up" : "text-down"}`}>
                  {winning ? "in the money" : "out of the money"}
                </div>
              )}
            </div>
          </Row>
        );
      })}
    </div>
  );
}

function Row({
  m,
  tag,
  tagColor,
  sub,
  children,
}: {
  m: string;
  tag: string;
  tagColor: "up" | "down";
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-3.5 py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold">{m}</span>
          <span className={`rounded px-1 py-0.5 text-[9px] font-bold ${tagColor === "up" ? "bg-up/15 text-up" : "bg-down/15 text-down"}`}>
            {tag}
          </span>
        </div>
        <div className="tabular text-[11px] text-muted">{sub}</div>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
