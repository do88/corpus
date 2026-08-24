import { MACROS, type Macro, type MealTotals } from "./schema";

const LABELS: Record<Macro, string> = {
  kcal: "kcal",
  protein_g: "protein",
  carbs_g: "carbs",
  fat_g: "fat",
};

/** kcal is a count; the rest are grams. */
export function formatMacro(macro: Macro, value: number): string {
  return macro === "kcal" ? String(value) : `${value} g`;
}

/** The four macros in a fixed order, ready to render. */
export function macroRow(totals: MealTotals) {
  return MACROS.map((macro) => ({
    macro,
    label: LABELS[macro],
    value: formatMacro(macro, totals[macro]),
  }));
}

/** Claude pricing, $ per 1M tokens. */
const RATE = { input: 5, output: 25 };

export function costOf(usage: { input: number; output: number }): number {
  return (usage.input * RATE.input + usage.output * RATE.output) / 1e6;
}
