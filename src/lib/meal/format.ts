import { format } from "date-fns";
import { inZone } from "../time";
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
  return format(inZone(new Date(iso)), "HH:mm");
}

/**
 * Which part of the day a meal happened in.
 *
 * Same fixed zone and the same 04:00 boundary as `formatTime` and `localDay`,
 * for the same reason: the spine is drawn beside the printed time, so a meal
 * shown at 21:40 has to be on the evening stretch of it. Reading the device's
 * clock instead would put the two out of step for anyone travelling.
 *
 * Reads the hour off the zoned clock rather than parsing a formatted string,
 * which is what this used to do. Formatting an hour and parsing it back had a
 * real trap in it: under en-GB, `hour12: false` renders midnight as "24" on
 * some ICU builds, landing in no band at all. A number that was never a string
 * cannot be misread.
 */
export type DayBand = "morning" | "afternoon" | "evening";

export function mealBand(iso: string): DayBand {
  const hour = inZone(new Date(iso)).getHours();
  if (hour >= 12 && hour < 18) return "afternoon";
  // Evening wraps past midnight, because the day itself does: `localDay` cuts
  // at 04:00, so a 01:00 meal is still last night's, not this morning's.
  if (hour >= 18 || hour < 4) return "evening";
  return "morning";
}
