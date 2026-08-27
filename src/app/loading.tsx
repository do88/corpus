import { LoadingTransition } from "@/components/page-transition";
import { TodaySkeleton } from "@/components/skeletons";

/**
 * Shown the instant a navigation starts, and replaced when the server's HTML
 * arrives. Its real job is not to be pretty — it is to acknowledge the tap.
 */
export default function Loading() {
  return (
    <LoadingTransition>
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-4 lg:max-w-4xl lg:pb-12 lg:pl-24 lg:pt-8">
        <TodaySkeleton />
      </main>
    </LoadingTransition>
  );
}
