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
    // Only ever a path on this site. A stored value beginning with `//` would
    // be read as a protocol-relative URL and send the browser off-site.
    if (next.startsWith("/") && !next.startsWith("//") && next !== "/") {
      router.replace(next);
    }
  }, [router]);

  return null;
}
