import "server-only";
import type { NextRequest } from "next/server";
import { processMeal } from "@/lib/meals/process";
import { MAX_ATTEMPTS, type MealRow } from "@/lib/meals/repository";
import { createWorkerClient } from "@/lib/supabase/worker";

/**
 * Sweep meals whose estimate never finished.
 *
 * A meal reaches the database first and is estimated second, so a phone that
 * goes offline between the two, or a Gemini call that fails, leaves a row
 * `pending`. The app retries those itself every time it is opened; this cron
 * is the net under that, for a day the app was never opened.
 *
 * Scheduled in vercel.json. Hobby runs a cron once a day and the start can
 * drift within the hour, which is fine for a safety net. Vercel presents the
 * project's CRON_SECRET as a Bearer token on every run, and nothing else
 * knows it, so that header is the whole authentication.
 */

export const maxDuration = 300;

/** Well under maxDuration, so a long backlog defers rather than times out mid-meal. */
const BUDGET_MS = 240_000;
/** A meal younger than this is probably still being estimated by the request that logged it. */
const STALE_AFTER_MINUTES = 5;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

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
  if (stuck.length === 0) return Response.json({ stuck: 0, processed: 0, recovered: 0, deferred: 0 });

  let processed = 0;
  let recovered = 0;
  for (const meal of stuck) {
    if (Date.now() - startedAt > BUDGET_MS) break;
    const result = await processMeal(supabase, meal.id);
    processed += 1;
    if (result.ok) recovered += 1;
  }

  const deferred = stuck.length - processed;
  if (deferred > 0) console.warn(`reconcile: ${deferred} meal(s) left for the next run`);
  console.log(`reconcile: ${stuck.length} stuck, ${processed} tried, ${recovered} recovered`);
  return Response.json({ stuck: stuck.length, processed, recovered, deferred });
}
