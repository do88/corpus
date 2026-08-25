import type { SupabaseClient } from "@supabase/supabase-js";
import { estimateMeal } from "@/lib/meal/estimate";
import { recordFailure, saveEstimate, type MealRow } from "./repository";

/**
 * Turn one pending meal into macros.
 *
 * Shared by the two things that can do this work: the background worker, which
 * runs the moment a meal is logged, and the reconciler, which sweeps up what
 * the worker never finished. Keeping it in one place is what makes those two
 * paths genuinely equivalent rather than merely similar — a divergence here
 * would show up as meals that analyse differently depending on which route
 * happened to reach them.
 *
 * Takes a client with the secret key: neither caller has a browser session.
 */
export async function processMeal(
  supabase: SupabaseClient,
  mealId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { data, error } = await supabase
    .from("meal_log")
    .select("*")
    .eq("id", mealId)
    .single();

  // Distinguished deliberately. These were collapsed into "No such meal", and
  // when the real cause was "permission denied for table meal_log" the message
  // sent the search in exactly the wrong direction — while `attempts` stayed at
  // zero, so nothing looked like it had even been tried.
  if (error) return { ok: false, reason: `Could not load meal: ${error.message}` };
  if (!data) return { ok: false, reason: "No such meal" };
  const meal = data as MealRow;
  if (meal.status === "analyzed") return { ok: true };

  // Claimed before the slow part. Both the attempt count and `updated_at` move
  // now, so a reconciler sweep overlapping this invocation sees the row as
  // freshly touched and leaves it alone rather than doubling the work.
  const attempt = meal.attempts + 1;
  await supabase.from("meal_log").update({ attempts: attempt }).eq("id", mealId);

  try {
    let imageBase64: string | undefined;
    if (meal.photo_path) {
      const { data: file, error: downloadError } = await supabase.storage
        .from("meal-photos")
        .download(meal.photo_path);
      if (downloadError) throw new Error(`Photo missing: ${downloadError.message}`);
      imageBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    }

    const { estimate, model } = await estimateMeal({
      imageBase64,
      note: meal.note ?? undefined,
    });
    await saveEstimate(supabase, mealId, estimate, model);
    return { ok: true };
  } catch (thrown) {
    const message = thrown instanceof Error ? thrown.message : String(thrown);
    // Written before anything is rethrown: the row is the only thing the UI
    // can see, and a failure nobody is told about is the worst outcome here.
    await recordFailure(supabase, mealId, attempt, message);
    return { ok: false, reason: message };
  }
}

/** The one client both callers need: no session, so the secret key. */
export function workerEnv() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key: process.env.SUPABASE_SECRET_KEY!,
  };
}
