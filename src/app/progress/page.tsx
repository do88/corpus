import { Screen } from "@/components/screen";
import { format } from "date-fns";
import { localDay, parseDay } from "@/lib/time";
import { AppHeader } from "@/components/app-header";
import { ProgressView } from "@/components/progress-view";
import { createClient } from "@/lib/supabase/server";
import { listMealsInRange } from "@/lib/meals/repository";
import { loadTargets } from "@/lib/meals/load-targets";
import { datesBetween, monthRange, summarise, weekRange } from "@/lib/meals/summary";

/**
 * A week or a month, averaged.
 *
 * Like Today, the period lives in the URL rather than component state — so a
 * particular week is linkable, survives a refresh, and gets back/forward for
 * free. Three things that would otherwise need building.
 */


export default async function Progress({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; d?: string }>;
}) {
  const supabase = await createClient();
  const today = localDay();

  const { range: rawRange, d } = await searchParams;
  // Anything unparseable falls back rather than erroring — a mistyped URL
  // should show the app, not a stack trace.
  const range = rawRange === "month" ? "month" : "week";
  const day = d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today ? d : today;

  const [from, to] = range === "month" ? monthRange(day) : weekRange(day);
  const dates = datesBetween(from, to);

  const [meals, targets] = await Promise.all([
    listMealsInRange(supabase, from, to),
    loadTargets(supabase),
  ]);

  const summary = summarise(meals, dates, targets);

  const label =
    range === "month"
      ? format(parseDay(from), "MMMM yyyy")
      : `${format(parseDay(from), "d MMMM")} – ${format(parseDay(to), "d MMMM")}`;

  return (
    <Screen>
      <AppHeader
        title="Progress"
        caption={`Averaged across the days you logged`}
      />
      <ProgressView
        summary={summary}
        targets={targets}
        range={range}
        label={label}
        day={day}
      />
    </Screen>
  );
}
