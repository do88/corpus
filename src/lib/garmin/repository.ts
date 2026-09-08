import type { SupabaseClient } from "@supabase/supabase-js";
import { subDays } from "date-fns";
import { inZone, toDay } from "../time";

/**
 * Reads of what the watch recorded.
 *
 * Takes a client rather than making one, like every other repository here.
 * The tables are read-only for the app; they are written by the port script.
 */

export type GarminDailyRow = {
  day: string;
  resting_hr: number | null;
  steps: number | null;
  calories_total: number | null;
  calories_bmr: number | null;
  calories_active: number | null;
  moderate_min: number | null;
  vigorous_min: number | null;
  stress_avg: number | null;
  body_battery_max: number | null;
};

const COLUMNS =
  "day, resting_hr, steps, calories_total, calories_bmr, calories_active, moderate_min, vigorous_min, stress_avg, body_battery_max";

/** The last `days` days of the watch's daily figures, oldest first. */
export async function recentGarminDays(
  supabase: SupabaseClient,
  days: number,
): Promise<GarminDailyRow[]> {
  const from = toDay(subDays(inZone(), days));
  const { data, error } = await supabase
    .from("garmin_daily")
    .select(COLUMNS)
    .gte("day", from)
    .order("day", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as GarminDailyRow[];
}

/**
 * Measured maintenance: the mean of the watch's total daily burn.
 *
 * Only days with a figure count, and a day of zero is treated as unrecorded —
 * a watch left on the bedside table reports a BMR-only day, and there is no
 * reliable way to tell that from a rest day, but a hard zero is never a real
 * day. Returns null below `minDays`, because a two-day mean is a coincidence
 * with a decimal point.
 */
export function measuredMaintenance(
  rows: Pick<GarminDailyRow, "calories_total">[],
  minDays = 5,
): { kcal: number; days: number } | null {
  const burns = rows
    .map((r) => r.calories_total)
    .filter((k): k is number => typeof k === "number" && k > 0);
  if (burns.length < minDays) return null;
  const kcal = Math.round(burns.reduce((sum, k) => sum + k, 0) / burns.length);
  return { kcal, days: burns.length };
}

/** One day the watch reported, trimmed to what a screen needs. */
export type WatchDay = { day: string; steps: number | null; kcal: number | null };

/**
 * The days the watch has reported lately, oldest last.
 *
 * A smaller projection than `recentGarminDays` because this one is serialised
 * into a client component, and ten columns of a fortnight is a lot of bytes
 * to ship so a card can say two numbers.
 *
 * The window is deliberately wider than a week. The sync runs weekly, so on a
 * Sunday the newest day the watch has reported is six days old, and a
 * seven-day window would some days hold nothing at all.
 */
export async function recentWatchDays(
  supabase: SupabaseClient,
  days = 21,
): Promise<WatchDay[]> {
  const from = toDay(subDays(inZone(), days));
  const { data, error } = await supabase
    .from("garmin_daily")
    .select("day, steps, calories_total")
    .gte("day", from)
    .order("day", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    day: row.day as string,
    steps: row.steps as number | null,
    kcal: row.calories_total as number | null,
  }));
}

/** What a day cost, against what a day usually costs. */
export type DayEnergy = {
  /** The watch's own total for a day it has finished counting. */
  counted: number | null;
  /** The mean of recent complete days, for a day it has not. */
  typical: { kcal: number; days: number } | null;
};

/**
 * The two burn figures a day can be judged against.
 *
 * **Today never uses its counted figure, even when one exists.** The sync runs
 * at five in the morning, so on a sync day the watch has a row for today
 * holding a few hundred calories of being asleep. Reading that as the day's
 * burn would tell you that you were four thousand calories up before lunch.
 * A day still in progress has no final total, so today is always judged
 * against the typical figure and past days against their own.
 */
export function dayEnergy(day: string, today: string, watch: WatchDay[]): DayEnergy {
  const row = day === today ? undefined : watch.find((w) => w.day === day);
  return {
    counted: row && (row.kcal ?? 0) > 0 ? row.kcal : null,
    typical: measuredMaintenance(watch.map((w) => ({ calories_total: w.kcal }))),
  };
}
