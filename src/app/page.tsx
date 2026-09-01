import Link from "next/link";
import { Screen } from "@/components/screen";
import { differenceInCalendarDays, format } from "date-fns";
import { clampDay, localDay, parseDay } from "@/lib/time";
import { createClient } from "@/lib/supabase/server";
import { earliestLoggedDay, kcalByDay, listMealsInRange, totalsForDay, weekOf } from "@/lib/meals/repository";
import { loadTargets } from "@/lib/meals/load-targets";
import { listSavedFoods } from "@/lib/meals/saved";
import type { DailyTargets } from "@/lib/meals/targets";
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
  const [meals, targets, saved] = await Promise.all([
    listMealsInRange(supabase, week[0], week[6]),
    loadTargets(supabase),
    listSavedFoods(supabase),
  ]);

  const onScreen = meals.filter((m) => m.local_date === day);

  return (
    // pb-28 clears the fixed tab bar; without it the last meal hides behind it.
    // pb-28 clears the phone tab bar; lg:pl-24 clears the desktop rail, and the
    // column widens to hold four metric cards side by side rather than leaving
    // a 440px strip marooned in the middle of a 1440px window.
    <Screen>
      <AppHeader
        title={
          /*
            The month is dropped on a phone. The badges leave the title about
            204px on a 360px screen and "Thursday 27 August" wants 305 —
            measured, after the first attempt wrapped it onto two lines of
            34px type. The weekday is the half worth keeping: a food log is
            read as "what did I have on Tuesday", and the month is on the
            caption's own screen anyway.
          */
          <>
            <span className="lg:hidden">{format(parseDay(day), "EEEE d")}</span>
            <span className="hidden lg:inline">{format(parseDay(day), "EEEE d MMMM")}</span>
          </>
        }
        caption={caption(day, today, totalsForDay(onScreen), targets)}
        action={
          /*
            The way back, and only when there is somewhere to come back from.
            A plain word rather than a tinted pill with an icon: it sits beside
            the streak chip and the theme control, and a third shape competing
            with those for attention would be louder than an escape hatch needs
            to be. This is what iOS puts in the same corner of Calendar.
          */
          day !== today ? (
            <Link
              href="/"
              className="tappable flex h-9 shrink-0 items-center rounded-full px-3 text-sm font-medium"
              style={{ color: "var(--ink-protein)" }}
            >
              Today
            </Link>
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
        // Six is about what fits before the row stops being a glance and
        // starts being a list; the rest are a tap away on /foods.
        usual={saved.slice(0, 6)}
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
function caption(
  day: string,
  today: string,
  totals: { kcal: number; protein_g: number },
  targets: DailyTargets,
): string {
  if (day !== today) {
    const ago = differenceInCalendarDays(parseDay(today), parseDay(day));
    return ago === 1 ? "Yesterday" : `${ago} days ago`;
  }

  const kcal = Math.max(0, targets.kcal - totals.kcal);
  const protein = Math.max(0, targets.protein_g - totals.protein_g);

  // Protein is a floor and energy a ceiling, so "met" means different things
  // and each is said in its own terms rather than both as "done".
  if (kcal === 0 && protein === 0) return "Protein hit, and at your calorie ceiling";
  if (protein === 0) return `${kcal.toLocaleString("en-GB")} kcal left · protein hit`;
  if (kcal === 0) return `${protein}g protein short · at your calorie ceiling`;
  return `${kcal.toLocaleString("en-GB")} kcal and ${protein}g protein to go`;
}

