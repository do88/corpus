import { PageHeader } from "@/components/page-header";
import { getDashboardData } from "@/lib/training/dashboard";
import { TrainingSections } from "@/components/training-sections";

/**
 * The Alpha 1 dashboard, ported mobile-first.
 *
 * Everything is computed in `getDashboardData` and rendered as plain props —
 * no component decides what a number means. That layering is what let the
 * arithmetic come across from Alpha 1 untouched, tests and all.
 */
export const dynamic = "force-dynamic";

export default async function Training() {
  const data = await getDashboardData();
  const { headline } = data;

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-16 pt-8">
      <PageHeader
        current="training"
        caption={`${headline.total_workouts} sessions · ${headline.first_date} to ${headline.last_date}`}
      />
      <TrainingSections data={data} />
    </main>
  );
}
