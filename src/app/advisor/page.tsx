import { Screen } from "@/components/screen";
import { AppHeader } from "@/components/app-header";
import { Advisor } from "@/components/advisor";
import { MacroCards } from "@/components/macro-cards";
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
    <Screen>
      <AppHeader title="What now?" caption="Say what you have in — it picks one" />
      {/*
        The same cards as Today, captioned with what is left rather than what
        is done — because the advice is a function of the gap, and "1,083 left"
        is the form the question needs it in. This used to be its own panel
        with its own figure treatment, the last one in the app; the answer to
        "which of these" does not need a second notation for the day's numbers.
      */}
      <div className="mt-5">
        <MacroCards
          values={today}
          targets={targets}
          kcalCaption={
            today.kcal >= targets.kcal
              ? "at your ceiling"
              : `${(targets.kcal - today.kcal).toLocaleString("en-GB")} left`
          }
          proteinCaption={
            today.protein_g >= targets.protein_g
              ? "target met"
              : `${targets.protein_g - today.protein_g}g short`
          }
        />
      </div>
      <Advisor />
    </Screen>
  );
}
