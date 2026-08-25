import { createClient } from "@supabase/supabase-js";
import { isOwner } from "./owner";

/**
 * Verify a Supabase access token from an Authorization header.
 *
 * Deliberately free of `server-only` and of any Next import: the Netlify
 * functions share this, and they run outside Next entirely.
 *
 * The proxy excludes `/jobs/*` on purpose — it authenticates by cookie, and
 * these endpoints are called with a Bearer token — so this is the only thing
 * standing between those functions and the open internet.
 *
 * The token is checked against Supabase rather than decoded locally. A JWT read
 * without verifying its signature is just a string the caller chose.
 */
export async function verifyOwner(
  authorization: string | null,
): Promise<{ ok: true; email: string } | { ok: false; status: number; reason: string }> {
  const token = authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, status: 401, reason: "No access token" };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return { ok: false, status: 401, reason: "Invalid access token" };
  if (!isOwner(data.user.email)) return { ok: false, status: 403, reason: "Not the owner" };

  return { ok: true, email: data.user.email! };
}
