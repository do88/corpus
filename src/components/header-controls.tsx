import { Flame } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { createClient } from "@/lib/supabase/server";
import { isOwner } from "@/lib/auth/owner";
import type { SupabaseClient } from "@supabase/supabase-js";
import { kcalByDay, listMealsInRange } from "@/lib/meals/repository";
import { localDay, parseDay, toDay } from "@/lib/time";
import { subDays } from "date-fns";

/**
 * The two controls that belong to the app rather than to a screen.
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isOwner(user?.email)) return null;

  const streak = await currentStreak(supabase);

  return (
    <div aria-hidden={false} className="pointer-events-none absolute inset-x-0 top-0 z-40">
      {/* The same column the pages use, so this lands exactly where the old
          in-header version did rather than approximately. */}
      <div className="mx-auto flex w-full max-w-md justify-end px-5 pt-6 lg:max-w-4xl lg:pl-28 lg:pt-10">
        <div className="pointer-events-auto flex items-center gap-2">
          {streak > 0 && (
            <div
              className="surface flex h-9 shrink-0 items-center gap-1 px-3"
              style={{ borderRadius: 999 }}
              aria-label={`${streak} day streak`}
            >
              <Flame className="size-4" style={{ color: "var(--ink-energy)" }} aria-hidden />
              <span className="text-sm font-semibold tabular-nums">{streak}</span>
            </div>
          )}
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}

/**
 * Consecutive days ending today with something analysed on them.
 *
 * Counted back from today rather than forward from the first entry, so a gap
 * ends the streak — which is the only reading of the word that means anything.
 * Today not being logged *yet* does not break it: a streak that resets every
 * morning until breakfast would be a nag, not a record. So a missing today is
 * skipped once, and the count runs from yesterday.
 *
 * Its own small query rather than borrowing Today's. Today reads a week for
 * the strip; this needs ten days and runs on every screen, and tying a header
 * to another page's fetch is how a header ends up only correct on one page.
 */
async function currentStreak(supabase: SupabaseClient): Promise<number> {
  const today = localDay();
  const from = toDay(subDays(parseDay(today), 10));

  const logged = kcalByDay(await listMealsInRange(supabase, from, today));

  let count = 0;
  for (let offset = logged[today] ? 0 : 1; offset <= 10; offset += 1) {
    if (!logged[toDay(subDays(parseDay(today), offset))]) break;
    count += 1;
  }
  return count;
}

