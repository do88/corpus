"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
              stroke={token("--ink-energy", "#a2670a")}
              strokeDasharray="3 3"
              label={{
                value: r.label,
                position: "insideTopRight",
                fontSize: 10,
                // The `ink` token, not the `accent` one: this is type on the
                // card and has to clear 4.5:1, where the line itself only has
                // to clear 3:1 as a graphic.
                fill: token("--ink-energy", "#a2670a"),
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
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Bars, with an optional reference line and per-bar colour.
 *
 * Both additions exist for the Progress screen: a calorie target is only
 * meaningful drawn against the days, and a day that went over it should say so
 * without needing the axis read. `TrendChart` already took `references`, so
 * this is the same prop by the same name rather than a second spelling.
 *
 * `Cell` is how recharts colours bars individually — a `fill` on `Bar` applies
 * to the whole series, so a per-row decision has to be a child element.
 */
export function BarsChart({
  data,
  x,
  y,
  unit = "",
  height = 160,
  references = [],
  colourFor,
  yAxisWidth = 44,
}: {
  data: Record<string, unknown>[];
  x: string;
  y: string;
  unit?: string;
  height?: number;
  references?: { value: number; label: string }[];
  /** Per-row bar colour. Omit for one colour across the series. */
  colourFor?: (row: Record<string, unknown>) => string;
  /**
   * Room for the Y labels. 44px fits the three digits the training charts use
   * and silently clipped four-digit calories to "300" — a chart quietly lying
   * about its axis is worse than one that does not draw.
   */
  yAxisWidth?: number;
}) {
  return (
    <div className="text-muted-foreground" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 4, bottom: 0, left: yAxisWidth > 44 ? 0 : -18 }}
        >
          <CartesianGrid vertical={false} stroke="var(--rule)" />
          <XAxis dataKey={x} {...AXIS} minTickGap={16} />
          <YAxis {...AXIS} width={yAxisWidth} />
          <ChartTooltip unit={unit} />

          {references.map((r) => (
            <ReferenceLine
              key={r.label}
              y={r.value}
              stroke={token("--ink-energy", "#a2670a")}
              strokeDasharray="3 3"
              label={{
                value: r.label,
                position: "insideTopRight",
                fontSize: 10,
                fill: token("--ink-energy", "#a2670a"),
              }}
            />
          ))}

          <Bar dataKey={y} radius={3} isAnimationActive={false} fill="var(--foreground)">
            {colourFor &&
              data.map((row, index) => (
                <Cell key={index} fill={colourFor(row)} />
              ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
