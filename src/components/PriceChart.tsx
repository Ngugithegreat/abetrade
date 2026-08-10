"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  YAxis,
  XAxis,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
} from "recharts";
import type { Point } from "@/lib/useDerivFeed";
import { useTheme } from "@/lib/theme";

// How many recent ticks to show — a tighter window zooms in on the price action.
const VISIBLE = 90;

export function PriceChart({
  points,
  up,
  entryPrice,
  decimals = 2,
}: {
  points: Point[];
  up: boolean;
  entryPrice?: number | null;
  decimals?: number;
}) {
  const theme = useTheme();
  const light = theme === "light";
  const color = up ? "#00E39A" : "#FF4D6D";
  const gridColor = light ? "#e7eaf2" : "#1c2230";
  const axisColor = light ? "#7a8296" : "#8b93a6";
  const tipBg = light ? "#ffffff" : "#12131b";
  const tipBorder = light ? "#e0e4ee" : "#262a38";

  // Zoom to the most recent ticks so movement reads up close.
  const data = points.slice(-VISIBLE).map((p) => ({ ...p }));

  const prices = data.map((p) => p.price);
  const min = prices.length ? Math.min(...prices) : 0;
  const max = prices.length ? Math.max(...prices) : 1;
  const pad = (max - min) * 0.08 || max * 0.0004 || 1;
  const last = data.length ? data[data.length - 1].price : null;
  const fmt = (v: number) => v.toFixed(decimals);

  // Custom price tag pinned to the right axis at the current price.
  const PriceTag = (props: any) => {
    const { viewBox } = props;
    if (!viewBox || last == null) return null;
    const y = viewBox.y;
    const right = viewBox.x + viewBox.width;
    const w = 62;
    const label = fmt(last);
    return (
      <g>
        <rect x={right - w} y={y - 11} width={w} height={22} rx={5} fill={color} />
        <text
          x={right - w / 2}
          y={y + 4}
          textAnchor="middle"
          fontSize={11}
          fontWeight={700}
          fill="#06120f"
        >
          {label}
        </text>
      </g>
    );
  };

  const lastIndex = data.length - 1;
  const renderDot = (props: any) => {
    const { cx, cy, index, key } = props;
    if (index !== lastIndex || cx == null || cy == null) {
      return <g key={key ?? index} />;
    }
    return (
      <g key={key ?? "last"}>
        <circle cx={cx} cy={cy} r={8} fill={color} opacity={0.22}>
          <animate attributeName="r" values="6;12;6" dur="1.6s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.25;0;0.25" dur="1.6s" repeatCount="indefinite" />
        </circle>
        <circle cx={cx} cy={cy} r={3.5} fill={color} stroke={light ? "#fff" : "#0a0b10"} strokeWidth={1.5} />
      </g>
    );
  };

  return (
    <div className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, bottom: 4, left: 6 }}>
          <defs>
            <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="55%" stopColor={color} stopOpacity={0.06} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={gridColor} strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="epoch"
            tick={{ fill: axisColor, fontSize: 10 }}
            tickFormatter={(v) =>
              new Date(Number(v) * 1000).toLocaleTimeString("en-GB", {
                minute: "2-digit",
                second: "2-digit",
              })
            }
            axisLine={false}
            tickLine={false}
            minTickGap={64}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[min - pad, max + pad]}
            orientation="right"
            mirror
            width={10}
            tickMargin={2}
            tick={{ fill: axisColor, fontSize: 10 }}
            tickFormatter={fmt}
            tickCount={7}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: tipBg,
              border: `1px solid ${tipBorder}`,
              borderRadius: 10,
              fontSize: 12,
              color: light ? "#111827" : "#e8ecf5",
            }}
            labelFormatter={(v) =>
              new Date(Number(v) * 1000).toLocaleTimeString("en-GB")
            }
            formatter={(v: any) => [fmt(Number(v)), "Price"]}
          />
          {entryPrice ? (
            <ReferenceLine
              y={entryPrice}
              stroke="#FFB020"
              strokeDasharray="5 4"
              strokeWidth={1.25}
              label={{
                value: `entry ${fmt(entryPrice)}`,
                position: "insideLeft",
                fill: "#FFB020",
                fontSize: 10,
              }}
            />
          ) : null}
          {last != null && (
            <ReferenceLine y={last} stroke={color} strokeDasharray="4 4" strokeWidth={1} label={<PriceTag />} />
          )}
          <Area
            type="monotone"
            dataKey="price"
            stroke={color}
            strokeWidth={2}
            fill="url(#fill)"
            isAnimationActive={false}
            dot={renderDot}
            activeDot={{ r: 4, fill: color, stroke: "#0a0b10", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
