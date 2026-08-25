"use client";

import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { RETURN_TO } from "@/lib/auth/return-to";

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

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 py-10">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <CardTitle className="text-xl">Corpus</CardTitle>
            <span aria-hidden className="flex items-center gap-[3px]">
              <span className="size-1.5 rounded-full bg-mark-red" />
              <span className="size-0 border-x-[3px] border-b-[5px] border-x-transparent border-b-mark-yellow" />
              <span className="size-1.5 bg-mark-blue" />
            </span>
          </div>
          <CardDescription>Photo, a sentence, macros.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <Button onClick={signIn} disabled={busy} className="w-full">
            {busy ? "Redirecting…" : "Continue with Google"}
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
