"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Logomark } from "@/components/brand";
import { createClient } from "@/lib/supabase/client";
import { RETURN_TO } from "@/lib/auth/return-to";
import { DEV_AUTH_ENABLED, DEV_EMAIL, DEV_PASSWORD } from "@/lib/auth/dev";

export default function Login() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    const next = new URLSearchParams(location.search).get("next");
    if (next) sessionStorage.setItem(RETURN_TO, next);
    const supabase = createClient();
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          // No query string here, deliberately. Supabase matches this against
          // its redirect allow-list, and the `**` wildcard does not match a
          // query string — a `?next=` on the end silently fails the match, and
          // Supabase falls back to the Site URL. The auth code then lands on
          // `/` where nothing is waiting to exchange it.
          //
          // Where to go afterwards is remembered above instead, which never
          // travels through Google in the first place.
          redirectTo: `${location.origin}/auth/callback`,
        },
      });
      if (error) {
        setError(error.message);
        setBusy(false);
      }
    } catch (thrown) {
      // Only the *returned* error was handled before. A throw — a blocked
      // cookie write, storage unavailable in a locked-down browser — left the
      // promise rejected, `busy` stuck true and the button dead with nothing
      // on screen to say why. Silence is the worst outcome on a sign-in screen.
      setError(thrown instanceof Error ? thrown.message : "Could not start sign-in");
      setBusy(false);
    }
  }

  /**
   * Under `pnpm dev:local`, sign in without showing this screen at all.
   *
   * A real `signInWithPassword` against the local stack, not a bypass — so the
   * session, the JWT claims RLS reads, the access token the outbox sends the
   * worker, Storage and Realtime all behave exactly as in production. Waving
   * the proxy through instead would render an app where every query returns
   * nothing, because RLS is the actual boundary and it matches on the email in
   * the token.
   *
   * `DEV_AUTH_ENABLED` is `false` in any production build, so the bundler drops
   * this whole branch — the credential below never reaches a deployed bundle.
   */
  useEffect(() => {
    if (!DEV_AUTH_ENABLED) return;
    let cancelled = false;

    (async () => {
      const supabase = createClient();
      // Already signed in — nothing to do, and re-authenticating would discard
      // a perfectly good session on every visit.
      const { data } = await supabase.auth.getSession();
      if (cancelled || data.session) return;

      const { error } = await supabase.auth.signInWithPassword({
        email: DEV_EMAIL,
        password: DEV_PASSWORD,
      });
      if (cancelled) return;
      if (error) {
        setError(`Local sign-in failed: ${error.message}`);
        return;
      }
      // A full load rather than a router push: the session lives in cookies the
      // server has to read, and a client navigation would render before the
      // proxy has seen them.
      window.location.replace(new URLSearchParams(location.search).get("next") ?? "/");
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    /*
      The one screen that gets to be loud.
      
      Everywhere else the ground is deliberately quiet — the app is read at a
      glance, many times a day, and a background competing with the figures
      would be a background winning an argument it should not be in. This
      screen has no figures. It is seen once, and its whole job is to look
      like something worth signing in to, so the accent hues that appear as
      thin rings elsewhere get to be the entire surface here.
    */
    <main className="relative flex min-h-full w-full flex-1 flex-col items-center justify-center overflow-hidden px-6">
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: SPLASH }} />
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ opacity: 0.05, backgroundImage: GRAIN, backgroundSize: "200px 200px" }} />

      <div className="relative flex w-full max-w-sm flex-col items-center">
        <Logomark size={148} accent="var(--accent-protein)" />

        <h1 className="mt-8 text-[3.5rem] font-bold leading-none tracking-[-0.045em]">
          do<span style={{ color: "var(--accent-protein)" }}>.</span>fit
        </h1>

        <Button
          onClick={signIn}
          disabled={busy}
          className="mt-12 w-full rounded-full"
        >
          {busy ? "Redirecting…" : DEV_AUTH_ENABLED ? "Signing in locally…" : "Continue with Google"}
        </Button>

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    </main>
  );
}

/**
 * The gradient behind it.
 *
 * Three washes rather than one: a single linear ramp reads as a template, and
 * banding shows badly across a whole viewport. Overlapping radials in the
 * app's own four hues bloom into each other instead, and the grain over the
 * top hides what is left of the banding — the same trick the app's ground
 * uses, turned up because nothing here has to stay readable through it.
 */
const SPLASH = [
  "radial-gradient(120% 90% at 15% 0%, color-mix(in oklch, var(--accent-protein) 58%, transparent), transparent 62%)",
  "radial-gradient(110% 85% at 95% 15%, color-mix(in oklch, var(--accent-weight) 52%, transparent), transparent 60%)",
  "radial-gradient(130% 95% at 50% 105%, color-mix(in oklch, var(--accent-energy) 44%, transparent), transparent 65%)",
  "radial-gradient(90% 70% at 80% 90%, color-mix(in oklch, var(--accent-water) 40%, transparent), transparent 62%)",
].join(", ");

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E\")";
