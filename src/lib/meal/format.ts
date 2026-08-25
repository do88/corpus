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
