import { createClient } from "@/lib/supabase/server";
import { kcalByDay, listMealsInRange, localDay, weekOf } from "@/lib/meals/repository";
import { loadTargets } from "@/lib/meals/load-targets";
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
export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const supabase = await createClient();
  const today = localDay();

  const { d } = await searchParams;
  // Anything unparseable falls back to today rather than erroring — a mistyped
  // URL should show the app, not a stack trace.
  const day = d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today ? d : today;

  // One query covers the day being shown and the dots on the week strip.
  const week = weekOf(day);
  const [meals, targets] = await Promise.all([
    listMealsInRange(supabase, week[0], week[6]),
    loadTargets(supabase),
  ]);

  return (
    // pb-28 clears the fixed tab bar; without it the last meal hides behind it.
    <main className="mx-auto w-full max-w-md px-4 pb-28 pt-3">
      <AppHeader title="Today" caption={caption(day, today)} streak={streak(kcalByDay(meals), today)} />
      <RestoreDestination />
      <Today
        initialMeals={meals.filter((m) => m.local_date === day)}
        day={day}
        today={today}
        logged={kcalByDay(meals)}
        targets={targets}
      />
    </main>
  );
}

const LONG_DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/** The title says "Today"; this says which day that actually is. */
function caption(day: string, today: string): string {
  const date = LONG_DAY.format(new Date(`${day}T12:00:00Z`));
  return day === today ? date : `${date} · not today`;
}

/**
 * Consecutive days ending today with something analysed on them.
 *
 * Counted back from today rather than forward from the first entry, so a gap
 * ends the streak — which is the only reading of the word that means anything.
 * Today not being logged *yet* does not break it: a streak that resets every
 * morning until breakfast would be a nag, not a record. So a missing today is
 * skipped once, and the count runs from yesterday.
 */
function streak(logged: Record<string, number>, today: string): number {
  const day = (offset: number) => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - offset);
    return d.toISOString().slice(0, 10);
  };

  let count = 0;
  for (let offset = logged[today] ? 0 : 1; ; offset += 1) {
    if (!logged[day(offset)]) break;
    count += 1;
    // `logged` only covers the week that was fetched, so this cannot run away.
    if (offset > 7) break;
  }
  return count;
}
