import { Watch } from "lucide-react";

/**
 * The calorie goal beside the two figures that say what it costs.
 *
 * The goal is fixed at 2,300 and does not move. What makes that number mean
 * something is the gap between it and maintenance — and until the watch data
 * arrived, maintenance was a formula: resting burn times an activity factor
 * guessed off how many sessions were logged. Now there are two figures for
 * it, side by side. The estimated one is the formula. The measured one is
 * Garmin's own total daily burn, averaged over the last week, which is a
 * number the watch actually counted rather than one a table looked up.
 *
 * Shown as a deficit as well as an absolute, because "2,710 measured" only
 * matters as "410 under", and nobody should have to do the subtraction on
 * the settings screen.
 */
export function EnergyCard({
  goal,
  estimated,
  measured,
}: {
  goal: number;
  /** From the formula in lib/meals/targets.ts. */
  estimated: number;
  /** The watch's mean total burn over recent days, or null without enough data. */
  measured: { kcal: number; days: number } | null;
}) {
  return (
    <section className="surface p-5">
      <h2 className="text-[1rem] font-semibold tracking-[-0.01em]">Energy</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        The goal is fixed. Maintenance is what it is judged against — the estimate is a
        formula, the measured figure is the watch.
      </p>

      <dl className="mt-4 grid grid-cols-3 gap-3">
        <Figure label="Goal" value={goal} note="a day" />
        <Figure label="Estimated" value={estimated} note={deficit(estimated, goal)} />
        {measured ? (
          <Figure
            label="Measured"
            value={measured.kcal}
            note={`${deficit(measured.kcal, goal)} · ${measured.days} days`}
            accent
          />
        ) : (
          <div>
            <dt className="text-xs text-muted-foreground">Measured</dt>
            <dd className="mt-1 flex items-center gap-1.5 text-xs leading-relaxed text-muted-foreground">
              <Watch className="size-3.5 shrink-0" aria-hidden />
              No watch data yet
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}

/** "410 under" or "120 over": which way the goal sits against a burn. */
function deficit(maintenance: number, goal: number): string {
  const gap = maintenance - goal;
  if (gap === 0) return "at maintenance";
  return `${Math.abs(gap).toLocaleString("en-GB")} ${gap > 0 ? "under" : "over"}`;
}

function Figure({
  label,
  value,
  note,
  accent = false,
}: {
  label: string;
  value: number;
  note: string;
  accent?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1">
        <span
          className="text-[1.375rem] font-bold leading-none tracking-[-0.02em] tabular-nums"
          style={accent ? { color: "var(--ink-energy)" } : undefined}
        >
          {value.toLocaleString("en-GB")}
        </span>
        <span className="ml-1 text-xs font-medium text-muted-foreground">kcal</span>
        <div className="mt-1 text-xs tabular-nums text-muted-foreground">{note}</div>
      </dd>
    </div>
  );
}
