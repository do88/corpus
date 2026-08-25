"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Camera, LogOut } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { avatarObjectPath, type Profile } from "@/lib/auth/profile";
import { compressForEstimate } from "@/lib/meal/compress";
import { createClient } from "@/lib/supabase/client";

/**
 * Name, picture, and the way out.
 *
 * Both fields are written to the auth user's own metadata rather than a
 * profiles table — see `lib/auth/profile.ts` for why. The picture goes to the
 * private `avatars` bucket and the *path* is what is stored, so the metadata
 * never holds a URL that expires.
 */
export function AccountForm({
  profile,
  avatarSrc,
  userId,
}: {
  profile: Profile;
  /** A signed URL or a Google picture URL, resolved server-side. */
  avatarSrc: string | null;
  userId: string;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(profile.name);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "name" | "avatar" | "signout">(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const shown = preview ?? avatarSrc;
  const initials = profile.name.slice(0, 1).toUpperCase();
  const dirty = name.trim() !== profile.name && name.trim().length > 0;

  async function saveName() {
    setBusy("name");
    setError(null);
    setSaved(false);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ data: { name: name.trim() } });
      if (error) throw new Error(error.message);
      setSaved(true);
      // The header renders the name server-side, so the page has to re-fetch
      // for the change to appear anywhere but this field.
      router.refresh();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "Could not save your name");
    } finally {
      setBusy(null);
    }
  }

  async function onPickAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy("avatar");
    setError(null);
    setSaved(false);

    try {
      // The same resize the meal photos get. An avatar rendered at 72px has no
      // business being a 4000px original, and the bucket has a 2 MB ceiling.
      const small = await compressForEstimate(file);
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(small);
      });

      const supabase = createClient();
      const path = avatarObjectPath(userId);

      // `upsert` because every avatar after the first is a replacement — which
      // is why this bucket's migration states an UPDATE policy alongside the
      // other three rather than discovering the omission later.
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, small, { contentType: "image/jpeg", upsert: true });
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      // The path, never a URL: signed URLs expire, and a stale one stored here
      // would render a broken image an hour later.
      const { error: metaError } = await supabase.auth.updateUser({
        data: { avatar_path: path },
      });
      if (metaError) throw new Error(metaError.message);

      setSaved(true);
      router.refresh();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "Could not save your picture");
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return null;
      });
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function signOut() {
    setBusy("signout");
    setError(null);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      /**
       * A full document load, not `router.push`, and the lint rule below is
       * disabled deliberately rather than worked around.
       *
       * A client navigation would leave the tab exactly as it is and swap the
       * markup: the Realtime channel on `meal_log` stays subscribed, the
       * outbox's in-memory snapshot stays populated, and the cached RSC
       * payloads for Today and Training stay in memory — all of it the
       * previous session's data, still there after signing out. A reload
       * discards the entire JS context, which is the only version of "sign
       * out" that is actually true.
       */
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/login");
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "Could not sign out");
      setBusy(null);
    }
  }

  return (
    <div className="mt-5 space-y-3">
      <div className="surface p-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy !== null}
            className="tappable relative shrink-0 rounded-full"
            aria-label="Change your picture"
          >
            {shown ? (
              <Image
                src={shown}
                alt=""
                width={72}
                height={72}
                unoptimized
                className="size-18 rounded-full object-cover"
                style={{ boxShadow: "var(--shadow-card)" }}
              />
            ) : (
              <span
                aria-hidden
                className="grid size-18 place-items-center rounded-full text-2xl font-semibold text-white"
                style={{
                  background:
                    "linear-gradient(to bottom, var(--accent-protein), var(--ink-protein))",
                  boxShadow: "var(--shadow-card)",
                }}
              >
                {initials}
              </span>
            )}
            <span
              aria-hidden
              className="absolute -bottom-0.5 -right-0.5 grid size-7 place-items-center rounded-full border-2 border-[var(--card)]"
              style={{ background: "var(--ink-protein)" }}
            >
              <Camera className="size-3.5 text-white" />
            </span>
          </button>

          <div className="min-w-0">
            <div className="text-[1.0625rem] font-semibold tracking-[-0.01em]">
              {profile.name}
            </div>
            <div className="truncate text-sm text-muted-foreground">{profile.email}</div>
          </div>
        </div>

        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          onChange={onPickAvatar}
          className="sr-only"
        />
      </div>

      <div className="surface space-y-3 p-4">
        <div className="space-y-1.5">
          <Label htmlFor="display-name" className="text-xs text-muted-foreground">
            Display name
          </Label>
          <Input
            id="display-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
            placeholder="Your name"
            maxLength={60}
            className="rounded-xl"
          />
        </div>
        <Button
          onClick={saveName}
          disabled={!dirty || busy !== null}
          className="tappable w-full rounded-xl"
        >
          {busy === "name" ? "Saving…" : "Save"}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {saved && !error && (
        <p className="px-1 text-sm text-muted-foreground">Saved.</p>
      )}

      <Button
        variant="ghost"
        onClick={signOut}
        disabled={busy !== null}
        className="tappable w-full justify-start gap-2 rounded-xl text-destructive hover:text-destructive"
      >
        <LogOut className="size-4" aria-hidden />
        {busy === "signout" ? "Signing out…" : "Sign out"}
      </Button>
    </div>
  );
}
