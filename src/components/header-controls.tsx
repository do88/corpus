import Image from "next/image";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { createClient } from "@/lib/supabase/server";
import { isOwner } from "@/lib/auth/owner";
import type { User } from "@supabase/supabase-js";
import { avatarUrl, readProfile } from "@/lib/auth/profile";
import { calculateStreaks, loadStreakMeals } from "@/lib/meals/streaks";
import { loadTargets } from "@/lib/meals/load-targets";
import { localDay } from "@/lib/time";
import { TrackingStreaks, type StreakDisplay } from "@/components/tracking-streaks";

/**
 * The controls that belong to the app rather than to a screen.
 *
 * They used to live inside each page's header, which meant they were part of
 * whatever the page was doing — including not existing yet. Every navigation
 * shows a skeleton first, and the skeleton has no theme toggle, so the
 * controls blinked out and back on every tab change.
 *
 * In the layout they simply persist: App Router keeps a layout mounted across
 * navigations between the routes that share it, so these are rendered once and
 * left alone while the content underneath is replaced.
 *
 * Positioned absolutely rather than fixed, so they scroll away with the top of
 * the page exactly as they did when they were part of the header. Fixed would
 * have been a behaviour change dressed up as a bug fix — a cluster hovering
 * over the meal list on the way down.
 */
export async function HeaderControls() {
  // Nothing to show, and nothing to ask the database, when nobody is signed
  // in. This renders from the root layout, which covers the sign-in screen
  // too — and that screen is deliberately one mark and one button.
  const supabase = await createClient();
  // Verified locally from the token's signature rather than by asking the
  // Auth server — see the note in proxy.ts. This renders on every page, and
  // the proxy has already done the network-free check once.
  const { data } = await supabase.auth.getClaims();
  if (!isOwner(data?.claims.email)) return null;

  // The claims carry the same metadata `getUser()` would: enough for a name
  // and a picture without another round trip.
  const profile = readProfile({
    email: data?.claims.email,
    user_metadata: data?.claims.user_metadata ?? {},
  } as User);
  const today = localDay();
  const [streak, avatar] = await Promise.all([
    Promise.all([loadStreakMeals(supabase, today), loadTargets(supabase)])
      .then(([meals, targets]): StreakDisplay => ({
        ...calculateStreaks(meals, today, targets), kcal: targets.kcal, protein: targets.protein_g,
      })).catch(() => null),
    avatarUrl(supabase, profile),
  ]);

  return (
    <div aria-hidden={false} className="pointer-events-none absolute inset-x-0 top-0 z-40">
      {/* The same column the pages use, so this lands exactly where the old
          in-header version did rather than approximately. */}
      <div className="mx-auto flex w-full max-w-md justify-end px-5 pt-6 lg:max-w-4xl lg:pl-28 lg:pt-10">
        <div className="pointer-events-auto flex items-center gap-2">
          <TrackingStreaks initial={streak} />
          <ThemeToggle />
          {/*
            Account, as your face. It was the sixth tab, and it is not a daily
            destination — a display name and a sign-out do not belong beside
            Today and the Advisor in the one bar every screen shares. Up here
            it sits with the other app-level control and costs the bar
            nothing, which at 320px was exactly what the bar could not spare.
          */}
          <Link
            href="/account"
            aria-label="Account"
            className="surface tappable grid size-9 shrink-0 place-items-center overflow-hidden"
            style={{ borderRadius: 999 }}
          >
            {avatar ? (
              <Image src={avatar} alt="" width={36} height={36} unoptimized className="size-9 object-cover" />
            ) : (
              <span className="text-sm font-semibold">{profile.name.slice(0, 1).toUpperCase()}</span>
            )}
          </Link>
        </div>
      </div>
    </div>
  );
}

