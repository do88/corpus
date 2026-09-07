import { z } from "zod";

/**
 * Macro fields are whole, non-negative numbers.
 *
 * The bounds live here and are enforced on parse. Gemini's JSON Schema path
 * accepts them as well; see gemini-schema.ts.
 */
const wholeAmount = z.number().int().min(0);

export const MACROS = ["kcal", "protein_g", "carbs_g", "fat_g"] as const;
export type Macro = (typeof MACROS)[number];
export const NUTRIENTS = [...MACROS, "fiber_g"] as const;
export type Nutrient = (typeof NUTRIENTS)[number];
export const fibreAmount = z.number().min(0).nullable()
  .describe("Dietary fibre in grams for the stated portion; preserve label values. Null only when unknown, never use zero for missing data.");

export const mealItemSchema = z.object({
  name: z.string().describe("The food as a person would say it"),
  qty: z.string().describe("Portion actually assumed, e.g. '1 tin (125g)'"),
  kcal: wholeAmount,
  protein_g: wholeAmount,
  carbs_g: wholeAmount,
  fat_g: wholeAmount,
  // Optional for saved items written before fibre tracking existed.
  fiber_g: fibreAmount.optional(),
});

/**
 * What the model is asked for — the itemisation and its own reasoning about it.
 *
 * Deliberately no totals. A total that disagrees with its own line items is a
 * bug the user can see and can't act on, and asking for both invites exactly
 * that. `totalsFor` derives them instead, so the card can never contradict
 * itself and the model spends its tokens on portions rather than arithmetic.
 */
export const mealResponseSchema = z.object({
  items: z.array(mealItemSchema.extend({ fiber_g: fibreAmount })).min(1),
  confidence: z.enum(["low", "medium", "high"]),
  assumptions: z
    .string()
    .describe("Portion sizes and preparation assumed, in one sentence"),
});

export type MealItem = z.infer<typeof mealItemSchema>;
export type MealResponse = z.infer<typeof mealResponseSchema>;
export type MealTotals = Record<Macro, number> & { fiber_g: number | null };
export type MealEstimate = Omit<MealResponse, "items"> & { items: MealItem[] } & MealTotals;

/** Missing fibre makes a total unknown, not artificially low. */
export function fibreTotal(items: { fiber_g?: number | null }[]): number | null {
  return items.some((item) => item.fiber_g == null)
    ? null
    : Math.round(items.reduce((sum, item) => sum + item.fiber_g!, 0) * 10) / 10;
}

export function totalsFor(items: MealItem[]): MealTotals {
  return { ...Object.fromEntries(
    MACROS.map((macro) => [macro, items.reduce((sum, item) => sum + item[macro], 0)]),
  ) as Record<Macro, number>, fiber_g: fibreTotal(items) };
}
