"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ArrowDown,
  Zap,
  Timer,
  X,
  TrendingUp,
  Wifi,
  WifiOff,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useApp, Trade } from "./app-context";
import { useDerivFeed, useDerivMarkets } from "@/lib/useDerivFeed";
import { PriceChart } from "./PriceChart";
import { Sparkline } from "./Sparkline";
import {
  MARKETS,
  DURATIONS,
  MULTIPLIERS,
  DEFAULT_MULTIPLIER,
  PAYOUT_MULTIPLIER,
  MIN_STAKE,
  MAX_STAKE,
  marketBySymbol,
  multiplierPnl,
} from "@/lib/markets";
import { money, cents } from "@/lib/format";

const QUICK_STAKES = [1, 5, 10, 50];
type Contract = "rise_fall" | "mult";

function priceDecimals(symbol: string) {
  return symbol === "R_10" ? 3 : 2;
}

export function TradeTerminal() {
  const { balance, setBalance, data, refresh, loading } = useApp();
  const [symbol, setSymbol] = useState("R_100");
  const [contract, setContract] = useState<Contract>("rise_fall");
  const [stake, setStake] = useState("1");
  const [duration, setDuration] = useState(60);
  const [multiplier, setMultiplier] = useState(DEFAULT_MULTIPLIER);
  const [placing, setPlacing] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const feed = useDerivFeed(symbol);
  const markets = useDerivMarkets(MARKETS.map((m) => m.symbol));
  const market = marketBySymbol(symbol)!;
  const dp = priceDecimals(symbol);

  const rising = feed.last && feed.prev ? feed.last.price >= feed.prev.price : true;
  const sessionOpen = markets[symbol]?.open ?? feed.points[0]?.price ?? null;
  const changePct =
    feed.last && sessionOpen ? ((feed.last.price - sessionOpen) / sessionOpen) * 100 : 0;
  const hi = feed.points.length ? Math.max(...feed.points.map((p) => p.price)) : null;
  const lo = feed.points.length ? Math.min(...feed.points.map((p) => p.price)) : null;

  const stakeNum = Number(stake) || 0;
  const stakeCents = cents(stakeNum);
  const payout = stakeNum * PAYOUT_MULTIPLIER;
  const stakeValid =
    stakeCents >= MIN_STAKE && stakeCents <= MAX_STAKE && stakeCents <= balance;

  const openTrades = data?.openTrades ?? [];
  const closed = data?.closedTrades ?? [];
  const hasOpenMult = openTrades.some((t) => t.kind === "mult");

  // Session stats
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

  async function place(direction: string) {
    if (!stakeValid || placing) return;
    setPlacing(direction);
    try {
      const body =
        contract === "rise_fall"
          ? { kind: "rise_fall", symbol, direction, stake: stakeCents, duration }
          : { kind: "mult", symbol, direction, stake: stakeCents, multiplier };
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

  const stopOutPct = (100 / multiplier).toFixed(2);

  return (
    <div className="mx-auto max-w-[1400px] px-3 py-3 lg:h-[calc(100vh-4rem)] lg:overflow-hidden">
      {/* Stat strip */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatChip label="Balance" value={loading ? "—" : money(balance)} accent />
        <StatChip label="Open positions" value={String(openTrades.length)} />
        <StatChip label="Win rate" value={settled ? `${winRate}%` : "—"} />
        <StatChip label="Trades settled" value={String(settled)} />
      </div>

      <div className="grid gap-3 lg:h-[calc(100%-4rem)] lg:grid-cols-[220px_1fr_340px]">
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
                  className={`flex w-full items-center justify-between gap-2 border-l-2 px-3 py-2.5 text-left transition ${
                    active
                      ? "border-brand bg-brand/10"
                      : "border-transparent hover:bg-white/[0.03]"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-sm font-bold ${active ? "text-brand" : ""}`}>
                        {m.short}
                      </span>
                    </div>
                    <div className="tabular text-[11px] text-muted">
                      {t?.last != null ? t.last.toFixed(priceDecimals(m.symbol)) : "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Sparkline points={t?.points ?? []} up={up} width={52} height={22} />
                    <span
                      className={`tabular w-12 text-right text-[11px] font-semibold ${
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

        {/* Chart */}
        <div className="card flex min-h-0 flex-col overflow-hidden">
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
                {changePct >= 0 ? "▲" : "▼"} {changePct >= 0 ? "+" : ""}
                {changePct.toFixed(2)}%
              </div>
            </div>
          </div>

          {/* Hi/Lo bar */}
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
              <div className="h-full min-h-[280px]">
                <PriceChart
                  points={feed.points}
                  up={rising}
                  entryPrice={
                    openTrades.find((t) => t.symbol === symbol)?.entry_price ?? null
                  }
                />
              </div>
            )}
          </div>
        </div>

        {/* Ticket + positions */}
        <div className="flex min-h-0 flex-col gap-3">
          <div className="card p-3.5">
            <div className="mb-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => setContract("rise_fall")}
                className={`btn py-2 text-sm ${
                  contract === "rise_fall" ? "btn-brand" : "btn-ghost"
                }`}
              >
                Rise / Fall
              </button>
              <button
                onClick={() => setContract("mult")}
                className={`btn py-2 text-sm ${
                  contract === "mult" ? "btn-brand" : "btn-ghost"
                }`}
              >
                Multipliers
              </button>
            </div>

            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-muted">Stake (USD)</label>
              <span className="flex items-center gap-1 text-[11px] text-muted">
                <Wallet className="h-3 w-3" /> {loading ? "—" : money(balance)}
              </span>
            </div>
            <input
              className="input tabular"
              inputMode="decimal"
              value={stake}
              onChange={(e) => setStake(e.target.value.replace(/[^0-9.]/g, ""))}
            />
            <div className="mt-2 grid grid-cols-4 gap-2">
              {QUICK_STAKES.map((q) => (
                <button
                  key={q}
                  onClick={() => setStake(String(q))}
                  className="btn btn-ghost py-1.5 text-xs"
                >
                  ${q}
                </button>
              ))}
            </div>

            {contract === "rise_fall" ? (
              <>
                <label className="mb-1 mt-3 block text-xs font-medium text-muted">
                  <Timer className="mr-1 inline h-3.5 w-3.5" />
                  Duration
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {DURATIONS.map((d) => (
                    <button
                      key={d.seconds}
                      onClick={() => setDuration(d.seconds)}
                      className={`btn py-1.5 text-xs ${
                        duration === d.seconds ? "btn-brand" : "btn-ghost"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between rounded-xl border border-border bg-white/[0.02] px-3 py-2">
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    <Zap className="h-3.5 w-3.5 text-gold" /> Potential payout
                  </span>
                  <span className="tabular font-bold text-brand">{money(cents(payout))}</span>
                </div>
                <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                  <BuyButton
                    color="up"
                    label="RISE"
                    sub={placing === "rise" ? "placing…" : "higher"}
                    icon={<ArrowUp className="h-4 w-4" />}
                    disabled={!stakeValid || placing !== null}
                    onClick={() => place("rise")}
                  />
                  <BuyButton
                    color="down"
                    label="FALL"
                    sub={placing === "fall" ? "placing…" : "lower"}
                    icon={<ArrowDown className="h-4 w-4" />}
                    disabled={!stakeValid || placing !== null}
                    onClick={() => place("fall")}
                  />
                </div>
              </>
            ) : (
              <>
                <label className="mb-1 mt-3 block text-xs font-medium text-muted">
                  <TrendingUp className="mr-1 inline h-3.5 w-3.5" />
                  Multiplier
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {MULTIPLIERS.map((m) => (
                    <button
                      key={m}
                      onClick={() => setMultiplier(m)}
                      className={`btn py-1.5 text-xs ${
                        multiplier === m ? "btn-brand" : "btn-ghost"
                      }`}
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
                  <BuyButton
                    color="up"
                    label="UP"
                    sub={placing === "up" ? "placing…" : "higher"}
                    icon={<ArrowUp className="h-4 w-4" />}
                    disabled={!stakeValid || placing !== null}
                    onClick={() => place("up")}
                  />
                  <BuyButton
                    color="down"
                    label="DOWN"
                    sub={placing === "down" ? "placing…" : "lower"}
                    icon={<ArrowDown className="h-4 w-4" />}
                    disabled={!stakeValid || placing !== null}
                    onClick={() => place("down")}
                  />
                </div>
              </>
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

          <div className="card flex min-h-0 flex-1 flex-col overflow-hidden">
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

function StatChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="card px-3.5 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`tabular mt-0.5 text-lg font-bold ${accent ? "text-brand" : ""}`}>
        {value}
      </div>
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
      {connected ? (
        <Wifi className="h-2.5 w-2.5" />
      ) : (
        <WifiOff className="h-2.5 w-2.5" />
      )}
      {connected ? "LIVE" : "connecting"}
    </span>
  );
}

function ChartSkeleton({ connected }: { connected: boolean }) {
  return (
    <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3">
      <div className="relative h-10 w-10">
        <div className="absolute inset-0 animate-ping rounded-full bg-brand/30" />
        <div className="absolute inset-2 rounded-full bg-brand/60" />
      </div>
      <p className="text-sm text-muted">
        {connected ? "Loading market…" : "Connecting to live market…"}
      </p>
    </div>
  );
}

function BuyButton({
  color,
  label,
  sub,
  icon,
  disabled,
  onClick,
}: {
  color: "up" | "down";
  label: string;
  sub: string;
  icon: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  const bg =
    color === "up"
      ? "linear-gradient(180deg,#00e3a0,#00b87e)"
      : "linear-gradient(180deg,#ff5b6a,#e13b4b)";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="btn flex-col gap-0 py-2.5 text-white"
      style={{ background: bg }}
    >
      <span className="flex items-center gap-1 text-sm font-bold">
        {icon} {label}
      </span>
      <span className="text-[10px] opacity-90">{sub}</span>
    </button>
  );
}

function OpenPositions({
  trades,
  onSettled,
  liveSymbol,
  livePrice,
  showToast,
  setBalance,
}: {
  trades: Trade[];
  onSettled: () => void;
  liveSymbol: string;
  livePrice: number | null;
  showToast: (msg: string, ok: boolean) => void;
  setBalance: (b: number) => void;
}) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const settling = useRef<Set<number>>(new Set());
  const [closing, setClosing] = useState<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const expired = trades.filter(
      (t) =>
        t.kind === "rise_fall" &&
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

  if (!trades.length) {
    return (
      <div className="flex h-full min-h-[80px] items-center justify-center px-4 py-6 text-center text-xs text-muted">
        No open positions yet.
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {trades.map((t) => {
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
            <div key={t.id} className="flex items-center justify-between px-3.5 py-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold">{m?.short ?? t.symbol}</span>
                  <span
                    className={`rounded px-1 py-0.5 text-[9px] font-bold ${
                      t.direction === "up" ? "bg-up/15 text-up" : "bg-down/15 text-down"
                    }`}
                  >
                    {t.direction === "up" ? "UP" : "DOWN"} x{t.multiplier}
                  </span>
                </div>
                <div className="tabular text-[11px] text-muted">
                  {money(Number(t.stake))} · {Number(t.entry_price).toFixed(2)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`tabular text-sm font-bold ${
                    pnl == null ? "text-muted" : win ? "text-up" : "text-down"
                  }`}
                >
                  {pnl == null ? "—" : money(pnl, { sign: true })}
                </span>
                <button
                  onClick={() => closeMult(t.id)}
                  disabled={closing === t.id}
                  className="btn btn-ghost px-2 py-1 text-[11px]"
                >
                  {closing === t.id ? "…" : "Close"}
                </button>
              </div>
            </div>
          );
        }

        const secs = Math.max(0, Number(t.expiry_epoch) - now);
        const isSettling = secs <= 0;
        const winning = isLive
          ? t.direction === "rise"
            ? livePrice! > t.entry_price
            : livePrice! < t.entry_price
          : null;
        return (
          <div key={t.id} className="flex items-center justify-between px-3.5 py-2.5">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold">{m?.short ?? t.symbol}</span>
                <span
                  className={`rounded px-1 py-0.5 text-[9px] font-bold ${
                    t.direction === "rise" ? "bg-up/15 text-up" : "bg-down/15 text-down"
                  }`}
                >
                  {t.direction === "rise" ? "RISE" : "FALL"}
                </span>
              </div>
              <div className="tabular text-[11px] text-muted">
                {money(Number(t.stake))} → {money(Number(t.payout))}
              </div>
            </div>
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
          </div>
        );
      })}
    </div>
  );
}
