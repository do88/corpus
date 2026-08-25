import { createClient } from "@/lib/supabase/server";
import { kcalByDay, listMealsInRange, localDay, weekOf } from "@/lib/meals/repository";
import { PageHeader } from "@/components/page-header";
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
  const meals = await listMealsInRange(supabase, week[0], week[6]);

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-24 pt-6">
      <PageHeader current="today" />
      <RestoreDestination />
      <Today
        initialMeals={meals.filter((m) => m.local_date === day)}
        day={day}
        today={today}
        logged={kcalByDay(meals)}
      />
    </main>
  );
}
