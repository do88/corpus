import Link from "next/link";
import { MacroCards } from "@/components/macro-cards";
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
 *
 * A Server Component, which it could not be while it handed the chart a
 * `colourFor` callback: a function cannot cross the boundary into a lazily
 * loaded client chart, so the whole file had to ship to the browser to
 * describe two colours. The colour is a field on each row now, decided here
 * where the target is known, and none of this renders on the client.
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

      {/*
        The same cards as Today, showing averages instead of a day.

        They were a bespoke block: two big figures each followed by a signed
        delta ("−120 vs 2,300") and a hit-rate ("5/7 under target"), then two
        small ones with their targets in a caption. Four different ways of
        relating a number to its target on one card, and reading it meant
        parsing a minus sign, a fraction and a slash in turn. The ring already
        does that job on the home screen, and the eye already knows it — so
        the average is drawn against its target the same way, in the same
        place on the card, in the same colour, and the hit-rate takes the
        caption. Consistent is scannable; nobody has to learn a second
        notation for the same four numbers.
      */}
      <div className="flex items-baseline justify-between gap-3 px-1">
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

      <MacroCards
        values={summary.average}
        targets={targets}
        kcalCaption={
          summary.loggedDays > 0
            ? `/ ${targets.kcal.toLocaleString("en-GB")} · ${summary.onTarget.kcal} of ${summary.loggedDays} days under`
            : undefined
        }
        proteinCaption={
          summary.loggedDays > 0
            ? `/ ${targets.protein_g} · ${summary.onTarget.protein} of ${summary.loggedDays} days hit`
            : undefined
        }
      />

      <DailyBars summary={summary} targets={targets} />
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
    // Amber for a day over the ceiling, blue for one under it — the same two
    // hues the rings use for energy and protein, so the colours mean the same
    // thing on both screens. Decided here, where the target is known, and
    // carried as data so the chart needs no callback.
    fill: d.kcal > targets.kcal ? "var(--accent-energy)" : "var(--accent-protein)",
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
        colourKey="fill"
      />
    </div>
  );
}
