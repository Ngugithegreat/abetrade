"use client";

import { useMemo } from "react";
import type { Point } from "@/lib/useDerivFeed";
import { lastDigit } from "@/lib/markets";

/**
 * Live last-digit frequency strip (0-9), computed from the recent tick window.
 * The current tick's digit is highlighted with a marker — the signature Deriv
 * digit-trading visual.
 */
export function DigitHeatmap({
  points,
  decimals,
  window = 50,
  onPick,
  selected,
}: {
  points: Point[];
  decimals: number;
  window?: number;
  onPick?: (d: number) => void;
  selected?: number | null;
}) {
  const { pcts, current, hot, cold } = useMemo(() => {
    const recent = points.slice(-window);
    const counts = new Array(10).fill(0);
    for (const p of recent) counts[lastDigit(p.price, decimals)]++;
    const total = recent.length || 1;
    const pcts = counts.map((c) => (c / total) * 100);
    const current = recent.length
      ? lastDigit(recent[recent.length - 1].price, decimals)
      : null;
    let hot = 0;
    let cold = 0;
    for (let i = 1; i < 10; i++) {
      if (pcts[i] > pcts[hot]) hot = i;
      if (pcts[i] < pcts[cold]) cold = i;
    }
    return { pcts, current, hot, cold };
  }, [points, decimals, window]);

  const maxPct = Math.max(...pcts, 1);

  return (
    <div className="grid grid-cols-10 gap-1.5">
      {pcts.map((pct, d) => {
        const isCurrent = d === current;
        const isHot = d === hot;
        const isCold = d === cold;
        const isSel = selected === d;
        const intensity = pct / maxPct; // 0..1
        return (
          <button
            key={d}
            onClick={onPick ? () => onPick(d) : undefined}
            className={`group relative flex flex-col items-center rounded-lg border px-0.5 pb-1 pt-2 transition ${
              isSel
                ? "border-brand bg-brand/15"
                : isCurrent
                ? "border-brand/70 bg-brand/5"
                : "border-border bg-white/[0.015] hover:border-muted"
            } ${onPick ? "cursor-pointer" : "cursor-default"}`}
          >
            {/* current marker */}
            <span
              className={`absolute -top-2 h-0 w-0 border-x-4 border-t-4 border-x-transparent transition ${
                isCurrent ? "border-t-brand opacity-100" : "opacity-0"
              }`}
            />
            <span
              className={`tabular text-sm font-bold ${
                isCurrent
                  ? "text-brand"
                  : isHot
                  ? "text-up"
                  : isCold
                  ? "text-down"
                  : "text-white"
              }`}
            >
              {d}
            </span>
            {/* frequency bar */}
            <span className="mt-1 h-8 w-full overflow-hidden rounded bg-white/[0.04]">
              <span
                className="block w-full rounded"
                style={{
                  height: `${Math.max(6, intensity * 100)}%`,
                  marginTop: `${100 - Math.max(6, intensity * 100)}%`,
                  background: isHot
                    ? "linear-gradient(180deg,#00E39A,#00b87e)"
                    : isCold
                    ? "linear-gradient(180deg,#FF5B6A,#e13b4b)"
                    : "linear-gradient(180deg,#7C5CFF,#6A47F5)",
                  opacity: isCurrent || isHot || isCold ? 1 : 0.55,
                }}
              />
            </span>
            <span className="tabular mt-0.5 text-[9px] text-muted">
              {pct.toFixed(1)}%
            </span>
          </button>
        );
      })}
    </div>
  );
}
