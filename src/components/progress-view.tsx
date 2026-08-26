"use client";

import { useRouter } from "next/navigation";
import { Flame, Utensils } from "lucide-react";
import type { DailyTargets } from "@/lib/meals/targets";
import type { PeriodSummary } from "@/lib/meals/summary";

/**
 * A week or a month, averaged.
 *
 * The bar chart is hand-rolled rather than recharts. It is one series of at
 * most 31 values with a reference line — the chart library on the training
 * page costs ~390 KB and earns it there, where four multi-series charts share
 * it. Here it would be the heaviest thing on the screen to draw thirty
 * rectangles.
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
  const router = useRouter();
  const coverage =
    summary.totalDays === 0 ? 0 : Math.round((summary.loggedDays / summary.totalDays) * 100);

  return (
    <div className="mt-5 space-y-3">
      {/* Week / month. Two states, so a segmented control rather than a menu. */}
      <div className="surface flex gap-1 p-1" style={{ borderRadius: 999 }}>
        {(["week", "month"] as const).map((option) => {
          const active = option === range;
          return (
            <button
              key={option}
              type="button"
              onClick={() => router.push(`/progress?range=${option}&d=${day}`)}
              aria-pressed={active}
              className="tappable flex-1 rounded-full py-2 text-sm font-medium capitalize transition-colors"
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
            </button>
          );
        })}
      </div>

      <div className="surface p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[0.9375rem] font-semibold tracking-[-0.01em]">{label}</h2>
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
        <span className="text-[1.6rem] font-bold leading-none tracking-[-0.02em] tabular-nums">
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
      <div className="text-[1.0625rem] font-semibold tabular-nums">
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
 * Unlogged days are drawn as an empty slot rather than skipped, so a gap looks
 * like a gap. Compressing the axis to only the days with data would make a
 * fortnight of three entries look like three solid days.
 */
function DailyBars({ summary, targets }: { summary: PeriodSummary; targets: DailyTargets }) {
  const peak = Math.max(targets.kcal, ...summary.days.map((d) => d.kcal));

  return (
    <div className="surface p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-[0.9375rem] font-semibold tracking-[-0.01em]">Calories by day</h3>
        <span className="text-xs text-muted-foreground tabular-nums">
          target {targets.kcal.toLocaleString("en-GB")}
        </span>
      </div>

      <div className="relative flex h-32 items-end gap-1">
        {/*
          The target line, on the same scale as the bars and *above* them.
          Without the z-index it rendered first and every bar painted straight
          over it — the reference the chart exists to show was the one thing
          you could not see.
        */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed"
          style={{
            bottom: `${(targets.kcal / peak) * 100}%`,
            borderColor: "var(--ink-energy)",
            opacity: 0.7,
          }}
        />
        {summary.days.map((d) => {
          const over = d.kcal > targets.kcal;
          return (
            <div
              key={d.date}
              className="group relative flex-1"
              style={{ height: "100%" }}
              title={`${d.date} — ${d.logged ? `${d.kcal.toLocaleString("en-GB")} kcal` : "nothing logged"}`}
            >
              {/* The empty slot. Kept faint: it marks a day that exists, and
                  at month length a stronger track reads as a bar of its own. */}
              <div
                className="absolute inset-x-0 bottom-0 rounded-t-[3px]"
                style={{ height: "100%", background: "var(--muted)", opacity: 0.55 }}
              />
              <div
                className="absolute inset-x-0 bottom-0 rounded-t-[3px] transition-[height]"
                style={{
                  height: `${peak === 0 ? 0 : (d.kcal / peak) * 100}%`,
                  background: over
                    ? "var(--accent-energy)"
                    : "linear-gradient(to top, var(--accent-protein), color-mix(in oklch, var(--accent-protein) 70%, transparent))",
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex justify-between text-[0.6875rem] text-muted-foreground tabular-nums">
        <span>{summary.days[0]?.date.slice(8)}</span>
        <span>{summary.days.at(-1)?.date.slice(8)}</span>
      </div>
    </div>
  );
}
