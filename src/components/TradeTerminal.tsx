"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowDown, Zap, Timer, Wallet, X, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useApp, Trade } from "./app-context";
import { useDerivFeed } from "@/lib/useDerivFeed";
import { PriceChart } from "./PriceChart";
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
  const market = marketBySymbol(symbol)!;
  const rising =
    feed.last && feed.prev ? feed.last.price >= feed.prev.price : true;

  const stakeNum = Number(stake) || 0;
  const stakeCents = cents(stakeNum);
  const payout = stakeNum * PAYOUT_MULTIPLIER;
  const stakeValid =
    stakeCents >= MIN_STAKE && stakeCents <= MAX_STAKE && stakeCents <= balance;

  const openTrades = data?.openTrades ?? [];
  const hasOpenMult = openTrades.some((t) => t.kind === "mult");

  const showToast = useCallback((msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3200);
  }, []);

  // Keep open multiplier P&L / stop-outs fresh by polling the wallet.
  useEffect(() => {
    if (!hasOpenMult) return;
    const id = setInterval(() => refresh(), 6000);
    return () => clearInterval(id);
  }, [hasOpenMult, refresh]);

  async function place(direction: string) {
    if (!stakeValid || placing) return;
    setPlacing(direction);
    try {
      const payloadBody =
        contract === "rise_fall"
          ? { kind: "rise_fall", symbol, direction, stake: stakeCents, duration }
          : { kind: "mult", symbol, direction, stake: stakeCents, multiplier };
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadBody),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error || "Trade failed.", false);
      } else {
        if (typeof json.balance === "number") setBalance(json.balance);
        const label = direction.toUpperCase();
        showToast(`${label} placed on ${market.short} · ${money(stakeCents)}`, true);
        refresh();
      }
    } catch {
      showToast("Network error. Try again.", false);
    } finally {
      setPlacing(null);
    }
  }

  const stopOutPct = (100 / multiplier).toFixed(multiplier >= 1000 ? 2 : 2);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      {/* LEFT: market + chart */}
      <div className="space-y-4">
        <MarketTabs symbol={symbol} onSelect={setSymbol} />

        <div className="card p-4 sm:p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">{market.name}</h2>
                <span
                  className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    feed.connected ? "bg-up/10 text-up" : "bg-muted/10 text-muted"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      feed.connected ? "bg-up animate-pulseSoft" : "bg-muted"
                    }`}
                  />
                  {feed.connected ? "LIVE" : "connecting"}
                </span>
              </div>
              <div className="text-xs text-muted">
                {market.volatility} volatility · synthetic index
              </div>
            </div>
            <div className="text-right">
              <div
                className={`tabular text-2xl font-bold sm:text-3xl ${
                  rising ? "text-up" : "text-down"
                }`}
              >
                {feed.last
                  ? feed.last.price.toFixed(market.symbol === "R_10" ? 3 : 2)
                  : "—"}
              </div>
              <div className={`text-xs ${rising ? "text-up" : "text-down"}`}>
                {rising ? "▲" : "▼"} live tick
              </div>
            </div>
          </div>

          <div className="mt-2">
            <PriceChart points={feed.points} up={rising} />
          </div>
        </div>

        <OpenPositions
          trades={openTrades}
          onSettled={refresh}
          liveSymbol={symbol}
          livePrice={feed.last?.price ?? null}
          showToast={showToast}
          setBalance={setBalance}
        />
      </div>

      {/* RIGHT: trade ticket */}
      <div className="space-y-4">
        <div className="card p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-bold">Place a trade</h3>
            <span className="flex items-center gap-1 text-xs text-muted">
              <Wallet className="h-3.5 w-3.5" />
              {loading ? "—" : money(balance)}
            </span>
          </div>

          {/* Contract type */}
          <div className="mb-4 grid grid-cols-2 gap-2">
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

          {/* Stake */}
          <label className="mb-1 block text-xs font-medium text-muted">
            Stake (USD)
          </label>
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
              {/* Duration */}
              <label className="mb-1 mt-4 block text-xs font-medium text-muted">
                <Timer className="mr-1 inline h-3.5 w-3.5" />
                Duration
              </label>
              <div className="grid grid-cols-5 gap-2">
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

              <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-surface2/50 px-3 py-2.5">
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  <Zap className="h-3.5 w-3.5 text-gold" />
                  Potential payout
                </span>
                <span className="tabular font-bold text-brand">
                  {money(cents(payout))}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <BuyButton
                  color="up"
                  label="RISE"
                  sub={placing === "rise" ? "placing…" : "price goes up"}
                  icon={<ArrowUp className="h-4 w-4" />}
                  disabled={!stakeValid || placing !== null}
                  onClick={() => place("rise")}
                />
                <BuyButton
                  color="down"
                  label="FALL"
                  sub={placing === "fall" ? "placing…" : "price goes down"}
                  icon={<ArrowDown className="h-4 w-4" />}
                  disabled={!stakeValid || placing !== null}
                  onClick={() => place("fall")}
                />
              </div>
            </>
          ) : (
            <>
              {/* Multiplier */}
              <label className="mb-1 mt-4 block text-xs font-medium text-muted">
                <TrendingUp className="mr-1 inline h-3.5 w-3.5" />
                Multiplier
              </label>
              <div className="grid grid-cols-4 gap-2">
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

              <div className="mt-4 rounded-xl border border-border bg-surface2/50 px-3 py-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted">Your P&L moves</span>
                  <span className="font-bold text-brand">{multiplier}× the market</span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-muted">Stop out if market moves</span>
                  <span className="font-bold text-down">{stopOutPct}% against you</span>
                </div>
                <div className="mt-1 text-[11px] text-muted">
                  You can never lose more than your {money(stakeCents)} stake. Close anytime.
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <BuyButton
                  color="up"
                  label="UP"
                  sub={placing === "up" ? "placing…" : "price goes up"}
                  icon={<ArrowUp className="h-4 w-4" />}
                  disabled={!stakeValid || placing !== null}
                  onClick={() => place("up")}
                />
                <BuyButton
                  color="down"
                  label="DOWN"
                  sub={placing === "down" ? "placing…" : "price goes down"}
                  icon={<ArrowDown className="h-4 w-4" />}
                  disabled={!stakeValid || placing !== null}
                  onClick={() => place("down")}
                />
              </div>
            </>
          )}

          {!stakeValid && stakeNum > 0 && (
            <p className="mt-2 text-center text-xs text-down">
              {stakeCents > balance
                ? "Not enough balance — "
                : stakeCents < MIN_STAKE
                ? "Below minimum stake ($0.50). "
                : "Above maximum stake. "}
              {stakeCents > balance && (
                <Link href="/wallet" className="underline">
                  deposit
                </Link>
              )}
            </p>
          )}
        </div>

        <div className="card p-4 text-xs leading-relaxed text-muted">
          <p className="mb-1 font-semibold text-white">How it works</p>
          {contract === "rise_fall" ? (
            <>
              Pick a market, a stake and a time. Choose{" "}
              <span className="text-up">Rise</span> if you think the price will be
              higher when the timer ends, or <span className="text-down">Fall</span>{" "}
              if lower. Win and your stake returns{" "}
              <span className="text-brand">{PAYOUT_MULTIPLIER}×</span>.
            </>
          ) : (
            <>
              Multipliers amplify your P&L by the multiplier you pick. Go{" "}
              <span className="text-up">Up</span> or <span className="text-down">Down</span>,
              watch your live profit, and <span className="text-white">close</span> whenever
              you like. Losses can’t exceed your stake.
            </>
          )}{" "}
          Outcomes use the real Deriv price feed.
        </div>
      </div>

      {toast && (
        <div
          className={`fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl border px-4 py-3 text-sm font-medium shadow-card ${
            toast.ok
              ? "border-up/40 bg-surface text-up"
              : "border-down/40 bg-surface text-down"
          }`}
        >
          {toast.msg}
        </div>
      )}
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
      ? "linear-gradient(180deg,#00e396,#00b877)"
      : "linear-gradient(180deg,#ff5b6a,#e13b4b)";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="btn flex-col gap-0 py-3 text-white"
      style={{ background: bg }}
    >
      <span className="flex items-center gap-1 font-bold">
        {icon} {label}
      </span>
      <span className="text-[10px] opacity-90">{sub}</span>
    </button>
  );
}

function MarketTabs({
  symbol,
  onSelect,
}: {
  symbol: string;
  onSelect: (s: string) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {MARKETS.map((m) => {
        const active = m.symbol === symbol;
        return (
          <button
            key={m.symbol}
            onClick={() => onSelect(m.symbol)}
            className={`flex min-w-[86px] flex-col items-start rounded-xl border px-3 py-2 transition ${
              active
                ? "border-brand bg-brand/10"
                : "border-border bg-surface hover:border-muted"
            }`}
          >
            <span className={`text-sm font-bold ${active ? "text-brand" : "text-white"}`}>
              {m.short}
            </span>
            <span className="text-[10px] text-muted">{m.volatility}</span>
          </button>
        );
      })}
    </div>
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

  // Auto-settle expired Rise/Fall trades.
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
      if (!res.ok) {
        showToast(json.error || "Could not close.", false);
      } else {
        if (typeof json.balance === "number") setBalance(json.balance);
        const won = json.trade?.status === "won";
        showToast(won ? "Position closed in profit" : "Position closed", won);
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
      <div className="card p-4 text-center text-sm text-muted">
        No open positions. Place your first trade above.
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-border px-4 py-3 text-sm font-bold">
        Open positions ({trades.length})
      </div>
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
              <div key={t.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{m?.short ?? t.symbol}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        t.direction === "up" ? "bg-up/15 text-up" : "bg-down/15 text-down"
                      }`}
                    >
                      {t.direction === "up" ? "UP" : "DOWN"} · x{t.multiplier}
                    </span>
                  </div>
                  <div className="tabular text-xs text-muted">
                    {money(Number(t.stake))} · entry {Number(t.entry_price).toFixed(2)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-[10px] uppercase text-muted">P&L</div>
                    <div
                      className={`tabular text-sm font-bold ${
                        pnl == null ? "text-muted" : win ? "text-up" : "text-down"
                      }`}
                    >
                      {pnl == null ? "—" : money(pnl, { sign: true })}
                    </div>
                  </div>
                  <button
                    onClick={() => closeMult(t.id)}
                    disabled={closing === t.id}
                    className="btn btn-ghost px-3 py-1.5 text-xs"
                  >
                    {closing === t.id ? "…" : <X className="h-3.5 w-3.5" />}
                    Close
                  </button>
                </div>
              </div>
            );
          }

          // Rise/Fall
          const secs = Math.max(0, Number(t.expiry_epoch) - now);
          const isSettling = secs <= 0;
          const winning = isLive
            ? t.direction === "rise"
              ? livePrice! > t.entry_price
              : livePrice! < t.entry_price
            : null;
          return (
            <div key={t.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{m?.short ?? t.symbol}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      t.direction === "rise" ? "bg-up/15 text-up" : "bg-down/15 text-down"
                    }`}
                  >
                    {t.direction === "rise" ? "RISE" : "FALL"}
                  </span>
                </div>
                <div className="tabular text-xs text-muted">
                  {money(Number(t.stake))} → {money(Number(t.payout))} · entry{" "}
                  {Number(t.entry_price).toFixed(2)}
                </div>
              </div>
              <div className="text-right">
                {isSettling ? (
                  <span className="text-xs font-medium text-gold">settling…</span>
                ) : (
                  <span className="tabular text-lg font-bold">{secs}s</span>
                )}
                {isLive && !isSettling && (
                  <div
                    className={`text-[10px] font-semibold ${
                      winning ? "text-up" : "text-down"
                    }`}
                  >
                    {winning ? "in the money" : "out of the money"}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
