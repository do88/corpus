import { subDays } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseDay, toDay } from "../time";
import type { MealRow } from "./repository";

export type StreakMeal = Pick<MealRow, "local_date" | "status" | "kcal" | "protein_g">;

/**
 * How many days in a row have something logged, counting back from today.
 *
 * A gap ends it, which is the only reading of the word that means anything.
 * Today not being logged *yet* does not: a streak that resets every morning
 * until breakfast would be a nag rather than a record, so a missing today is
 * skipped once and the count runs from yesterday.
 *
 * There was a second figure beside it — days this week that closed under the
 * calorie ceiling and over the protein floor — and it went with the half of
 * the pill that showed it. It is in the history if it is ever wanted, along
 * with its tests.
 */
export function calculateStreaks(meals: StreakMeal[], today: string): { logged: number } {
  const days = new Set<string>();
  for (const meal of meals) {
    if (meal.local_date <= today) days.add(meal.local_date);
  }

  let logged = 0;
  const from = days.has(today) ? 0 : 1;
  while (days.has(toDay(subDays(parseDay(today), from + logged)))) logged += 1;
  return { logged };
}

/** Page through the small projection so Supabase's row cap cannot truncate a streak. */
export async function loadStreakMeals(supabase: SupabaseClient, today: string): Promise<StreakMeal[]> {
  const meals: StreakMeal[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from("meal_log")
      .select("local_date,status,kcal,protein_g")
      .lte("local_date", today)
      .order("local_date", { ascending: false }).order("id", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`Could not load streaks: ${error.message}`);
    meals.push(...(data ?? []));
    if (!data || data.length < pageSize) return meals;
  }
}
