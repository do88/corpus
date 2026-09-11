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
 *
 * They carry no entrance animation of their own. They used to fade in over
 * 300ms, which ran at the same moment the view transition was snapshotting
 * them for a navigation — two animations on one element, each unaware of the
 * other. The blocks already pulse; arriving is not a third thing they need to
 * do.
 */

function Line({ w, h = "h-4" }: { w: string; h?: string }) {
  return <Skeleton className={`${h} ${w} rounded-md`} />;
}

/**
 * The mark every screen opens with.
 *
 * One shape for all of them, because the header is now the same on all of
 * them: the title stopped being drawn when the mark took its place, and the
 * caption under it went the same way. It used to take a width per screen and
 * draw a second line for the caption, and both were placeholders for things
 * that are no longer there.
 */
export function HeaderSkeleton() {
  return (
    <div className="pt-1">
      <Line w="w-28" h="h-8" />
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
    <div aria-hidden>
      <HeaderSkeleton />

      {/* The week strip: an arrow card, seven day cards, an arrow card. */}
      <div className="mt-6 flex gap-1.5">
        <CardSkeleton className="h-12 w-10 shrink-0" />
        {Array.from({ length: 7 }, (_, i) => (
          <CardSkeleton key={i} className="h-12 min-w-0 flex-1" />
        ))}
        <CardSkeleton className="h-12 w-10 shrink-0" />
      </div>

      {/* The composer, first, as it is on the page: the field, the time, and
          the two buttons. */}
      <CardSkeleton className="mt-5 h-13 w-full" />
      <CardSkeleton className="mt-2 h-11 w-full" />

      {/* The day's figures. */}
      <CardSkeleton className="mt-5 h-[210px] w-full" />

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
    <div aria-hidden>
      <HeaderSkeleton />
      <div className="mt-5 space-y-3">
        <CardSkeleton className="h-12 w-full" />
        <div className="flex items-center justify-between px-1">
          <Line w="w-44" h="h-4" />
          <Line w="w-24" h="h-3" />
        </div>
        <CardSkeleton className="h-[210px] w-full" />
        <CardSkeleton className="h-60 w-full" />
      </div>
    </div>
  );
}

export function BodySkeleton() {
  return (
    <div aria-hidden>
      <HeaderSkeleton />
      {/* The headline, the strength dial, weight, then the figure. */}
      <div className="mt-6 space-y-6">
        <CardSkeleton className="h-64 w-full" />
        <CardSkeleton className="h-100 w-full" />
        <CardSkeleton className="h-128 w-full" />
        <CardSkeleton className="h-300 w-full" />
      </div>
    </div>
  );
}

export function AccountSkeleton() {
  return (
    <div aria-hidden>
      <HeaderSkeleton />
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
    <div aria-hidden>
      <HeaderSkeleton />
      <CardSkeleton className="mt-5 h-[136px] w-full" />
      {/* The questions offered to an empty thread. */}
      <div className="mt-5 flex flex-wrap gap-2">
        {["w-32", "w-40", "w-36", "w-52"].map((w) => (
          <CardSkeleton key={w} className={`h-11 ${w}`} style={{ borderRadius: 999 }} />
        ))}
      </div>
      <div className="mt-4 space-y-2">
        <CardSkeleton className="h-13 w-full" />
        <CardSkeleton className="h-11 w-full" />
      </div>
    </div>
  );
}

/** Two metric cards and the carbs/fat line, at the heights the real ones take. */
/** Foods: the search field, then the list. */
export function FoodsSkeleton() {
  return (
    <>
      <HeaderSkeleton />
      <div className="mt-5 space-y-3">
        <CardSkeleton className="h-11" style={{ borderRadius: 12 }} />
        <CardSkeleton className="h-80" />
      </div>
    </>
  );
}
