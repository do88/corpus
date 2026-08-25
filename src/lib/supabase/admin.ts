import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * The secret-key client. **Bypasses RLS entirely.**
 *
 * Exists for the one caller that has no user session to act on behalf of: the
 * background worker, which is invoked by Netlify rather than by a browser and
 * still has to write the finished estimate back to `meal_log`.
 *
 * Everything with a signed-in user goes through supabase/server.ts instead. A
 * convenience import of this module in a request path would quietly disable
 * every policy on the table.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
