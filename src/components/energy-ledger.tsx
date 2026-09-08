import { Flame } from "lucide-react";
import type { DayEnergy } from "@/lib/garmin/repository";

/**
 * The day as a ledger: what the body spent, what the food put back.
 *
 * Everything else on Today judges the day against a fixed 2,300, which is the
 * plan. This judges it against what the body actually costs, which is the
 * physics — and the two tell very different stories. A day of 3,632 reads as
 * 1,332 over the plan and as 96 over break-even, and both are true. The
 * second is the one that decides whether the app gets opened tomorrow.
 *
 * It is not a softer number, and it must not be read as permission: the goal
 * is a deficit, so break-even is still a day that lost nothing. It is a
 * truer denominator, which is a different thing from a kinder one.
 *
 * The burn is the watch's own figure for a day it has finished counting, and
 * the mean of recent days for one it has not — which is every today, because
 * a day still being lived has no total yet. `dayEnergy` decides that; the
 * only job here is to say which of the two is being shown, because a measured
 * figure and an average deserve different amounts of trust.
 *
 * Renders nothing without a watch. A ledger with one side missing is not a
 * ledger, and inventing the other side is exactly what this app does not do.
 */
export function EnergyLedger({
  energy,
  eaten,
  isToday,
}: {
  energy: DayEnergy;
  /** Calories logged and analysed for the day. */
  eaten: number;
  isToday: boolean;
}) {
  const burned = energy.counted ?? energy.typical?.kcal ?? null;
  if (burned === null || burned <= 0) return null;

  const measured = energy.counted !== null;
  const balance = burned - eaten;
  const over = balance < 0;
  const fraction = Math.min(eaten / burned, 1);

  const n = (value: number) => Math.abs(value).toLocaleString("en-GB");

  return (
    <section className="surface p-4.5" aria-label="Energy balance">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="flex min-w-0 items-baseline gap-2">
          <span
            className="text-[1rem] font-semibold tracking-[-0.01em]"
            style={{ color: "var(--ink-energy)" }}
          >
            Balance
          </span>
          {/*
            Which burn figure this is, in the small voice. "Burned" is the
            watch's count of a finished day; "burns about" is an average over
            recent days, and the difference matters enough to spell out.
          */}
          <span className="truncate text-xs tabular-nums text-muted-foreground">
            {measured ? `burned ${n(burned)}` : `burns about ${n(burned)}`} · ate {n(eaten)}
          </span>
        </h2>
        <p
          className="m-0 shrink-0 text-[1rem] font-semibold tabular-nums"
          style={{ color: over ? "var(--destructive)" : undefined }}
        >
          {balance === 0 ? "level" : `${n(balance)} ${over ? "over" : "under"}`}
        </p>
      </div>

      {/* The same bar the macros use, against a different denominator: full
          is having eaten everything the day cost. */}
      <div
        role="img"
        aria-label={`Ate ${n(eaten)} of ${n(burned)} calories burned`}
        className="mt-1.5 w-full overflow-hidden rounded-full"
        style={{ height: 8, background: "color-mix(in oklch, var(--rule) 55%, transparent)" }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{
            width: `${Math.round(fraction * 1000) / 10}%`,
            background: over ? "var(--destructive)" : "var(--accent-energy)",
          }}
        />
      </div>

      <p className="mt-2 flex items-center gap-1.5 text-xs leading-relaxed text-muted-foreground">
        <Flame className="size-3.5 shrink-0" aria-hidden />
        {measured
          ? "What your watch counted for this day."
          : isToday
            ? `Your average over the last ${energy.typical?.days} days. The watch has not finished counting today.`
            : `Your average over the last ${energy.typical?.days} days. The watch has no figure for this day.`}
      </p>
    </section>
  );
}
