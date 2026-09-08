"use client";

import { useRef, useState } from "react";
import { Sparkles, X, Search, CheckCircle2 } from "lucide-react";
import { MARKETS, marketBySymbol, DigitSubtype } from "@/lib/markets";
import { deepScanBest, type ScanResult } from "./AiScanner";
import type { MarketTick } from "@/lib/useDerivFeed";

const TRADE_TYPES: { value: DigitSubtype; label: string }[] = [
  { value: "even_odd", label: "Even / Odd" },
  { value: "over_under", label: "Over / Under" },
  { value: "matches_differs", label: "Match / Differ" },
];

/**
 * Entry Scanner — pick a trade type, deep-scan every market, and it surfaces
 * the single best market + auto-prediction. Loading it opens that chart with the
 * Auto-Trader (bot) panel ready, where the user sets stake / TP / SL.
 */
export function EntryScanner({
  open,
  onClose,
  markets,
  onLoad,
}: {
  open: boolean;
  onClose: () => void;
  markets: Record<string, MarketTick>;
  onLoad: (r: ScanResult) => void;
}) {
  const [subtype, setSubtype] = useState<DigitSubtype>("even_odd");
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0); // markets walked
  const [current, setCurrent] = useState<string>("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const marketsRef = useRef(markets);
  marketsRef.current = markets;

  if (!open) return null;

  const total = MARKETS.length;
  const typeLabel = TRADE_TYPES.find((t) => t.value === subtype)?.label ?? "";
  const bestName = result ? marketBySymbol(result.symbol)?.name ?? result.symbol : "";

  async function deepScan() {
    setScanning(true);
    setResult(null);
    setProgress(0);
    // Walk each market with a short visual step, like a real deep scan.
    for (let i = 0; i < total; i++) {
      setCurrent(MARKETS[i].name);
      setProgress(i + 1);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 90));
    }
    const best = deepScanBest(marketsRef.current, subtype);
    setResult(best);
    setScanning(false);
    setCurrent(best ? marketBySymbol(best.symbol)?.name ?? "" : "");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-brand/30 bg-surface shadow-glow">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/15 text-brand">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="text-lg font-bold">Entry Scanner</div>
          </div>
          <button onClick={onClose} className="btn btn-ghost h-8 w-8 p-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <p className="rounded-xl border border-border bg-surface2/50 px-4 py-3 text-sm leading-relaxed text-muted">
            Pick the trade type you want to scan. The deep scanner walks every{" "}
            <b className="text-fg">volatility / synthetic</b> index and surfaces the best entry for
            that type based on recent tick patterns.
          </p>

          {/* Trade type */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Trade type</label>
            <select
              value={subtype}
              onChange={(e) => {
                setSubtype(e.target.value as DigitSubtype);
                setResult(null);
              }}
              disabled={scanning}
              className="input appearance-none text-base font-semibold"
            >
              {TRADE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Result details (after a scan) */}
          {result && (
            <div className="space-y-3">
              <Detail label="Selected market" value={bestName} strong />
              <Detail label="Trade type" value={typeLabel} />
              <Detail label="Prediction (auto)" value={result.predictionLabel} strong />
            </div>
          )}

          {/* Progress */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold">
              <span className={scanning ? "text-brand" : "text-muted"}>
                {scanning ? current : result ? bestName : "Ready to scan"}
              </span>
              <span className="tabular text-muted">
                {scanning ? progress : result ? total : 0}/{total}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface2">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-light to-brand transition-all"
                style={{ width: `${((scanning ? progress : result ? total : 0) / total) * 100}%` }}
              />
            </div>
          </div>

          {/* Best-market banner */}
          {result && !scanning && (
            <div className="flex items-start gap-2 rounded-xl border border-up/30 bg-up/5 px-3.5 py-3 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-up" />
              <div>
                <b>Best market:</b> {bestName} | {typeLabel} {result.predictionLabel} |{" "}
                <b>Quality {result.quality.toFixed(2)}%</b>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-2 border-t border-border p-5">
          <button onClick={deepScan} disabled={scanning} className="btn btn-brand w-full py-3 text-base">
            <Search className="h-4 w-4" />
            {scanning ? "Scanning…" : result ? "Re-scan for Best Market" : "Deep Scan for Best Market"}
          </button>
          <button
            onClick={() => result && onLoad(result)}
            disabled={!result || scanning}
            className="btn btn-ghost w-full border border-brand/40 py-3 text-sm font-semibold text-brand disabled:opacity-40"
          >
            {result ? `Load ${marketBySymbol(result.symbol)?.short ?? ""} Bot` : "Load Scanner Bot"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-muted">{label}</div>
      <div className={`rounded-xl border border-border bg-surface2/60 px-4 py-3 ${strong ? "text-base font-bold" : "text-sm font-medium"}`}>
        {value}
      </div>
    </div>
  );
}
