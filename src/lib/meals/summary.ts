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
  const out: string[] = [];
  const cursor = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (cursor <= end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
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
  const date = new Date(`${day}T12:00:00Z`);
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return [monday.toISOString().slice(0, 10), sunday.toISOString().slice(0, 10)];
}

/** The calendar month containing `day`. */
export function monthRange(day: string): [string, string] {
  const date = new Date(`${day}T12:00:00Z`);
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12));
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12));
  return [first.toISOString().slice(0, 10), last.toISOString().slice(0, 10)];
}
