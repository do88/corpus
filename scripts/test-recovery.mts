/**
 * Exercise the recovery path end to end.
 *
 *     pnpm test:recovery
 *
 * Inserts a meal that looks stuck — pending, one attempt already spent — runs
 * the same `processMeal` the reconciler uses, checks macros came back, then
 * deletes the row.
 *
 * Points at the **local** database on purpose, and refuses to run against
 * anything else. Writing invented meals into the real log would put food that
 * was never eaten into a record whose whole value is being true. The test date
 * is 2020-01-01 so even a mistake is obvious and isolated.
 *
 * Costs one real Claude call (~$0.013), so it is a manual check rather than
 * part of any watch loop.
 */
import { processMeal } from "@/lib/meals/process";
import { createWorkerClient } from "@/lib/supabase/worker";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (!/^http:\/\/(127\.0\.0\.1|localhost):54321/.test(url)) {
  console.error(
    `Refusing to run against ${url || "(unset)"}.\n` +
      "This writes a synthetic meal, so it only ever runs against local Supabase.\n" +
      "Use: pnpm test:recovery",
  );
  process.exit(1);
}

// Built only after the guard above has confirmed the URL is the local stack.
const supabase = createWorkerClient();

const TEST_DATE = "2020-01-01";

const { data: stuck, error } = await supabase
  .from("meal_log")
  .insert({
    logged_at: new Date().toISOString(),
    local_date: TEST_DATE,
    status: "pending",
    attempts: 1, // as though one attempt has already failed
    note: "TEST ROW - two weetabix with semi-skimmed milk",
  })
  .select()
  .single();

if (error) {
  console.error("insert failed:", error.message);
  process.exit(1);
}
console.log(`stuck row     status=${stuck.status} attempts=${stuck.attempts}`);

const result = await processMeal(supabase, stuck.id);
console.log("processMeal  ", result);

const { data: after } = await supabase
  .from("meal_log")
  .select("*")
  .eq("id", stuck.id)
  .single();

console.log(
  `after         status=${after.status} attempts=${after.attempts} ` +
    `kcal=${after.kcal} protein=${after.protein_g}g confidence=${after.confidence}`,
);

await supabase.from("meal_log").delete().eq("id", stuck.id);
const { count } = await supabase
  .from("meal_log")
  .select("*", { count: "exact", head: true })
  .eq("local_date", TEST_DATE);
console.log(`cleaned up    rows left on ${TEST_DATE}: ${count}`);

const passed = after.status === "analyzed" && after.kcal > 0 && after.attempts === 2;
console.log(passed ? "\nrecovery works" : "\nrecovery FAILED");
process.exit(passed ? 0 : 1);
