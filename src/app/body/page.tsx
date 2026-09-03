import { Screen } from "@/components/screen";
import { AppHeader } from "@/components/app-header";
import { getDashboardData } from "@/lib/training/dashboard";
import { BodySections } from "@/components/body-sections";

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

export default async function Body() {
  const data = await getDashboardData();
  const { headline } = data;

  return (
    <Screen>
      <AppHeader
        title="Body"
        caption={`${data.watch.summary?.steps?.toLocaleString("en-GB") ?? "—"} steps a day · ${headline.last_28} sessions in 28 days`}
      />
      <BodySections data={data} />
    </Screen>
  );
}
