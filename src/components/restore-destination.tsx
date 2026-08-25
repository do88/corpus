"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { RETURN_TO } from "@/lib/auth/return-to";

/**
 * Sends you where you were originally going, after signing in.
 *
 * The callback always lands on Today, because the destination cannot ride along
 * on the OAuth redirect — Supabase's allow-list does not match query strings,
 * and putting one there is what silently broke sign-in. So the destination
 * waits in the tab's own storage and is picked up here instead.
 *
 * Renders nothing, and does nothing at all in the ordinary case where you
 * opened the app rather than being bounced to a login.
 */
export function RestoreDestination() {
  const router = useRouter();

  useEffect(() => {
    const next = sessionStorage.getItem(RETURN_TO);
    if (!next) return;
    sessionStorage.removeItem(RETURN_TO);

    // Resolved against this origin and compared, rather than pattern-matched.
    //
    // The previous check — starts with "/", does not start with "//" — looked
    // sufficient and was not. The URL parser treats a backslash as a slash for
    // special schemes and strips tabs before parsing, so both "/\evil.com" and
    // "/<tab>/evil.com" passed it and resolved to another origin. This value
    // arrives from `?next=` on /login, so it is fully attacker-chosen: the
    // payload is a link that sends the owner through a genuine Google sign-in
    // on the real domain and lands them somewhere else, which is the most
    // convincing shape a phish can take.
    //
    // Letting the parser decide, then requiring the origin to match, is not
    // guessing at the syntax the browser will apply — it is asking it.
    let destination: URL;
    try {
      destination = new URL(next, window.location.origin);
    } catch {
      return;
    }
    if (destination.origin !== window.location.origin) return;
    // Root with no query is where the callback already lands, so there is
    // nothing to restore. Root *with* a query is a specific day, which is.
    if (destination.pathname === "/" && !destination.search) return;

    // Rebuilt from the parsed parts, so nothing but a path and query survives.
    router.replace(`${destination.pathname}${destination.search}`);
  }, [router]);

  return null;
}
