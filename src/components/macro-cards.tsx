import { Flame, Utensils } from "lucide-react";
import { MetricCard } from "@/components/metric-card";

/**
 * The day's two numbers as cards, and the other two as a line.
 *
 * There used to be four cards of equal size and weight, which said all four
 * mattered equally — and the estimator's own prompt says otherwise: calories
 * and protein are the targets, carbs and fat "need only be reasonable". On a
 * phone the four stacked two-up and pushed the first meal below the fold,
 * so the screen's actual content sat under a block of equal-billing rings.
 *
 * Two cards, then, for the two figures the day turns on, and carbs and fat as
 * one quiet line beneath in their own colours. The hierarchy now matches what
 * the app believes, and a card's height of screen comes back to the meals.
 *
 * One component for Today, Progress and the Advisor. They had three different
 * treatments of the same four numbers; consistent is scannable, and nobody
 * should have to learn a second notation for the day's figures.
 */

type Figures = { kcal: number; protein_g: number; carbs_g: number; fat_g: number };

export function MacroCards({
  values,
  targets,
  kcalCaption,
  proteinCaption,
}: {
  values: Figures;
  targets: Figures;
  /** Replaces the "/ target" line under calories, where a screen has a better one. */
  kcalCaption?: string;
  proteinCaption?: string;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3.5">
        <MetricCard
          label="Calories"
          icon={<Flame className="size-4" />}
          value={values.kcal}
          target={targets.kcal}
          unit="kcal"
          metric="energy"
          // The only ceiling. See the prop's own note for why protein is not.
          overIsProblem
          caption={kcalCaption}
        />
        <MetricCard
          label="Protein"
          icon={<Utensils className="size-4" />}
          value={values.protein_g}
          target={targets.protein_g}
          unit="g"
          metric="protein"
          caption={proteinCaption}
        />
      </div>

      {/* Present, not prominent. Each keeps the colour it has everywhere
          else, so the line reads as the same system in a smaller voice. */}
      <p className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs tabular-nums text-muted-foreground">
        <span>
          <span className="font-medium" style={{ color: "var(--ink-water)" }}>
            Carbs
          </span>{" "}
          {values.carbs_g.toLocaleString("en-GB")} / {targets.carbs_g} g
        </span>
        <span>
          <span className="font-medium" style={{ color: "var(--ink-weight)" }}>
            Fat
          </span>{" "}
          {values.fat_g.toLocaleString("en-GB")} / {targets.fat_g} g
        </span>
      </p>
    </div>
  );
}
