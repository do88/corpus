import type { Config } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { verifyOwner } from "../../src/lib/auth/verify";
import { processMeal, workerEnv } from "../../src/lib/meals/process";

/**
 * Turns a pending `meal_log` row into macros, immediately after it is logged.
 *
 * A background function rather than a route handler for one reason: it returns
 * 202 the instant it is invoked, so the phone can be locked and in a pocket
 * while Claude is still thinking. The row is the job record; Realtime is how
 * the answer reaches the screen. 15 minutes of headroom against a call that
 * takes five seconds.
 */
export default async (req: Request) => {
  // The proxy deliberately excludes /jobs/*, because it authenticates by
  // cookie and this endpoint is called with a Bearer token. So this is the
  // only check standing between the outside world and Anthropic credits.
  const auth = await verifyOwner(req.headers.get("authorization"));
  if (!auth.ok) {
    // Logged, not just returned. A background function's response goes nowhere
    // — the caller got its 202 long ago — so an unlogged refusal is invisible,
    // and the only symptom is a meal that says "analysing" forever.
    console.error(`estimate-background refused: ${auth.reason} (${auth.status})`);
    return new Response(auth.reason, { status: auth.status });
  }

  const { mealId } = await req.json();
  if (!mealId) return new Response("No mealId", { status: 400 });

  const { url, key } = workerEnv();
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const result = await processMeal(supabase, mealId);

  // Nothing reads this — a background function returned 202 long ago — but it
  // is what appears in the Netlify logs, and the row already carries the error
  // for the UI.
  return result.ok
    ? new Response("ok")
    : new Response(result.reason, { status: 500 });
};

export const config: Config = {
  background: true,
  path: "/jobs/estimate",
};
