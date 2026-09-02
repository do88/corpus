import { LoadingScreen } from "@/components/screen";
import { FoodsSkeleton } from "@/components/skeletons";

/**
 * Shown the instant a navigation starts, and replaced when the server's HTML
 * arrives.
 *
 * This one was missing, and under Cache Components that is not cosmetic: a
 * route whose page awaits data with no Suspense boundary above it cannot be
 * prerendered, so Next refuses to make the navigation instant and logs
 * "uncached data during prerendering" on every visit. `loading.tsx` *is* the
 * boundary — it wraps the page in Suspense — which is why every other route
 * has one and this one now does too.
 */
export default function Loading() {
  return (
    <LoadingScreen>
      <FoodsSkeleton />
    </LoadingScreen>
  );
}
