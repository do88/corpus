import type { Macro } from "./schema";

/**
 * How meal data is written on screen. Shared so the two components that show a
 * meal — the day's list and the correction editor — cannot label or timestamp
 * the same figure differently.
 */

/** What each macro is called in the UI. `kcal` is a count; the rest are grams. */
export const MACRO_LABELS: Record<Macro, string> = {
  kcal: "kcal",
  protein_g: "protein",
  carbs_g: "carbs",
  fat_g: "fat",
};

/**
 * Constructed once at module load rather than per render. `Intl.DateTimeFormat`
 * is expensive to build and this one runs for every meal in the list.
 *
 * The zone is fixed to Europe/London rather than the device's, to match the
 * 04:00 day boundary in `localDay` — a meal has to be stamped with the same
 * clock that decided which day it counts toward.
 */
const TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/London",
});

/** An ISO timestamp as the time of day it was logged: "14:05". */
export function formatTime(iso: string): string {
  return TIME.format(new Date(iso));
}

/**
 * Which part of the day a meal happened in.
 *
 * Same fixed zone and the same 04:00 boundary as `formatTime` and `localDay`,
 * for the same reason: the spine is drawn beside the printed time, so a meal
 * shown at 21:40 has to be on the evening stretch of it. Reading the device's
 * clock instead would put the two out of step for anyone travelling.
 *
 * `hourCycle: "h23"` rather than `hour12: false` — the latter renders midnight
 * as "24" under en-GB on some ICU builds, which lands in no band at all.
 */
const HOUR = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  hourCycle: "h23",
  timeZone: "Europe/London",
});

export type DayBand = "morning" | "afternoon" | "evening";

export function mealBand(iso: string): DayBand {
  const hour = Number(HOUR.format(new Date(iso)));
  if (hour >= 12 && hour < 18) return "afternoon";
  // Evening wraps past midnight, because the day itself does: `localDay` cuts
  // at 04:00, so a 01:00 meal is still last night's, not this morning's.
  if (hour >= 18 || hour < 4) return "evening";
  return "morning";
}
