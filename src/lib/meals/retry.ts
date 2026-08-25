import type { SupabaseClient } from "@supabase/supabase-js";
import type { MealRow } from "./repository";

/**
 * Re-ask the worker for anything still pending when the app opens.
 *
 * Netlify's scheduler cannot run faster than hourly, so the server-side sweep
 * is a long backstop rather than a prompt one. This covers the case that
 * actually matters: you open the app, see a meal saying "analysing", and it
 * should sort itself out in seconds rather than by the next hour.
 *
 * Safe to call repeatedly. The worker claims a row by incrementing `attempts`
 * before doing anything slow, and rows are only picked up here once they are
 * older than the time a normal estimate takes.
 */

/** Long enough that a worker mid-flight is left alone. */
const STALE_AFTER_MS = 90_000;

/** After three goes it is a real failure and the UI should say so. */
const MAX_ATTEMPTS = 3;

export async function retryStalePending(
  supabase: SupabaseClient,
  accessToken: string,
  day: string,
): Promise<number> {
  const staleBefore = new Date(Date.now() - STALE_AFTER_MS).toISOString();

  const { data, error } = await supabase
    .from("meal_log")
    .select("id")
    .eq("local_date", day)
    .eq("status", "pending")
    .lt("attempts", MAX_ATTEMPTS)
    .lt("updated_at", staleBefore);

  if (error || !data?.length) return 0;

  await Promise.all(
    (data as Pick<MealRow, "id">[]).map((meal) =>
      fetch("/jobs/estimate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ mealId: meal.id }),
      }).catch(() => {
        // The hourly sweep still has it. Nothing is lost by failing here.
      }),
    ),
  );

  return data.length;
}
