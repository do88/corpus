import { Ring } from "@/components/ui/ring";

/**
 * One figure against its target: a ring, the number, and what it is.
 *
 * Stacked, not side by side. The ring used to sit left with the value beside
 * it, which never had the room: a 74px ring and the card's padding leave about
 * 59px of a phone-width card for the number, and "1,211 kcal" wants 107px. The
 * unit ran under the card's edge — visible first on desktop at four across,
 * but it was worse on a phone the whole time.
 *
 * So the ring moves up beside the label, where its height is free, and the
 * number takes the full width of the card underneath. The original reason for
 * the old layout survives the change: a glance down the column still lands on
 * four numbers at the same height rather than on four rings.
 */
export function MetricCard({
  label,
  icon,
  value,
  target,
  unit,
  metric,
  caption,
}: {
  label: string;
  icon: React.ReactNode;
  value: number;
  target: number;
  unit: string;
  /** Picks the hue. Each metric keeps its colour everywhere it appears. */
  metric: "energy" | "protein" | "water" | "weight";
  /** Overrides the "/ target" line — used where a target is not a ceiling. */
  caption?: string;
}) {
  const accent = `var(--accent-${metric})`;
  const ink = `var(--ink-${metric})`;

  return (
    <div className="surface p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span style={{ color: ink }} aria-hidden className="flex shrink-0">
            {icon}
          </span>
          <span className="truncate text-[0.9375rem] font-semibold tracking-[-0.01em]">
            {label}
          </span>
        </div>
        {/* Smaller than it was, because it now shares a row with the label
            rather than owning the card's full height. */}
        <Ring value={value} target={target} colour={accent} size={52} width={5} />
      </div>

      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-[1.6rem] font-bold leading-none tracking-[-0.02em] tabular-nums">
          {value.toLocaleString("en-GB")}
        </span>
        <span className="text-xs font-medium text-muted-foreground">{unit}</span>
      </div>
      <div className="mt-1 truncate text-xs text-muted-foreground tabular-nums">
        {caption ?? `/ ${target.toLocaleString("en-GB")}`}
      </div>
    </div>
  );
}
