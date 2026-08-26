import { AppHeader } from "@/components/app-header";
import { ProgressView } from "@/components/progress-view";
import { createClient } from "@/lib/supabase/server";
import { listMealsInRange, localDay } from "@/lib/meals/repository";
import { loadTargets } from "@/lib/meals/load-targets";
import { datesBetween, monthRange, summarise, weekRange } from "@/lib/meals/summary";

/**
 * A week or a month, averaged.
 *
 * Like Today, the period lives in the URL rather than component state — so a
 * particular week is linkable, survives a refresh, and gets back/forward for
 * free. Three things that would otherwise need building.
 */
export const dynamic = "force-dynamic";

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const DAY_MONTH = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });

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
      ? MONTH.format(new Date(`${from}T12:00:00Z`))
      : `${DAY_MONTH.format(new Date(`${from}T12:00:00Z`))} – ${DAY_MONTH.format(new Date(`${to}T12:00:00Z`))}`;

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-28 pt-4 lg:max-w-4xl lg:pb-12 lg:pl-24 lg:pt-8">
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
    </main>
  );
}
