import { AppHeader } from "@/components/app-header";
import { Advisor } from "@/components/advisor";
import { PageTransition } from "@/components/page-transition";
import { Remaining } from "@/components/remaining";
import { createClient } from "@/lib/supabase/server";
import { listMealsInRange } from "@/lib/meals/repository";
import { loadTargets } from "@/lib/meals/load-targets";
import { summarise } from "@/lib/meals/summary";
import { localDay } from "@/lib/time";

/**
 * What to eat next, out of what is actually in.
 *
 * Its own screen rather than a row on Today, because it is a different
 * activity: logging records the past, this decides the next hour. It also
 * needs the day's remaining numbers visible while you think — the whole
 * answer turns on them — and there was nowhere to put those in a collapsed
 * strip under the composer.
 */
export default async function AdvisorScreen() {
  const supabase = await createClient();
  const day = localDay();

  const [meals, targets] = await Promise.all([
    listMealsInRange(supabase, day, day),
    loadTargets(supabase),
  ]);
  // The same rollup Progress uses, so "eaten so far" means one thing across
  // the app — pending and failed meals excluded alike.
  const today = summarise(meals, [day], targets).days[0];

  return (
    <PageTransition>
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-4 lg:max-w-2xl lg:pb-12 lg:pl-24 lg:pt-8">
        <AppHeader title="What now?" caption="Say what you have in — it picks one" />
        <Remaining consumed={today} targets={targets} />
        <Advisor />
      </main>
    </PageTransition>
  );
}
