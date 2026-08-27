import { Skeleton } from "@/components/ui/skeleton";

/**
 * The shapes a screen shows while its data is still on the wire.
 *
 * These exist because every page here is `force-dynamic`: there is nothing to
 * send until the queries come back, so without a `loading.tsx` the browser sits
 * on the *previous* screen with no acknowledgement that the tap registered.
 * On a warm function that is a few hundred milliseconds of nothing; on a cold
 * one it is long enough to tap again.
 *
 * They are laid out to match the real screen rather than being generic bars.
 * A skeleton whose blocks land where the content lands reads as the page
 * arriving; one that does not reads as a flash of something else, and costs a
 * layout shift when the real thing replaces it.
 *
 * `aria-hidden` throughout, with the live region left to the page itself —
 * a screen reader announcing a dozen decorative blocks is worse than silence.
 */

function Line({ w, h = "h-4" }: { w: string; h?: string }) {
  return <Skeleton className={`${h} ${w} rounded-md`} />;
}

/** The title block every screen opens with. */
export function HeaderSkeleton({ wide = "w-40" }: { wide?: string }) {
  return (
    <div className="pt-1">
      <Line w={wide} h="h-9" />
      <div className="mt-2">
        <Line w="w-52" h="h-4" />
      </div>
    </div>
  );
}

/** One `.surface` card with a given height, matching the real card's radius. */
export function CardSkeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <Skeleton
      className={`surface ${className}`}
      style={{ borderRadius: "var(--radius)", ...style }}
    />
  );
}

export function TodaySkeleton() {
  return (
    <div aria-hidden className="animate-in fade-in duration-300">
      <HeaderSkeleton />

      {/* The week strip. */}
      <div className="mt-6 flex items-end justify-between gap-2 px-1">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-2">
            <Line w="w-3" h="h-3" />
            <Skeleton className="size-9 rounded-full" />
          </div>
        ))}
      </div>

      {/* Four metric cards, stacked on a phone exactly as the real ones are. */}
      <div className="mt-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <CardSkeleton key={i} className="h-[168px] lg:h-[132px]" />
        ))}
      </div>

      <CardSkeleton className="mt-3 h-13 w-full" />
      <CardSkeleton className="mt-2 h-11 w-full" />

      {/* A few meals on the spine. */}
      <div className="mt-3 space-y-3">
        {[92, 84, 92].map((h, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="mt-[1.15rem] size-2.5 shrink-0 rounded-full" />
            <CardSkeleton className="flex-1" style={{ height: h }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProgressSkeleton() {
  return (
    <div aria-hidden className="animate-in fade-in duration-300">
      <HeaderSkeleton wide="w-44" />
      <div className="mt-5 space-y-3">
        <CardSkeleton className="h-12 w-full" />
        <CardSkeleton className="h-56 w-full" />
        <CardSkeleton className="h-60 w-full" />
      </div>
    </div>
  );
}

export function TrainingSkeleton() {
  return (
    <div aria-hidden className="animate-in fade-in duration-300">
      <HeaderSkeleton wide="w-44" />
      <div className="mt-5 space-y-3">
        <CardSkeleton className="h-32 w-full" />
        <CardSkeleton className="h-64 w-full" />
        <CardSkeleton className="h-72 w-full" />
      </div>
    </div>
  );
}

export function AccountSkeleton() {
  return (
    <div aria-hidden className="animate-in fade-in duration-300">
      <HeaderSkeleton wide="w-36" />
      <div className="mt-5 space-y-3">
        <CardSkeleton className="h-28 w-full" />
        <CardSkeleton className="h-44 w-full" />
        <CardSkeleton className="h-36 w-full" />
      </div>
    </div>
  );
}

export function AdvisorSkeleton() {
  return (
    <div aria-hidden className="animate-in fade-in duration-300">
      <HeaderSkeleton wide="w-40" />
      <div className="mt-5 space-y-3">
        <CardSkeleton className="h-32 w-full" />
        <CardSkeleton className="h-40 w-full" />
      </div>
    </div>
  );
}
