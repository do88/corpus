import { Flame, Utensils } from "lucide-react";
import type { DaySummary } from "@/lib/meals/summary";
import type { DailyTargets } from "@/lib/meals/targets";
import { allowanceFor, NO_ROLLOVER, type Rollover } from "@/lib/meals/rollover";

/**
 * What is left of the day, in the two numbers the advice turns on.
 *
 * The reason this screen is worth visiting rather than being a text box: the
 * answer to "which of these" is entirely a function of the gap, so the gap
 * should be legible while you type. Today shows the same information as rings
 * of progress; here it is stated as what remains, because that is the form the
 * question needs it in — "1,083 left" is directly actionable where "69% of
 * 2,294" has to be worked out first.
 *
 * Protein reads as a shortfall and energy as headroom, matching how each is
 * targeted: protein is a floor to clear, calories a ceiling to stay under.
 * Once either is met the number stops rather than going negative — "0 left"
 * is the useful reading, and a running count of how far over you are belongs
 * on the day's own screen, not on the one asking what to have next.
 */
export function Remaining({
  consumed,
  targets,
  rollover = NO_ROLLOVER,
}: {
  consumed: Pick<DaySummary, "kcal" | "protein_g">;
  targets: DailyTargets;
  /**
   * Unspent calories from earlier in the week.
   *
   * The advice turns entirely on the headroom, so this screen has to agree
   * with Today about how much there is. Showing 400 left here while the home
   * screen shows 900 would not read as two views of one day — it would read
   * as one of them being broken, and the pick would be wrong besides.
   */
  rollover?: Rollover;
}) {
  const kcalLeft = Math.max(0, allowanceFor(targets.kcal, rollover) - consumed.kcal);
  const proteinShort = Math.max(0, targets.protein_g - consumed.protein_g);

  return (
    <div className="surface mt-5 p-5">
      <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
        Left today
      </p>
      <div className="mt-3 grid grid-cols-2 gap-4">
        <Figure
          icon={<Flame className="size-4" />}
          metric="energy"
          value={kcalLeft}
          unit="kcal"
          // The denominator has to be the same ceiling the numerator was
          // measured against. "2,800 of 2,300" is not a rounding quibble, it
          // is a sentence that cannot be true, and it invites exactly the
          // question the fixed goal was meant to stop being asked.
          note={
            kcalLeft === 0
              ? "at your ceiling"
              : rollover.banked > 0
                ? `of ${targets.kcal.toLocaleString("en-GB")} + ${rollover.banked.toLocaleString("en-GB")} spare`
                : `of ${targets.kcal.toLocaleString("en-GB")}`
          }
        />
        <Figure
          icon={<Utensils className="size-4" />}
          metric="protein"
          value={proteinShort}
          unit="g protein"
          note={proteinShort === 0 ? "target met" : `of ${targets.protein_g}`}
        />
      </div>
    </div>
  );
}

function Figure({
  icon,
  metric,
  value,
  unit,
  note,
}: {
  icon: React.ReactNode;
  metric: "energy" | "protein";
  value: number;
  unit: string;
  note: string;
}) {
  return (
    <div>
      <span style={{ color: `var(--ink-${metric})` }} aria-hidden className="flex">
        {icon}
      </span>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1">
        <span className="text-[1.75rem] font-bold leading-none tracking-[-0.02em] tabular-nums">
          {value.toLocaleString("en-GB")}
        </span>
        <span className="text-xs font-medium text-muted-foreground">{unit}</span>
      </div>
      <p className="mt-1 text-xs tabular-nums text-muted-foreground">{note}</p>
    </div>
  );
}
