import { LoadingScreen } from "@/components/screen";
import { ProgressSkeleton } from "@/components/skeletons";

/**
 * Shown the instant a navigation starts, and replaced when the server's HTML
 * arrives. Its real job is not to be pretty — it is to acknowledge the tap.
 */
export default function Loading() {
  return (
    <LoadingScreen>
      <ProgressSkeleton />
    </LoadingScreen>
  );
}
