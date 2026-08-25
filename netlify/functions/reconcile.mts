import type { Config } from "@netlify/functions";
import { processMeal } from "../../src/lib/meals/process";
import { MAX_ATTEMPTS, type MealRow } from "../../src/lib/meals/repository";
import { createWorkerClient } from "../../src/lib/supabase/worker";

/**
 * Sweeps up meals whose estimate never landed.
 *
 * **This is the primary recovery path, not a backstop.** Netlify's documented
 * background-function retries at 1 and 2 minutes were measured on the deployed
 * site and never fired — a deliberately failing job sat at `attempts=1` past
 * 220 seconds. So nothing retries anything unless this does.
 *
 * It is also the only thing that can recover a meal whose worker was never
 * invoked at all: the phone lost signal between writing the row and firing the
 * request, or a deploy was mid-flight. No queue can retry a job it never saw;
 * a sweep of the table finds it because the row is the job.
 *
 * Runs the estimate inline rather than re-invoking the worker, which would
 * need a credential this has no way to hold. That caps throughput, which is why
 * the budget below exists and why it says out loud what it left behind.
 */

/** Scheduled functions get 30 s, hard. This leaves room to finish tidily. */
const BUDGET_MS = 22_000;

/** Below this age a row is probably still being worked on by the worker. */
const STALE_AFTER_MINUTES = 5;

export default async () => {
  const startedAt = Date.now();
  const supabase = createWorkerClient();

  const staleBefore = new Date(Date.now() - STALE_AFTER_MINUTES * 60_000).toISOString();

  const { data, error } = await supabase
    .from("meal_log")
    .select("*")
    .eq("status", "pending")
    .lt("attempts", MAX_ATTEMPTS)
    .lt("updated_at", staleBefore)
    .order("logged_at", { ascending: true })
    .limit(20);

  if (error) {
    console.error("reconcile: could not list pending meals", error.message);
    return new Response(error.message, { status: 500 });
  }

  const stuck = (data ?? []) as MealRow[];
  if (stuck.length === 0) return Response.json({ stuck: 0, processed: 0, deferred: 0 });

  let processed = 0;
  let recovered = 0;
  for (const meal of stuck) {
    // Checked before starting, not after: an estimate takes about five seconds
    // and being killed mid-call would leave the attempt counted with nothing
    // written.
    if (Date.now() - startedAt > BUDGET_MS) break;
    const result = await processMeal(supabase, meal.id);
    processed += 1;
    if (result.ok) recovered += 1;
  }

  const deferred = stuck.length - processed;
  // Said out loud rather than swallowed: a sweep that quietly truncates reads
  // as "everything is fine" when it is not. The next run picks these up.
  if (deferred > 0) console.warn(`reconcile: ${deferred} meal(s) left for the next run`);
  console.log(`reconcile: ${stuck.length} stuck, ${processed} tried, ${recovered} recovered`);

  return Response.json({ stuck: stuck.length, processed, recovered, deferred });
};

export const config: Config = {
  // Hourly is the floor: Netlify's scheduler does not support sub-hourly cron,
  // and an invalid expression does not fail loudly — `*/10 * * * *` was
  // accepted at deploy and simply never fired, so the safety net was never
  // actually armed. The gap that leaves is covered by the client, which retries
  // a stale pending meal whenever the app is opened.
  schedule: "@hourly",
};
