"use client";

import { useId } from "react";
import { format } from "date-fns";
import {
  Area,
  AreaChart,
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

function ChartTooltip({ unit = "", label }: { unit?: string; label?: (value: unknown) => string }) {
  return (
    <Tooltip
      labelFormatter={label ? (value) => label(value) : undefined}
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
 * One series as a filled area, in the metric's own hue.
 *
 * For the Weight section, where a bare grey line over five years read as a
 * wire rather than a quantity. The fill fades out towards the axis so it adds
 * weight without hiding the grid, and the newest point is drawn as a dot, so
 * "where it is now" is a mark on the chart rather than wherever the line
 * happens to stop.
 *
 * References take their own colour, because a target is not always the same
 * kind of thing, and they stretch the range to include themselves. A target
 * below every reading used to be discarded off the bottom of the chart, which
 * is exactly the case where it is the most worth seeing.
 */
export function AreaTrend({
  data,
  x,
  y,
  label = "",
  unit = "",
  colour,
  height = 180,
  references = [],
}: {
  data: Record<string, unknown>[];
  x: string;
  y: string;
  label?: string;
  unit?: string;
  colour: string;
  height?: number;
  references?: { value: number; label: string; colour?: string }[];
}) {
  // A gradient is referenced by id, and two charts on one page must not share
  // one. `useId` output contains colons, which `url(#…)` does not accept.
  const fill = `area-${useId().replaceAll(":", "")}`;
  const last = data.length - 1;
  // Dates go on a time axis, not a row of labels. As categories, two years
  // between weigh-ins took the same width as a fortnight, so the slope of the
  // line was a picture of how often you stood on the scale — and a month with
  // several readings printed its name twice. Ticks say the month, "Jan 25";
  // the tooltip says the day.
  const TIME = "__time";
  const timed = data.length > 0 && /^\d{4}-\d{2}-\d{2}/.test(String(data[0][x]));
  const rows = timed ? data.map((row) => ({ ...row, [TIME]: Date.parse(String(row[x]).slice(0, 10)) })) : data;

  return (
    <div className="text-muted-foreground" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: colour, stopOpacity: 0.34 }} />
              <stop offset="100%" style={{ stopColor: colour, stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--rule)" />
          {timed ? (
            <XAxis
              dataKey={TIME}
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              {...AXIS}
              minTickGap={24}
              tickFormatter={(value: number) => format(value, "MMM yy")}
            />
          ) : (
            <XAxis dataKey={x} {...AXIS} minTickGap={24} />
          )}
          <YAxis {...AXIS} width={44} domain={["auto", "auto"]} />
          <ChartTooltip unit={unit} label={timed ? (value) => format(Number(value), "d MMM yyyy") : undefined} />
          {references.map((r) => {
            const stroke = r.colour ?? token("--ink-energy", "#a2670a");
            return (
              <ReferenceLine
                key={r.label}
                y={r.value}
                ifOverflow="extendDomain"
                stroke={stroke}
                strokeDasharray="3 3"
                label={{ value: r.label, position: "insideTopRight", fontSize: 10, fill: stroke }}
              />
            );
          })}
          <Area
            type="monotone"
            dataKey={y}
            name={label}
            stroke={colour}
            strokeWidth={2.5}
            fill={`url(#${fill})`}
            connectNulls
            isAnimationActive={false}
            dot={(props: { cx?: number; cy?: number; index?: number }) =>
              props.index === last && props.cx != null && props.cy != null ? (
                <circle key="now" cx={props.cx} cy={props.cy} r={4.5} fill={colour} stroke="var(--card)" strokeWidth={2} />
              ) : (
                <g key={props.index} />
              )
            }
            activeDot={{ r: 5, fill: colour, stroke: "var(--card)", strokeWidth: 2 }}
          />
        </AreaChart>
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
 *
 * The colour arrives as a field on each row rather than as a callback. A
 * function would be the obvious API and is the wrong one here: this component
 * is loaded through a client boundary, and a function cannot cross it, so
 * every caller would have to become a Client Component purely to describe a
 * colour. Naming a key keeps the decision with whoever built the data — which
 * is where it belongs — and keeps it serialisable.
 */
export function BarsChart({
  data,
  x,
  y,
  unit = "",
  height = 160,
  references = [],
  colourKey,
  yAxisWidth = 44,
}: {
  data: Record<string, unknown>[];
  x: string;
  y: string;
  unit?: string;
  height?: number;
  references?: { value: number; label: string }[];
  /**
   * The field on each row holding that bar's colour. Omit for one colour
   * across the series.
   */
  colourKey?: string;
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
            {colourKey &&
              data.map((row, index) => (
                <Cell key={index} fill={String(row[colourKey])} />
              ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
