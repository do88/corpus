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
  const isPublic =
    path.startsWith("/login") ||
    path.startsWith("/auth") ||
    path.startsWith("/icons/") ||
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
     * Everything except static assets, images, and `/jobs/*`.
     *
     * `/jobs/*` is excluded deliberately, and it was a bug that it wasn't. In
     * production the Next runtime's edge function matches before Netlify routes
     * to the background function, so a request here reached this proxy — which
     * authenticates by *cookie*. The outbox authenticates by Bearer token, so a
     * perfectly valid request was answered with a redirect to /login.
     *
     * Those functions verify the token themselves (lib/auth/verify.ts), which
     * is the right check for a caller that has no cookie jar.
     *
     * `/.netlify/` is excluded for the same reason — it is where functions are
     * reachable directly, and a redirect there turns an invocation into a
     * silent no-op.
     */
    "/((?!_next/static|_next/image|favicon.ico|jobs/|\\.netlify/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
