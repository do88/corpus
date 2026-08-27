import { addDays, startOfWeek } from "date-fns";
import { parseDay, toDay } from "@/lib/time";
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

/**
 * The first day anything was ever logged, or `null` on an empty log.
 *
 * The floor for navigating backwards. Before this date there is no history to
 * look at — only empty weeks going back to 1970 — and a picker that scrolls
 * forever into nothing is offering something it cannot deliver.
 *
 * A floor rather than a per-day test, deliberately. A day *inside* your
 * history with nothing on it is worth being able to open: it is a day you did
 * not log, which is information, and it is what Progress counts when it says
 * "3 of 7 days". Only the void before the first entry is closed off.
 */
export async function earliestLoggedDay(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase
    .from("meal_log")
    .select("local_date")
    .order("local_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  // A failure here should cost the floor, not the screen: without it the
  // picker simply behaves as it did before.
  if (error || !data) return null;
  return data.local_date as string;
}

/** The seven dates of the week containing `day`, Monday first. */
export function weekOf(day: string): string[] {
  const monday = startOfWeek(parseDay(day), { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => toDay(addDays(monday, i)));
}

/** What the worker writes back once the estimator has answered. */
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

/**
 * Say what the meal actually was, and take the model's estimate of that.
 *
 * The difference from `correctMacros` is what it replaces. Typing 145 into the
 * kcal box overrules the model and nothing else changes — the name, the
 * itemisation and the assumptions all still describe the meal it thought you
 * had. Saying "a large pack of biltong" replaces the description itself, so
 * every one of those has to move with it, or the card ends up reading "beef
 * jerky" over a biltong's numbers.
 *
 * `edited` goes back to false deliberately, including on a meal that was hand
 * -corrected before. The flag means "these numbers are the user's, not the
 * model's", and after this they are the model's again — just from a better
 * description. Leaving it set would suppress the assumptions line on the card,
 * which is the one place the new numbers explain themselves.
 */
export async function redescribeMeal(
  supabase: SupabaseClient,
  id: string,
  note: string,
  estimate: MealEstimate,
  model: string,
): Promise<void> {
  const { error } = await supabase
    .from("meal_log")
    .update({
      status: "analyzed",
      note,
      kcal: estimate.kcal,
      protein_g: estimate.protein_g,
      carbs_g: estimate.carbs_g,
      fat_g: estimate.fat_g,
      items: estimate.items,
      confidence: estimate.confidence,
      assumptions: estimate.assumptions,
      model,
      edited: false,
      error: null,
    })
    .eq("id", id);

  if (error) throw new Error(`Could not save the new description: ${error.message}`);
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

/**
 * The most recent meals, for building a speech vocabulary from.
 *
 * Only the two columns that carry product names, and capped — this runs on the
 * path where someone is stood waiting for their words to appear, so it is a
 * cheap read or it does not belong there. Failure is not fatal to the caller:
 * a transcription without hints is worse, not broken.
 */
export async function recentMealNames(
  supabase: SupabaseClient,
  limit = 200,
): Promise<Array<{ note: string | null; items: MealEstimate["items"] | null }>> {
  const { data, error } = await supabase
    .from("meal_log")
    .select("note, items")
    .order("logged_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Could not load recent meals: ${error.message}`);
  return (data ?? []) as Array<{ note: string | null; items: MealEstimate["items"] | null }>;
}
