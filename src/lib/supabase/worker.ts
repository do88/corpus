import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The secret-key client. **Bypasses RLS entirely.**
 *
 * For the callers that have no user session to act on behalf of: the estimate
 * that runs after the process route has answered, the reconcile cron, and the
 * maintenance scripts. Everything with a signed-in user goes through
 * supabase/server.ts or supabase/client.ts instead — a convenience import of
 * this module in a request path would quietly disable every policy on the
 * table.
 *
 * Deliberately free of `server-only` and of any Next import, for the same
 * reason lib/meal/estimate.ts is: the maintenance scripts share it and they
 * run outside Next entirely, where the marker package throws on import. The guard
 * against this reaching a browser bundle is therefore the environment variable
 * itself — `SUPABASE_SECRET_KEY` has no `NEXT_PUBLIC_` prefix, so Next will not
 * inline it, and a client component importing this would get `undefined` and
 * fail loudly rather than leak anything.
 *
 * Session persistence and token refresh are both off: there is no session to
 * persist, and a refresh timer would keep a serverless invocation alive.
 */
export function createWorkerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  // Named explicitly rather than left to a `!` assertion. A missing key here
  // surfaces as an opaque "Invalid API key" from PostgREST several calls later,
  // which is a long way from the actual mistake.
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set");

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
