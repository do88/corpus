"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // No query string here, deliberately. Supabase matches this against its
        // redirect allow-list, and the `**` wildcard does not match a query
        // string — a `?next=` on the end silently fails the match, and Supabase
        // falls back to the Site URL. The auth code then lands on `/` where
        // nothing is waiting to exchange it.
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
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 py-10">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <CardTitle className="text-2xl tracking-[-0.02em]">do.fit</CardTitle>
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ background: "var(--accent-protein)" }}
            />
          </div>
          <CardDescription>Photo, a sentence, macros.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <Button onClick={signIn} disabled={busy} className="w-full">
            {busy ? "Redirecting…" : DEV_AUTH_ENABLED ? "Signing in locally…" : "Continue with Google"}
          </Button>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <p className="text-sm text-muted-foreground">
            One account has access. Everything logged here stays in your own database.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
