"use client";

import { useMemo } from "react";
import type { Point } from "@/lib/useDerivFeed";
import { lastDigit } from "@/lib/markets";

/**
 * Live last-digit frequency ring strip (0-9). Each digit is a circular gauge
 * whose fill reflects how often it has appeared recently; the current tick's
 * digit is highlighted. Clean and readable at a glance.
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
  const { pcts, current, hot } = useMemo(() => {
    const recent = points.slice(-window);
    const counts = new Array(10).fill(0);
    for (const p of recent) counts[lastDigit(p.price, decimals)]++;
    const total = recent.length || 1;
    const pcts = counts.map((c) => (c / total) * 100);
    const current = recent.length ? lastDigit(recent[recent.length - 1].price, decimals) : null;
    let hot = 0;
    for (let i = 1; i < 10; i++) if (pcts[i] > pcts[hot]) hot = i;
    return { pcts, current, hot };
  }, [points, decimals, window]);

  const maxPct = Math.max(...pcts, 1);
  const R = 15;
  const C = 2 * Math.PI * R;

  return (
    <div className="grid grid-cols-10 gap-1.5">
      {pcts.map((pct, d) => {
        const isCurrent = d === current;
        const isHot = d === hot;
        const isSel = selected === d;
        const frac = pct / maxPct;
        const stroke = isCurrent ? "#7C5CFF" : isHot ? "#00E39A" : "#8b93a6";
        return (
          <button
            key={d}
            onClick={onPick ? () => onPick(d) : undefined}
            className={`group flex flex-col items-center gap-1 rounded-xl py-1.5 transition ${
              isSel ? "bg-brand/10 ring-1 ring-brand" : ""
            } ${onPick ? "cursor-pointer hover:bg-surface2" : "cursor-default"}`}
          >
            <div className="relative h-12 w-12">
              {isCurrent && (
                <span className="absolute -top-2 left-1/2 h-0 w-0 -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-brand" />
              )}
              <svg viewBox="0 0 40 40" className="h-12 w-12">
                <circle cx="20" cy="20" r={R} fill="none" stroke="rgb(var(--border))" strokeWidth="3.5" />
                <circle
                  cx="20"
                  cy="20"
                  r={R}
                  fill="none"
                  stroke={stroke}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeDasharray={C}
                  strokeDashoffset={C * (1 - Math.max(0.04, frac))}
                  transform="rotate(-90 20 20)"
                  style={isCurrent ? { filter: "drop-shadow(0 0 4px rgba(124,92,255,0.6))" } : undefined}
                />
                <text
                  x="20"
                  y="20"
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="14"
                  fontWeight="700"
                  fill={isCurrent ? "#7C5CFF" : "rgb(var(--fg))"}
                >
                  {d}
                </text>
              </svg>
            </div>
            <span className="tabular text-[10px] font-semibold text-muted">{pct.toFixed(0)}%</span>
          </button>
        );
      })}
    </div>
  );
}
