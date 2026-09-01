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

  // Nothing may run between creating the client and getUser(). Supabase is
  // explicit about this: work in between is the documented cause of sessions
  // dropping at random.
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
     * Everything except static assets, images, `/jobs/*`, and the local worker
     * adapter.
     *
     * `/jobs/*` is excluded deliberately, and it was a bug that it wasn't. In
     * production the Next runtime's edge function matches before Netlify routes
     * to the background function, so a request here reached this proxy — which
     * authenticates by *cookie*. The outbox authenticates by Bearer token, so a
     * perfectly valid request was answered with a redirect to /login.
     *
     * Those functions verify the token themselves (lib/auth/verify.ts), which
     * is the right check for a caller that has no cookie jar.
     * `/api/meals/process` is the development-only equivalent and performs the
     * same Bearer-token verification inside its route handler.
     *
     * `/.netlify/` is excluded for the same reason — it is where functions are
     * reachable directly, and a redirect there turns an invocation into a
     * silent no-op.
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
    "/((?!_next/static|_next/image|favicon.ico|jobs/|api/meals/process|auth/|\\.netlify/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
