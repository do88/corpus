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
  overIsProblem = false,
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
  /**
   * Whether going past this target is a bad thing.
   *
   * Only true for calories, and the asymmetry is the point. Protein is a floor
   * — 130% of it is the day that went well — and fat's target is a health
   * minimum rather than a limit, while carbs are simply whatever the calorie
   * budget had left. Colouring all four red past 100% would call a good
   * protein day a failure, which is the opposite of what this app is for.
   */
  overIsProblem?: boolean;
}) {
  const accent = `var(--accent-${metric})`;
  const ink = `var(--ink-${metric})`;
  const over = target > 0 && value > target;
  const alarmed = over && overIsProblem;

  return (
    <div className="surface p-4.5">
      {/*
        Stacked on a phone, side by side once there is room.

        Letting it wrap on its own produced the worst of both: "Calories" and
        "Protein" pushed the ring onto a second line while "Carbs" and "Fat"
        kept it inline, so the two rows of cards did not match each other. The
        breakpoint makes the same choice for all four.

        Two across on a 360px phone leaves about 57px beside a 52px ring, and
        "Calories" at this size wants 61 — so inline was never really available
        there. Stacking gives the label the full width of the card and stops
        the layout depending on how long the word happens to be.
      */}
      <div className="flex flex-col items-start gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-2">
        <div className="flex items-center gap-1.5">
          <span style={{ color: ink }} aria-hidden className="flex shrink-0">
            {icon}
          </span>
          <span className="text-[1rem] font-semibold tracking-[-0.01em]">{label}</span>
        </div>
        <Ring
          value={value}
          target={target}
          colour={accent}
          overColour={overIsProblem ? "var(--destructive)" : undefined}
          size={52}
          width={5}
        />
      </div>

      {/* Wraps for the same reason the header does: at 320px "1,582" and "kcal"
          together want 109px of a 97px card, and the unit dropping to its own
          line is better than half of it disappearing. */}
      <div className="mt-2 flex flex-wrap items-baseline gap-x-1">
        <span className="text-[1.75rem] font-bold leading-none tracking-[-0.02em] tabular-nums">
          {value.toLocaleString("en-GB")}
        </span>
        <span className="text-xs font-medium text-muted-foreground">{unit}</span>
      </div>
      {/*
        How far over, in the unit rather than only as a percentage. "101%" is
        a shape; "20 over" is the number you would act on, and on a ceiling the
        amount is the whole question.
      */}
      <div
        className="mt-1 truncate text-xs tabular-nums"
        style={{ color: alarmed ? "var(--destructive)" : "var(--muted-foreground)" }}
      >
        {caption ??
          (alarmed
            ? `${(value - target).toLocaleString("en-GB")} over ${target.toLocaleString("en-GB")}`
            : `/ ${target.toLocaleString("en-GB")}`)}
      </div>
    </div>
  );
}
