"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Chart wrappers, styled to the same rules as everything else: hairlines, no
 * rounded corners, no shadows, no gridlines beyond a horizontal rule.
 *
 * Recharts wants concrete colours, not Tailwind classes, so the tokens are read
 * off the document at render. That keeps one palette rather than a second set
 * of hex codes that drift from the first — and it means the charts follow the
 * light/dark switch like the rest of the page.
 */

function token(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

const AXIS = {
  tickLine: false,
  axisLine: false,
  tick: { fontSize: 10, fill: "currentColor", letterSpacing: "0.06em" },
} as const;

function ChartTooltip({ unit = "" }: { unit?: string }) {
  return (
    <Tooltip
      cursor={{ stroke: "currentColor", strokeOpacity: 0.25 }}
      contentStyle={{
        background: "var(--popover)",
        border: "1px solid var(--rule)",
        borderRadius: 0,
        fontSize: "0.8125rem",
        padding: "0.5rem 0.625rem",
      }}
      labelStyle={{ fontWeight: 600 }}
      formatter={(value, name) => [`${value ?? "—"}${unit}`, String(name ?? "")]}
    />
  );
}

export type Series = { key: string; label: string; colour?: string };

export function TrendChart({
  data,
  x,
  series,
  unit = "",
  height = 180,
  references = [],
}: {
  data: Record<string, unknown>[];
  x: string;
  series: Series[];
  unit?: string;
  height?: number;
  references?: { value: number; label: string }[];
}) {
  return (
    <div className="text-muted-foreground" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -18 }}>
          <CartesianGrid vertical={false} stroke="var(--rule)" />
          <XAxis dataKey={x} {...AXIS} minTickGap={24} />
          <YAxis {...AXIS} width={44} domain={["auto", "auto"]} />
          <ChartTooltip unit={unit} />
          {references.map((r) => (
            <ReferenceLine
              key={r.label}
              y={r.value}
              stroke={token("--bauhaus-red", "#b23")}
              strokeDasharray="3 3"
              label={{
                value: r.label,
                position: "insideTopRight",
                fontSize: 10,
                // The darkened token, not the vivid one: this is type on the
                // page ground and has to clear 4.5:1.
                fill: token("--bauhaus-red", "#b23"),
              }}
            />
          ))}
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.colour ?? "currentColor"}
              strokeWidth={1.5}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarsChart({
  data,
  x,
  y,
  unit = "",
  height = 160,
}: {
  data: Record<string, unknown>[];
  x: string;
  y: string;
  unit?: string;
  height?: number;
}) {
  return (
    <div className="text-muted-foreground" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -18 }}>
          <CartesianGrid vertical={false} stroke="var(--rule)" />
          <XAxis dataKey={x} {...AXIS} minTickGap={16} />
          <YAxis {...AXIS} width={44} />
          <ChartTooltip unit={unit} />
          {/* Square corners, deliberately — the whole page is square. */}
          <Bar dataKey={y} fill="var(--foreground)" radius={0} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
