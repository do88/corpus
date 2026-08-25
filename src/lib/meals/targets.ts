/**
 * Daily targets.
 *
 * Energy and protein come from Alpha 1's analysis rather than a rule of thumb:
 *
 * - **Protein** is 2.2 g per kg of *lean* mass, not bodyweight. At 79.4 kg fat
 *   free mass that is 175 g. Scaling by bodyweight would say 250 g, which is
 *   chasing fat tissue with food.
 * - **Energy** is maintenance from Mifflin–St Jeor with the measured activity,
 *   minus a deficit small enough to hold while sleeping badly.
 *
 * Hard-coded for now, deliberately: the numbers move when the scale moves, and
 * `body_composition` has exactly one reading in it. Deriving a target from a
 * single measurement would look precise and be arbitrary. Wire it up when
 * there are enough readings for a trend.
 */

/** Atwater factors — what a gram of each macronutrient is worth in kcal. */
const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

const KCAL = 2490;
const PROTEIN_G = 175;

/**
 * Fat as a share of total energy.
 *
 * 30% is the middle of the usual 20–35% band. Below it the diet gets hard to
 * hold — fat is what makes food filling and palatable — and above it the carbs
 * left over stop covering the training.
 */
const FAT_SHARE_OF_KCAL = 0.3;

/**
 * Carbs and fat are **derived, not chosen**.
 *
 * Protein is fixed by lean mass and energy is fixed by the deficit, which
 * leaves exactly one degree of freedom: how the remaining calories split
 * between the other two. Setting that split is the only decision here, and
 * everything else falls out of it.
 *
 * Deriving them this way means the four targets always agree with each other —
 * `protein × 4 + carbs × 4 + fat × 9` sums back to the energy target, give or
 * take rounding. Picking three numbers independently is how a tracker ends up
 * telling you to hit macros that add up to a different calorie total than the
 * one above them, which is the kind of thing you only notice after trusting it
 * for a month.
 */
const FAT_G = Math.round((KCAL * FAT_SHARE_OF_KCAL) / KCAL_PER_G.fat);
const CARBS_G = Math.round(
  (KCAL - PROTEIN_G * KCAL_PER_G.protein - FAT_G * KCAL_PER_G.fat) / KCAL_PER_G.carbs,
);

export const DAILY_TARGET = {
  kcal: KCAL,
  protein_g: PROTEIN_G,
  carbs_g: CARBS_G,
  fat_g: FAT_G,
} as const;
