import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isOwner } from "@/lib/auth/owner";

/**
 * Where Google sends the browser back to. Trades the one-time code for a
 * session cookie, then forwards to wherever the user was originally going.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // Behind Netlify the request's own origin is the internal one, so the
  // redirect has to be built from the deployment's public URL or it lands
  // somewhere the browser can't reach.
  //
  // Netlify's own `URL` env var, not the request's `x-forwarded-host`. That
  // header is set by the proxy in front of us but originates with the client,
  // and using it unchecked makes every redirect out of this handler point
  // wherever a request says to — the same post-sign-in phishing shape the
  // `next` parameter had. `URL` is set by the platform at build and run time
  // and no request can influence it.
  //
  // Falls back to the request origin when unset, which covers `next dev` and
  // `netlify dev --offline`.
  const configured = process.env.URL;
  const base = configured && process.env.NODE_ENV !== "development" ? configured : origin;

  const fail = (reason: string) =>
    NextResponse.redirect(`${base}/login?error=${encodeURIComponent(reason)}`);

  if (!code) return fail("No code returned from Google");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail(error.message);

  // A valid Google account is not the same as *the* account. RLS would already
  // hand a stranger an empty app; this turns them away with a reason instead.
  if (!isOwner(data.user?.email)) {
    await supabase.auth.signOut();
    return fail("That account doesn't have access");
  }

  // Always to the root. Where the user was originally heading is in
  // sessionStorage, and the page there restores it — it never had to make the
  // round trip through Google, and sending it there is what broke the
  // allow-list match in the first place.
  return NextResponse.redirect(`${base}/`);
}
