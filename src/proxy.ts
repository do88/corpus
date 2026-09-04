import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isOwner } from "@/lib/auth/owner";

/**
 * Refreshes the Supabase session on every request and keeps everyone but the
 * owner out.
 *
 * Called Proxy, not Middleware: Next.js 16 renamed it, and the file must be
 * `src/proxy.ts` beside `app/`.
 *
 * This is a gate, not the security boundary. RLS is the boundary — it holds
 * even if this file is wrong. What this adds is a session that stays fresh and
 * a stranger who gets told they lack access rather than being shown an app
 * where nothing loads.
 */
export async function proxy(request: NextRequest) {
  // An OAuth code that lands anywhere but the callback is sent there rather
  // than bounced to /login. This happened for real: a redirect Supabase would
  // not match against its allow-list was delivered to the Site URL instead, and
  // the code arrived at `/` with nothing waiting to exchange it. The redirect
  // is fixed, but a one-line rescue beats a sign-in that dead-ends.
  const code = request.nextUrl.searchParams.get("code");
  if (code && !request.nextUrl.pathname.startsWith("/auth/")) {
    const callback = request.nextUrl.clone();
    callback.pathname = "/auth/callback";
    callback.search = `?code=${encodeURIComponent(code)}`;
    return NextResponse.redirect(callback);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  /*
    `getClaims()`, not `getUser()`.

    `getUser()` is a round trip to Supabase Auth, and this runs on every
    request — so it was a network call in front of every page before a byte
    of it could render, with a second one behind it in the header.
    `getClaims()` verifies the access token's signature locally against the
    project's published keys (this project signs with ES256, checked at its
    JWKS endpoint), so the same guarantee costs a WebCrypto call instead of a
    network one. It is Supabase's own guidance for exactly this position, and
    were the project ever moved to symmetric keys it would fall back to
    `getUser()` by itself rather than trust an unverified token.

    Nothing may run between creating the client and this call. Supabase is
    explicit about it: work in between is the documented cause of sessions
    dropping at random.
  */
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims ?? null;

  const path = request.nextUrl.pathname;

  // The manifest, the icons and the service worker have to be fetchable while
  // signed out, or the app cannot be installed to the home screen — the browser
  // requests them without credentials, and a redirect to /login reads as a
  // broken manifest. None of them expose anything: they are three coloured
  // shapes and a caching policy.
  //
  // `/offline` joins them for the same reason. It is the page the service
  // worker shows when a navigation cannot reach the network, so gating it on a
  // session is a contradiction: the check needs the network the page exists to
  // apologise for. It is also precached at install, and precaching a redirect
  // to /login would mean the fallback served the sign-in screen to someone
  // already signed in. It says there is no connection and nothing else.
  const isPublic =
    path.startsWith("/login") ||
    path.startsWith("/auth") ||
    path.startsWith("/icons/") ||
    path === "/offline" ||
    path === "/manifest.webmanifest" ||
    path === "/sw.js";

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (user && !isOwner(user.email) && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("error", "That account doesn't have access");
    return NextResponse.redirect(url);
  }

  // Returned as-is. Building a fresh response here without copying these
  // cookies across is what puts the browser and server out of step.
  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets, images, and the two routes that are
     * called without a cookie jar.
     *
     * This proxy authenticates by *cookie*. `/api/meals/process` is called by
     * the outbox with a Bearer token, and `/api/cron/` by Vercel's scheduler
     * with the cron secret; running here would answer both perfectly valid
     * requests with a redirect to /login. Each verifies its own caller inside
     * the route handler instead.
     *
     * **`/auth/` is excluded because running here broke Google sign-in.** The
     * OAuth return lands on `/auth/callback?code=…`, and this proxy ran first:
     * it builds a server client and calls `getUser()`, which writes back
     * through `setAll`. That cookie set includes
     * `sb-<ref>-auth-token-code-verifier` — the PKCE verifier the callback is
     * about to need — and with no session to validate, the refresh clears it.
     * The handler then called `exchangeCodeForSession` and got "PKCE code
     * verifier not found in storage", having had it deleted a few milliseconds
     * earlier by its own middleware.
     *
     * There was never anything for the proxy to do here anyway: `/auth` is
     * already public below, so it refreshes a session for a request whose whole
     * purpose is to create one.
     */
    "/((?!_next/static|_next/image|favicon.ico|api/meals/process|api/cron/|auth/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
