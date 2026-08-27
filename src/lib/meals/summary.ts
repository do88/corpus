import { eachDayOfInterval, endOfMonth, endOfWeek, startOfMonth, startOfWeek } from "date-fns";
import { parseDay, toDay } from "../time";
import type { MealRow } from "./repository";
import type { DailyTargets } from "./targets";

/**
 * Rolling up a span of days, and the one decision that matters.
 *
 * **Averages are over days you logged, not days that elapsed.** A Tuesday with
 * nothing on it is almost always a Tuesday you did not open the app, not one
 * where you ate nothing — and letting it count as a zero drags the mean down
 * until the number says you are eating 1,400 kcal when you are not. That is
 * worse than useless: it is a figure you would act on.
 *
 * The cost of that choice is that the average says nothing about consistency,
 * so coverage is reported beside it and never folded into it. "2,180 average
 * across 11 of 14 days" is two honest facts; "1,713 average" is one misleading
 * one.
 */

export type DaySummary = {
  date: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  /** Whether anything was logged and analysed. Drives every average below. */
  logged: boolean;
};

export type PeriodSummary = {
  days: DaySummary[];
  loggedDays: number;
  totalDays: number;
  /** Mean across logged days only. Zeroes when nothing is logged. */
  average: { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
  /** Logged days that cleared the protein floor / stayed under the kcal ceiling. */
  onTarget: { protein: number; kcal: number };
  /** Total intake across the period, which *is* a calendar-wide figure. */
  total: { kcal: number; protein_g: number };
};

/** Every date from `from` to `to` inclusive, as plain YYYY-MM-DD. */
export function datesBetween(from: string, to: string): string[] {
  return eachDayOfInterval({ start: parseDay(from), end: parseDay(to) }).map(toDay);
}

export function summarise(
  meals: MealRow[],
  dates: string[],
  targets: DailyTargets,
): PeriodSummary {
  const byDate = new Map<string, DaySummary>();
  for (const date of dates) {
    byDate.set(date, { date, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, logged: false });
  }

  for (const meal of meals) {
    // Only analysed meals count. A pending one has no numbers yet, and a failed
    // one never will — treating either as zero would understate the day while
    // still marking it logged, which is the worst of both.
    if (meal.status !== "analyzed") continue;
    const day = byDate.get(meal.local_date);
    if (!day) continue;
    day.kcal += meal.kcal ?? 0;
    day.protein_g += meal.protein_g ?? 0;
    day.carbs_g += meal.carbs_g ?? 0;
    day.fat_g += meal.fat_g ?? 0;
    day.logged = true;
  }

  const days = dates.map((d) => byDate.get(d)!);
  const logged = days.filter((d) => d.logged);

  const mean = (pick: (d: DaySummary) => number) =>
    logged.length === 0 ? 0 : Math.round(logged.reduce((s, d) => s + pick(d), 0) / logged.length);

  return {
    days,
    loggedDays: logged.length,
    totalDays: days.length,
    average: {
      kcal: mean((d) => d.kcal),
      protein_g: mean((d) => d.protein_g),
      carbs_g: mean((d) => d.carbs_g),
      fat_g: mean((d) => d.fat_g),
    },
    onTarget: {
      // Protein is a floor you clear; calories are a ceiling you stay under.
      // Counting both as "within 10%" would flatter one and punish the other.
      protein: logged.filter((d) => d.protein_g >= targets.protein_g).length,
      kcal: logged.filter((d) => d.kcal <= targets.kcal).length,
    },
    total: {
      kcal: days.reduce((s, d) => s + d.kcal, 0),
      protein_g: days.reduce((s, d) => s + d.protein_g, 0),
    },
  };
}

/** The Monday-anchored week containing `day`, and the day before it repeats. */
export function weekRange(day: string): [string, string] {
  const date = parseDay(day);
  // `weekStartsOn: 1` rather than counting backwards from the weekday index by
  // hand, which is where the old version's `(getUTCDay() + 6) % 7` came from.
  return [
    toDay(startOfWeek(date, { weekStartsOn: 1 })),
    toDay(endOfWeek(date, { weekStartsOn: 1 })),
  ];
}

/** The calendar month containing `day`. */
export function monthRange(day: string): [string, string] {
  const date = parseDay(day);
  return [toDay(startOfMonth(date)), toDay(endOfMonth(date))];
}
