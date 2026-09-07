"use client";

import { useEffect, useRef, useState } from "react";
import type { Point } from "./useDerivFeed";
import { marketBySymbol } from "./markets";

// A fully-controlled simulated market for TEST accounts only. It draws a
// realistic random walk on the chart and can be "steered" so the price visibly
// moves toward a target by a deadline — letting testers watch a trade win or
// lose on the chart, exactly like a live trade. Never used for real users.

export type TestFeedState = {
  points: Point[];
  last: Point | null;
  prev: Point | null;
  connected: boolean;
  steer: (target: number, deadlineEpoch: number) => void;
};

// Plausible starting levels so the sim looks like the real indices.
const BASE: Record<string, number> = {
  R_10: 4827, R_25: 2668, R_50: 100.5, R_75: 50295, R_100: 644,
  "1HZ10V": 9446, "1HZ25V": 764662, "1HZ50V": 241694, "1HZ75V": 7002, "1HZ100V": 730,
};

export function useTestFeed(symbol: string, enabled: boolean): TestFeedState {
  const [points, setPoints] = useState<Point[]>([]);
  const priceRef = useRef(0);
  const steerRef = useRef<{ target: number; deadline: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const m = marketBySymbol(symbol);
    const decimals = m?.decimals ?? 2;
    const base = BASE[symbol] ?? 1000;
    const scale = Math.pow(10, decimals);
    const round = (p: number) => Math.round(p * scale) / scale;
    const vol = base * 0.0012; // per-tick volatility

    // Seed a little history so the chart isn't empty.
    const now = Math.floor(Date.now() / 1000);
    let p = base;
    const seed: Point[] = [];
    for (let i = 90; i > 0; i--) {
      p += (Math.random() - 0.5) * vol * 2;
      seed.push({ epoch: now - i, price: round(p) });
    }
    priceRef.current = p;
    steerRef.current = null;
    setPoints(seed);

    const id = setInterval(() => {
      const nowSec = Math.floor(Date.now() / 1000);
      let cur = priceRef.current;
      const st = steerRef.current;
      let next: number;
      if (st) {
        const timeLeft = st.deadline - nowSec;
        if (timeLeft <= 0) {
          // Land exactly on target at/after the deadline, then release.
          next = st.target;
          steerRef.current = null;
        } else {
          // Pull toward target, stronger as the deadline nears, plus some noise.
          const pull = (st.target - cur) / Math.max(1, timeLeft);
          const noise = (Math.random() - 0.5) * 2 * vol * Math.min(1, timeLeft / 6);
          next = cur + pull + noise;
        }
      } else {
        next = cur + (Math.random() - 0.5) * 2 * vol;
      }
      priceRef.current = next;
      setPoints((prev) => [...prev, { epoch: nowSec, price: round(next) }].slice(-240));
    }, 1000);

    return () => clearInterval(id);
  }, [symbol, enabled]);

  const last = points.length ? points[points.length - 1] : null;
  const prev = points.length > 1 ? points[points.length - 2] : null;
  return {
    points,
    last,
    prev,
    connected: enabled,
    steer: (target, deadline) => {
      steerRef.current = { target, deadline };
    },
  };
}
