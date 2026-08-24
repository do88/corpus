import { z } from "zod";

/**
 * Macro fields are whole, non-negative numbers.
 *
 * The bounds live here and are enforced on parse; `toStructuredOutputSchema`
 * removes them on the way to the API, which rejects `minimum`/`maximum` on an
 * integer. See lib/anthropic/schema.ts.
 */
const wholeAmount = z.number().int().min(0);

export const MACROS = ["kcal", "protein_g", "carbs_g", "fat_g"] as const;
export type Macro = (typeof MACROS)[number];

export const mealItemSchema = z.object({
  name: z.string().describe("The food as a person would say it"),
  qty: z.string().describe("Portion actually assumed, e.g. '1 tin (125g)'"),
  kcal: wholeAmount,
  protein_g: wholeAmount,
  carbs_g: wholeAmount,
  fat_g: wholeAmount,
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
  items: z.array(mealItemSchema).min(1),
  confidence: z.enum(["low", "medium", "high"]),
  assumptions: z
    .string()
    .describe("Portion sizes and preparation assumed, in one sentence"),
});

export type MealItem = z.infer<typeof mealItemSchema>;
export type MealResponse = z.infer<typeof mealResponseSchema>;
export type MealTotals = Record<Macro, number>;
export type MealEstimate = MealResponse & MealTotals;

export function totalsFor(items: MealItem[]): MealTotals {
  return Object.fromEntries(
    MACROS.map((macro) => [macro, items.reduce((sum, item) => sum + item[macro], 0)]),
  ) as MealTotals;
}
