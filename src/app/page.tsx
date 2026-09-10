import Link from "next/link";
import { Screen } from "@/components/screen";
import { format } from "date-fns";
import { clampDay, localDay, parseDay } from "@/lib/time";
import { createClient } from "@/lib/supabase/server";
import { earliestLoggedDay, kcalByDay, listMealsInRange, weekOf } from "@/lib/meals/repository";
import { loadTargets } from "@/lib/meals/load-targets";
import { dayEnergy, recentWatchDays } from "@/lib/garmin/repository";
import { AppHeader } from "@/components/app-header";
import { RestoreDestination } from "@/components/restore-destination";
import { Today } from "@/components/today";

/**
 * A single day's log, defaulting to today.
 *
 * The date lives in the URL rather than in component state, so a day is
 * linkable, survives a refresh, and gets back/forward for free — three things
 * that would otherwise need building.
 */

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const supabase = await createClient();
  const today = localDay();

  const { d } = await searchParams;
  const earliest = await earliestLoggedDay(supabase);

  const day = clampDay(d, today, earliest);

  // One query covers the day being shown and the dots on the week strip.
  const week = weekOf(day);
  const [meals, targets, watch] = await Promise.all([
    listMealsInRange(supabase, week[0], week[6]),
    loadTargets(supabase),
    // The ledger and the watch card are both extras. A day with no watch
    // behind it still logs meals, so a failure here must not take the page.
    recentWatchDays(supabase).catch(() => []),
  ]);

  const onScreen = meals.filter((m) => m.local_date === day);

  return (
    // pb-28 clears the fixed tab bar; without it the last meal hides behind it.
    // pb-28 clears the phone tab bar; lg:pl-28 clears the desktop rail, and the
    // column widens to hold four metric cards side by side rather than leaving
    // a 440px strip marooned in the middle of a 1440px window.
    <Screen>
      <AppHeader
        name="Today"
        action={
          /*
            The way back, and only when there is somewhere to come back from.
            A plain word rather than a tinted pill with an icon: it sits beside
            the streak chip and the theme control, and a third shape competing
            with those for attention would be louder than an escape hatch needs
            to be. This is what iOS puts in the same corner of Calendar.
          */
          day !== today ? (
            <>
              {/*
                Which day you are looking at, in full.

                The strip can only give a letter and a number, so across a
                month boundary "26" beside "1" says nothing about which month
                either belongs to — and this row is the only place left that
                can say. It appears solely on a past day: on today the strip's
                lit disc and the absence of this whole row already answer it.
              */}
              <span className="truncate text-xs text-muted-foreground">
                {format(parseDay(day), "EEEE d MMMM")}
              </span>
              <Link
                href="/"
                className="tappable flex h-9 shrink-0 items-center rounded-full px-2 text-[1rem] font-medium"
                style={{ color: "var(--ink-protein)" }}
              >
                Today
              </Link>
            </>
          ) : undefined
        }
      />
      <RestoreDestination />
      <Today
        initialMeals={onScreen}
        day={day}
        today={today}
        logged={kcalByDay(meals)}
        earliest={earliest}
        targets={targets}
        energy={dayEnergy(day, today, watch)}
        watch={watch}
      />
    </Screen>
  );
}


/**
 * The line under the date.
 *
 * The title used to be the word "Today" with the date beneath it, which spent
 * the largest type on the screen restating the tab you are already standing
 * on. The date is the part that is actually information, so it takes the
 * title, and this line does something the metric cards below cannot.
 *
 * What they cannot do is subtraction. They show 1,582 against 2,294 as a ring
 * and a fraction; what you want at a glance is the 712. So on today this says
 * what is left, and on any other day it says how long ago that was — because
 * "to go" is meaningless for a day that has already finished.
 */

