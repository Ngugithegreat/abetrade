"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  YAxis,
  ReferenceLine,
  Tooltip,
} from "recharts";
import type { Point } from "@/lib/useDerivFeed";

export function PriceChart({
  points,
  up,
  entryPrice,
}: {
  points: Point[];
  up: boolean;
  entryPrice?: number | null;
}) {
  const color = up ? "#00e396" : "#ff5b6a";
  const data = points.map((p) => ({ ...p }));

  // Padded domain so the line isn't glued to the edges.
  const prices = points.map((p) => p.price);
  const min = prices.length ? Math.min(...prices) : 0;
  const max = prices.length ? Math.max(...prices) : 1;
  const pad = (max - min) * 0.15 || max * 0.001 || 1;

  return (
    <div className="h-[320px] w-full sm:h-[420px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis
            domain={[min - pad, max + pad]}
            orientation="right"
            width={64}
            tick={{ fill: "#8b9bb4", fontSize: 11 }}
            tickFormatter={(v) => Number(v).toFixed(3)}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "#111826",
              border: "1px solid #22304a",
              borderRadius: 10,
              fontSize: 12,
            }}
            labelStyle={{ display: "none" }}
            formatter={(v: any) => [Number(v).toFixed(4), "Price"]}
          />
          {entryPrice ? (
            <ReferenceLine
              y={entryPrice}
              stroke="#f5b301"
              strokeDasharray="4 4"
              strokeWidth={1.5}
            />
          ) : null}
          <Area
            type="monotone"
            dataKey="price"
            stroke={color}
            strokeWidth={2}
            fill="url(#fill)"
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
