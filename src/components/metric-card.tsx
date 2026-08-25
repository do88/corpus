import { Ring } from "@/components/ui/ring";

/**
 * One figure against its target: a ring, the number, and what it is.
 *
 * The layout is deliberately not centred. The ring sits left, the value reads
 * large beside it, and the target sits under the value in muted text — so a
 * glance down the column lands on four numbers in the same place rather than
 * four rings.
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
      <div className="mb-2.5 flex items-center gap-1.5">
        <span style={{ color: ink }} aria-hidden className="flex">
          {icon}
        </span>
        <span className="text-[0.9375rem] font-semibold tracking-[-0.01em]">{label}</span>
      </div>

      <div className="flex items-center gap-3">
        <Ring value={value} target={target} colour={accent} />
        <div className="min-w-0">
          <div className="flex items-baseline gap-1">
            <span className="text-[1.6rem] font-bold leading-none tracking-[-0.02em] tabular-nums">
              {value.toLocaleString("en-GB")}
            </span>
            <span className="text-xs font-medium text-muted-foreground">{unit}</span>
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground tabular-nums">
            {caption ?? `/ ${target.toLocaleString("en-GB")}`}
          </div>
        </div>
      </div>
    </div>
  );
}
