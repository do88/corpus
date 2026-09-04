/**
 * Run the reconciler by hand, against production.
 *
 *     pnpm reconcile:now
 *
 * The hosted cron (app/api/cron/reconcile) runs once a day on Vercel's Hobby
 * plan, and the app retries stuck meals when it is opened — so when a meal is
 * stuck *now* and neither has happened, this is the lever. Same `processMeal`
 * the estimate route and the cron use, so it cannot drift from them.
 */
import { processMeal } from "@/lib/meals/process";
import { MAX_ATTEMPTS, type MealRow } from "@/lib/meals/repository";
import { createWorkerClient } from "@/lib/supabase/worker";

const supabase = createWorkerClient();

const { data, error } = await supabase
  .from("meal_log")
  .select("*")
  .eq("status", "pending")
  .lt("attempts", MAX_ATTEMPTS)
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
