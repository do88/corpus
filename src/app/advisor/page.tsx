import { Screen } from "@/components/screen";
import { AppHeader } from "@/components/app-header";
import { Advisor } from "@/components/advisor";
import { Remaining } from "@/components/remaining";
import { createClient } from "@/lib/supabase/server";
import { listMealsInRange, weekOf } from "@/lib/meals/repository";
import { rolloverFor } from "@/lib/meals/rollover";
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

  // The whole week, not just today: the advice has to reckon with the same
  // headroom Today shows, and that includes anything carried over from earlier
  // in the week.
  const week = weekOf(day);
  const [meals, targets] = await Promise.all([
    listMealsInRange(supabase, week[0], week[6]),
    loadTargets(supabase),
  ]);
  const rollover = rolloverFor(day, targets.kcal, meals);
  // The same rollup Progress uses, so "eaten so far" means one thing across
  // the app — pending and failed meals excluded alike.
  const today = summarise(meals, [day], targets).days[0];

  return (
    <Screen>
      <AppHeader title="What now?" caption="Say what you have in — it picks one" />
      <Remaining consumed={today} targets={targets} rollover={rollover} />
      <Advisor />
    </Screen>
  );
}
