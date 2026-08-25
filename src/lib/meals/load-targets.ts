import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeTargets,
  FALLBACK_TARGETS,
  GOAL_WEIGHT_KG,
  type DailyTargets,
} from "./targets";

/**
 * Read what the targets need, and compute them.
 *
 * Through PostgREST rather than the direct Postgres connection, deliberately.
 * The dashboard's analytics need real SQL and therefore `db.ts`; these are three
 * trivial selects, and routing them through `db.ts` would mean the *home* screen
 * also stopped rendering whenever `DATABASE_URL` was wrong — which is exactly
 * the failure that took `/training` down. The screen you use six times a day
 * should depend on as little as possible.
 *
 * Every failure here falls back rather than throwing. A missing weigh-in should
 * show slightly generic targets, not an error page where the food log used to
 * be.
 */
export async function loadTargets(supabase: SupabaseClient): Promise<DailyTargets> {
  const [reading, profile, sessions] = await Promise.all([
    supabase
      .from("body_composition")
      .select("weight_kg, fat_free_mass_kg")
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("profile").select("key, value"),
    // Sessions in the last 28 days, for the activity factor. `head: true` asks
    // PostgREST for the count without the rows.
    supabase
      .from("workouts")
      .select("id", { count: "exact", head: true })
      .gte("date", new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)),
  ]);

  if (reading.error || !reading.data) return FALLBACK_TARGETS;

  const settings = Object.fromEntries(
    (profile.data ?? []).map((row) => [row.key as string, row.value as string]),
  );

  return computeTargets({
    weightKg: Number(reading.data.weight_kg),
    leanMassKg: reading.data.fat_free_mass_kg ? Number(reading.data.fat_free_mass_kg) : null,
    heightCm: Number(settings.height_cm ?? 195),
    age: Number(settings.age_at_latest_reading ?? 37),
    goalWeightKg: GOAL_WEIGHT_KG,
    // A count of zero is a real answer — it means no training, and the activity
    // factor should reflect that rather than silently assuming a default.
    sessionsLast28: sessions.count ?? 0,
  });
}
