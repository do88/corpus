/**
 * Nutrition cheat sheet.
 *
 * Everything here derives from the daily calorie and protein targets rather
 * than being written down as fixed numbers — change lean mass or the deficit
 * and the meal split follows, instead of quietly going stale.
 */

/**
 * How the day splits across two meals and three smaller occasions. Shares, not
 * absolutes: each column sums to 1, so the plan always adds back to the target.
 */
export const MEAL_SHAPE = [
  {
    id: "morning",
    label: "Morning",
    kcalShare: 0.12,
    proteinShare: 0.23,
    example: "200 g 0% Greek yoghurt + scoop of whey + berries",
    note: "Ninety seconds, no cooking.",
  },
  {
    id: "lunch",
    label: "Lunch",
    kcalShare: 0.32,
    proteinShare: 0.29,
    example: "180 g chicken thigh, 200 g cooked rice, veg, olive oil",
    note: "Batch the protein on Sunday.",
  },
  {
    id: "afternoon",
    label: "Afternoon",
    kcalShare: 0.10,
    proteinShare: 0.14,
    example: "40 g biltong + an apple, or 250 g cottage cheese",
    note: "The one that gets skipped. Keep it in a drawer.",
  },
  {
    id: "dinner",
    label: "Dinner",
    kcalShare: 0.36,
    proteinShare: 0.25,
    example: "200 g salmon or 5% mince, 300 g potatoes, veg, sauce",
    note: "The only meal worth varying.",
  },
  {
    id: "evening",
    label: "Evening",
    kcalShare: 0.10,
    proteinShare: 0.09,
    example: "300 ml milk with whey, or 150 g cottage cheese",
    note: "Optional. Drop it first if you're full.",
  },
] as const;

export type MealSlot = (typeof MEAL_SHAPE)[number];

/** Calories round to 10, protein to 5 — nobody weighs to the gram. */
export function planDay(kcal: number, proteinG: number) {
  const slots = MEAL_SHAPE.map((m) => ({
    id: m.id,
    label: m.label,
    example: m.example,
    note: m.note,
    kcal: Math.round((kcal * m.kcalShare) / 10) * 10,
    protein: Math.round((proteinG * m.proteinShare) / 5) * 5,
  }));
  return {
    slots,
    // Shown as a total row so the rounding drift is visible, not hidden.
    totalKcal: slots.reduce((n, s) => n + s.kcal, 0),
    totalProtein: slots.reduce((n, s) => n + s.protein, 0),
  };
}

/**
 * The constraint that actually makes the target hard: protein per 100 kcal.
 * Hitting 175 g inside 2,490 kcal needs a whole-day average around 7 g/100 kcal,
 * so every eating occasion has to be anchored on something well above that.
 */
export const proteinDensityBudget = (kcal: number, proteinG: number) =>
  (proteinG / kcal) * 100;

/**
 * Two independent measures of a protein source, which is the point of showing
 * them side by side:
 *
 *  - `perHundred` — grams of protein per 100 kcal. How well it fits the deficit.
 *  - `poundsPer100g` — £ per 100 g of protein, on an *as-bought* basis so raw
 *    weights and prices agree. Rough UK supermarket figures; they drift.
 *
 * Rice is the clearest illustration: cheapest protein on the list by money,
 * near-worthless by calories.
 */
export const PROTEIN_SOURCES = [
  { food: "Tinned tuna", perHundred: 23, poundsPer100g: 4.0 },
  { food: "White fish, frozen", perHundred: 21, poundsPer100g: 2.86 },
  { food: "Whey powder", perHundred: 20, poundsPer100g: 3.13 },
  { food: "Chicken breast", perHundred: 19, poundsPer100g: 3.26 },
  { food: "0% Greek yoghurt", perHundred: 17, poundsPer100g: 4.0 },
  { food: "5% beef mince", perHundred: 15, poundsPer100g: 3.81 },
  { food: "Chicken thigh", perHundred: 14, poundsPer100g: 3.16 },
  { food: "Cottage cheese", perHundred: 11, poundsPer100g: 4.55 },
  { food: "Salmon", perHundred: 10, poundsPer100g: 9.0 },
  { food: "Eggs", perHundred: 8, poundsPer100g: 4.1 },
  { food: "Cheddar", perHundred: 6, poundsPer100g: 2.8 },
  { food: "Whole milk", perHundred: 5, poundsPer100g: 1.93 },
  { food: "Nuts", perHundred: 4, poundsPer100g: 3.81 },
  { food: "Bread, rice, pasta", perHundred: 2, poundsPer100g: 1.71 },
  { food: "Olive oil", perHundred: 0, poundsPer100g: null },
] as const;

export type ProteinSource = (typeof PROTEIN_SOURCES)[number];

/** Below this, a source counts as cheap. Roughly the median of the good ones. */
export const CHEAP_PER_100G = 3.3;

/**
 * The habits that matter more than the numbers. Takes the budget so the first
 * rule states the actual figure rather than referring to a line by name.
 */
export const rules = (budgetPerHundred: number) => [
  `Anchor every occasion on something that clears ${budgetPerHundred.toFixed(0)} g of protein per 100 kcal — then spend the rest on whatever you like.`,
  "Eat the same day most days. With broken sleep the failure mode is decision fatigue at 6pm, not hunger.",
  "Batch 1 kg of chicken or mince on Sunday. That covers five lunches.",
  "Not moving after three weeks? Take 200 kcal off dinner's carbs. Never off the protein.",
  "Weigh in weekly, same time, same conditions — it's the only feedback loop here.",
];
