/**
 * Run the reconciler by hand, against production.
 *
 *     pnpm reconcile:now
 *
 * Netlify refuses HTTP invocation of a scheduled function, and its scheduler
 * only supports hourly at the fastest — so when a meal is stuck *now*, this is
 * the lever. Same `processMeal` the worker and the sweep use, so it cannot
 * drift from them.
 */
import { createClient } from "@supabase/supabase-js";
import { processMeal } from "@/lib/meals/process";
import type { MealRow } from "@/lib/meals/repository";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false } },
);

const { data, error } = await supabase
  .from("meal_log")
  .select("*")
  .eq("status", "pending")
  .lt("attempts", 3)
  .order("logged_at", { ascending: true });

if (error) {
  console.error("could not list pending meals:", error.message);
  process.exit(1);
}

const stuck = (data ?? []) as MealRow[];
console.log(`${stuck.length} pending meal(s)\n`);

for (const meal of stuck) {
  const label = (meal.note ?? meal.photo_path ?? meal.id).slice(0, 45);
  const result = await processMeal(supabase, meal.id);
  console.log(`  ${result.ok ? "done" : "FAIL"}  ${label}${result.ok ? "" : ` — ${result.reason}`}`);
}

process.exit(0);
