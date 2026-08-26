import type { Macro, MealItem } from "./schema";

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

/**
 * Units that make a leading number a measurement rather than a count.
 *
 * The whole reason this list exists: "200g" and "2 slices" both begin with a
 * number, and only one of them means "two of these". Without the distinction a
 * jacket potato logged as "250g" would read as "250 x Jacket potato".
 */
const MEASURE = new Set(["g", "kg", "mg", "ml", "l", "cl", "oz", "lb", "fl"]);

/**
 * An item written as a title: "2 x Rich tea biscuits", or just its name.
 *
 * The count is the part worth promoting. `qty` already holds it — "2 slices
 * (64g)", "3 thighs (~270g)" — but it was only ever shown inside the editor,
 * so the card said "Mr Kipling Birthday Cake Slices" whether you had eaten one
 * or the whole box. The gram weight stays where it is: it is the detail you go
 * looking for, where the count is the thing you want to see without looking.
 *
 * A count of one is left off. "1 x Jacket potato" is noise — the absence of a
 * number already says one.
 */
export function describeItem(item: Pick<MealItem, "name" | "qty">): string {
  // A leading integer, optionally followed by "x", then whatever word comes
  // next — which is what decides whether the number was a count or a weight.
  const match = /^\s*(\d+)\s*(?:x\s*)?([a-z]*)/i.exec(item.qty ?? "");
  if (!match) return item.name;

  const count = Number(match[1]);
  if (!Number.isFinite(count) || count <= 1) return item.name;
  if (MEASURE.has(match[2].toLowerCase())) return item.name;

  return `${count} \u00d7 ${item.name}`;
}

/** Every item in a meal, as the line at the top of its card. */
export function summariseItems(items: Pick<MealItem, "name" | "qty">[]): string {
  return items.map(describeItem).join(", ");
}

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
