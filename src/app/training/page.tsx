import { AppHeader } from "@/components/app-header";
import { getDashboardData } from "@/lib/training/dashboard";
import { TrainingSections } from "@/components/training-sections";

/**
 * The Alpha 1 dashboard, ported mobile-first.
 *
 * Everything is computed in `getDashboardData` and rendered as plain props —
 * no component decides what a number means. That layering is what let the
 * arithmetic come across from Alpha 1 untouched, tests and all.
 */
/**
 * Still rendered per request; the *data* is what is cached, an hour at a time,
 * in `getDashboardData`.
 *
 * Route-segment `revalidate` was the obvious move and turned out to be the
 * wrong one: it makes Next prerender the page at build time, and the build
 * machine has no route to the database. The build hung for three 60-second
 * attempts and failed. Caching the query layer instead keeps the build free of
 * any database dependency, which is the property worth protecting.
 */
export const dynamic = "force-dynamic";

export default async function Training() {
  const data = await getDashboardData();
  const { headline } = data;

  return (
    <main className="mx-auto w-full max-w-md px-4 pb-28 pt-3">
      <AppHeader
        title="Training"
        caption={`${headline.total_workouts} sessions since ${headline.first_date.slice(0, 4)}`}
      />
      <TrainingSections data={data} />
    </main>
  );
}
