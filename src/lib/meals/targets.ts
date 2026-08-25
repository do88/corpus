/**
 * Daily targets.
 *
 * Both come from Alpha 1's analysis rather than a rule of thumb:
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
export const DAILY_TARGET = {
  kcal: 2490,
  protein_g: 175,
} as const;
