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
