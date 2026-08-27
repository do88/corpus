"use client";

import Link from "next/link";
import { Flame, Utensils } from "lucide-react";
import type { DailyTargets } from "@/lib/meals/targets";
import type { PeriodSummary } from "@/lib/meals/summary";
import { BarsChart } from "@/components/charts-lazy";

/**
 * A week or a month, averaged.
 *
 * The chart is the same `BarsChart` the training dashboard uses, lazily loaded
 * through `charts-lazy` so recharts still stays out of the initial bundle. It
 * gained a `references` line and per-bar colour for this screen rather than
 * getting a second chart implementation beside it — one chart component with
 * two more props beats two components that drift.
 */
export function ProgressView({
  summary,
  targets,
  range,
  label,
  day,
}: {
  summary: PeriodSummary;
  targets: DailyTargets;
  range: "week" | "month";
  /** Human name for the period being shown, e.g. "24–30 August". */
  label: string;
  day: string;
}) {
  const coverage =
    summary.totalDays === 0 ? 0 : Math.round((summary.loggedDays / summary.totalDays) * 100);

  return (
    <div className="mt-5 space-y-3">
      {/*
        Week / month. Two states, so a segmented control rather than a menu —
        and two links rather than two buttons, because each has a fixed URL
        known at render. A button calling `router.push` is invisible to Next's
        prefetcher and to everything else that understands a link: the middle
        button, a long press, the keyboard.

        `aria-current` rather than `aria-pressed`. These do not toggle
        anything; they say which of two views you are looking at, and a link
        is not a switch.
      */}
      <div className="surface flex gap-1 p-1" style={{ borderRadius: 999 }}>
        {(["week", "month"] as const).map((option) => {
          const active = option === range;
          return (
            <Link
              key={option}
              href={`/progress?range=${option}&d=${day}`}
              // Lateral, like the tabs: week and month are two views of the
              // same thing, so the page cross-fades rather than sliding.
              transitionTypes={["tab"]}
              aria-current={active ? "page" : undefined}
              className="tappable flex-1 rounded-full py-2 text-center text-sm font-medium capitalize transition-colors"
              style={
                active
                  ? {
                      background:
                        "linear-gradient(to bottom, var(--accent-protein), var(--ink-protein))",
                      color: "oklch(0.99 0 0)",
                      boxShadow: "0 1px 3px color-mix(in oklch, var(--ink-protein) 35%, transparent)",
                    }
                  : { color: "var(--muted-foreground)" }
              }
            >
              {option}
            </Link>
          );
        })}
      </div>

      <div className="surface p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[1rem] font-semibold tracking-[-0.01em]">{label}</h2>
          {/*
            Coverage sits beside the averages and is never folded into them. A
            day you did not open the app is not a day you ate nothing, so it is
            excluded from the mean — which makes saying how many days the mean
            covers part of reporting it honestly, not a footnote.
          */}
          <span className="text-xs text-muted-foreground tabular-nums">
            {summary.loggedDays} of {summary.totalDays} days · {coverage}%
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <Average
            icon={<Flame className="size-4" />}
            label="Calories a day"
            value={summary.average.kcal}
            target={targets.kcal}
            unit="kcal"
            metric="energy"
            hint={`${summary.onTarget.kcal}/${summary.loggedDays} under target`}
          />
          <Average
            icon={<Utensils className="size-4" />}
            label="Protein a day"
            value={summary.average.protein_g}
            target={targets.protein_g}
            unit="g"
            metric="protein"
            hint={`${summary.onTarget.protein}/${summary.loggedDays} hit target`}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-[var(--rule)] pt-4">
          <Small label="Carbs a day" value={summary.average.carbs_g} target={targets.carbs_g} />
          <Small label="Fat a day" value={summary.average.fat_g} target={targets.fat_g} />
        </div>
      </div>

      <DailyBars summary={summary} targets={targets} />
    </div>
  );
}

function Average({
  icon,
  label,
  value,
  target,
  unit,
  metric,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  target: number;
  unit: string;
  metric: "energy" | "protein";
  hint: string;
}) {
  const delta = value - target;
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        <span style={{ color: `var(--ink-${metric})` }} aria-hidden className="flex">
          {icon}
        </span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-[1.75rem] font-bold leading-none tracking-[-0.02em] tabular-nums">
          {value.toLocaleString("en-GB")}
        </span>
        <span className="text-xs font-medium text-muted-foreground">{unit}</span>
      </div>
      <div className="mt-1 text-xs tabular-nums text-muted-foreground">
        {/* Signed against target, because "2,180" alone makes you do the
            subtraction every time you look at it. */}
        {delta >= 0 ? "+" : "−"}
        {Math.abs(delta).toLocaleString("en-GB")} vs {target.toLocaleString("en-GB")}
      </div>
      <div className="mt-0.5 text-xs tabular-nums" style={{ color: `var(--ink-${metric})` }}>
        {hint}
      </div>
    </div>
  );
}

function Small({ label, value, target }: { label: string; value: number; target: number }) {
  return (
    <div>
      <div className="text-[1.125rem] font-semibold tabular-nums">
        {value.toLocaleString("en-GB")}
        <span className="ml-0.5 text-xs font-medium text-muted-foreground">g</span>
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
        {label} · target {target}
      </div>
    </div>
  );
}

/**
 * One bar per day against the calorie target.
 *
 * Every day in the period gets a row, including the ones with nothing on them,
 * so a gap looks like a gap — compressing the axis to only the days with data
 * would make a fortnight of three entries look like three solid days.
 */
function DailyBars({ summary, targets }: { summary: PeriodSummary; targets: DailyTargets }) {
  const data = summary.days.map((d) => ({
    // Day of the month alone: the full date is in the tooltip, and thirty-one
    // "2026-08-14"s will not fit across a phone.
    day: d.date.slice(8),
    kcal: d.kcal,
    over: d.kcal > targets.kcal,
  }));

  return (
    <div className="surface p-5">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-[1rem] font-semibold tracking-[-0.01em]">Calories by day</h3>
        <span className="text-xs text-muted-foreground tabular-nums">
          {summary.loggedDays} of {summary.totalDays} days logged
        </span>
      </div>

      <BarsChart
        data={data}
        x="day"
        y="kcal"
        unit=" kcal"
        height={168}
        // Four digits of calories need more room than the training charts' three.
        yAxisWidth={52}
        references={[{ value: targets.kcal, label: "target" }]}
        // Amber for a day over the ceiling, blue for one under it — the same
        // two hues the rings use for energy and protein, so the colours mean
        // the same thing on both screens.
        colourFor={(row) =>
          row.over ? "var(--accent-energy)" : "var(--accent-protein)"
        }
      />
    </div>
  );
}
