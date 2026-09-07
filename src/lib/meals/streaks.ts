import { subDays } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseDay, toDay } from "../time";
import type { DailyTargets } from "./targets";
import type { MealRow } from "./repository";

export type StreakMeal = Pick<MealRow, "local_date" | "status" | "kcal" | "protein_g">;

export function calculateStreaks(meals: StreakMeal[], today: string, targets: Pick<DailyTargets, "kcal" | "protein_g">) {
  const days = new Map<string, { kcal: number; protein: number; complete: boolean }>();
  for (const meal of meals) {
    if (meal.local_date > today) continue;
    const day = days.get(meal.local_date) ?? { kcal: 0, protein: 0, complete: true };
    day.kcal += meal.kcal ?? 0;
    day.protein += meal.protein_g ?? 0;
    day.complete &&= meal.status === "analyzed" && meal.kcal !== null && meal.protein_g !== null;
    days.set(meal.local_date, day);
  }
  const count = (offset: number, qualifies: (date: string) => boolean) => {
    let total = 0;
    while (qualifies(toDay(subDays(parseDay(today), offset + total)))) total++;
    return total;
  };
  return {
    logged: count(days.has(today) ? 0 : 1, (date) => days.has(date)),
    // Today is still in progress. Only completed tracking days earn a target day.
    onTarget: count(1, (date) => {
      const day = days.get(date);
      return !!day?.complete && day.kcal < targets.kcal && day.protein >= targets.protein_g;
    }),
  };
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
