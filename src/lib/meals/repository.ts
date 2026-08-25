import type { SupabaseClient } from "@supabase/supabase-js";
import type { MealEstimate } from "@/lib/meal/schema";

/**
 * Every read and write of `meal_log`, in one place.
 *
 * Takes a client rather than making one, because the same queries run as three
 * different callers: the browser, the server acting as the user, and the worker
 * with the secret key. Whichever is passed decides what RLS allows — this layer
 * has no opinion and no credentials of its own.
 */

/**
 * After this many goes it is a real failure, not a blip, and the UI says so.
 *
 * One constant because three things have to agree on it: `recordFailure` below
 * flips the row to `failed` at this count, and both sweepers — the client-side
 * retry and the scheduled reconciler — refuse to pick a row up once it is
 * reached. They were three separate literals; a change to one would either have
 * retried a dead meal forever or given up on a live one early.
 */
export const MAX_ATTEMPTS = 3;

export type MealRow = {
  id: string;
  logged_at: string;
  local_date: string;
  status: "pending" | "analyzed" | "failed";
  attempts: number;
  photo_path: string | null;
  note: string | null;
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  items: MealEstimate["items"] | null;
  confidence: MealEstimate["confidence"] | null;
  assumptions: string | null;
  edited: boolean;
  error: string | null;
};

/**
 * The day a moment belongs to, with the boundary at 04:00 — a meal at 1am
 * counts toward the night before.
 *
 * Mirrors the `local_day()` function in migration ...818. Two copies because
 * the client has to name the day it is inserting before the row exists, and it
 * cannot call a Postgres function to find out. Same rule, and they must move
 * together.
 */
export function localDay(at: Date = new Date()): string {
  const shifted = new Date(at.getTime() - 4 * 60 * 60 * 1000);
  return shifted.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

/**
 * Every meal across a span of days, for the week strip.
 *
 * One query for the whole week rather than seven — a week is a few dozen rows,
 * so the totals are summed in JavaScript rather than pushed into SQL. A view or
 * an RPC would be the right call at a hundred times this size; here it would be
 * a second place for the same arithmetic to live.
 */
export async function listMealsInRange(
  supabase: SupabaseClient,
  from: string,
  to: string,
): Promise<MealRow[]> {
  const { data, error } = await supabase
    .from("meal_log")
    .select("*")
    .gte("local_date", from)
    .lte("local_date", to)
    .order("logged_at", { ascending: true });

  if (error) throw new Error(`Could not load those days: ${error.message}`);
  return (data ?? []) as MealRow[];
}

/** kcal per day, keyed by date, for the days that have any. */
export function kcalByDay(meals: MealRow[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const meal of meals) {
    if (meal.status !== "analyzed") continue;
    totals[meal.local_date] = (totals[meal.local_date] ?? 0) + (meal.kcal ?? 0);
  }
  return totals;
}

/** The seven dates of the week containing `day`, Monday first. */
export function weekOf(day: string): string[] {
  const date = new Date(`${day}T12:00:00Z`);
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

/** What the worker writes back once Claude has answered. */
export async function saveEstimate(
  supabase: SupabaseClient,
  id: string,
  estimate: MealEstimate,
  model: string,
): Promise<void> {
  const { error } = await supabase
    .from("meal_log")
    .update({
      status: "analyzed",
      kcal: estimate.kcal,
      protein_g: estimate.protein_g,
      carbs_g: estimate.carbs_g,
      fat_g: estimate.fat_g,
      items: estimate.items,
      confidence: estimate.confidence,
      assumptions: estimate.assumptions,
      model,
      error: null,
    })
    .eq("id", id);

  if (error) throw new Error(`Could not save the estimate: ${error.message}`);
}

/**
 * Record a failure against the row.
 *
 * `attempts` is incremented here rather than left to the platform: Netlify's
 * documented background-function retries were measured and never fired, so the
 * only reliable count is the one we keep. The reconciler reads it to decide
 * what to retry and what to give up on.
 */
export async function recordFailure(
  supabase: SupabaseClient,
  id: string,
  attempts: number,
  message: string,
): Promise<void> {
  await supabase
    .from("meal_log")
    .update({
      status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
      attempts,
      error: message,
    })
    .eq("id", id);
}

/**
 * Correct the numbers by hand.
 *
 * `edited` is set and never unset. It matters later: once these rows are used
 * to judge whether the model runs high or low, an estimate the user overruled
 * is not evidence about the model — it is evidence about the meal. Mixing the
 * two would calibrate against our own corrections.
 *
 * The line items are deliberately left alone. Someone correcting a total is
 * saying "that was more like 400", not re-apportioning it across four foods,
 * and rewriting the items to match would invent detail nobody supplied.
 */
export async function correctMacros(
  supabase: SupabaseClient,
  id: string,
  macros: { kcal: number; protein_g: number; carbs_g: number; fat_g: number },
): Promise<void> {
  const { error } = await supabase
    .from("meal_log")
    .update({ ...macros, edited: true, status: "analyzed", error: null })
    .eq("id", id);

  if (error) throw new Error(`Could not save the correction: ${error.message}`);
}

/** Remove a meal entirely — a mis-photograph, or something logged twice. */
export async function deleteMeal(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("meal_log").delete().eq("id", id);
  if (error) throw new Error(`Could not delete: ${error.message}`);
}

/** Running totals for the day. Summed here so the UI never does arithmetic. */
export function totalsForDay(meals: MealRow[]) {
  const analysed = meals.filter((m) => m.status === "analyzed");
  return {
    kcal: analysed.reduce((sum, m) => sum + (m.kcal ?? 0), 0),
    protein_g: analysed.reduce((sum, m) => sum + (m.protein_g ?? 0), 0),
    carbs_g: analysed.reduce((sum, m) => sum + (m.carbs_g ?? 0), 0),
    fat_g: analysed.reduce((sum, m) => sum + (m.fat_g ?? 0), 0),
    pending: meals.filter((m) => m.status === "pending").length,
    failed: meals.filter((m) => m.status === "failed").length,
  };
}
