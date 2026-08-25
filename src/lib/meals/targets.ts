/**
 * Daily targets, computed from the body-composition reading rather than typed in.
 *
 * Four numbers, and only two of them are decisions. Energy and protein fall out
 * of measurements; fat has a floor set for health rather than for the goal; and
 * carbs are whatever is left. That ordering is the design — it is what stops the
 * four contradicting each other, and what makes "protein first" mean something
 * more than a larger number.
 *
 * Not medical advice, and not trying to be. These are the standard formulas a
 * dietitian would start from, applied to one person's own measurements, in that
 * person's own tracker.
 */

/** Atwater factors — what a gram of each macronutrient is worth in kcal. */
export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

export type BodyInput = {
  weightKg: number;
  /** Fat-free mass. The whole reason this is more than a height/weight guess. */
  leanMassKg: number | null;
  heightCm: number;
  age: number;
  /** Where this is heading. Used for the fat floor, not for the deficit. */
  goalWeightKg: number;
  /** Sessions in the last 28 days — read from the training log, not a dropdown. */
  sessionsLast28: number;
};

export type DailyTargets = {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  /** How the figure was reached, for the account screen to explain itself. */
  basis: {
    bmr: number;
    bmrFormula: "katch-mcardle" | "mifflin-st-jeor";
    tdee: number;
    activityFactor: number;
    deficitKcal: number;
    weeklyLossKg: number;
    weeksToGoal: number | null;
  };
};

/**
 * Resting burn.
 *
 * **Katch–McArdle when lean mass is known, Mifflin–St Jeor when it is not**, and
 * the distinction matters here. Mifflin works off total bodyweight, which treats
 * a kilo of fat as metabolically equal to a kilo of muscle; at 30% body fat that
 * overstates the burn. Katch–McArdle works off lean tissue, which is the tissue
 * actually doing the burning.
 *
 * For the reading on file it returns 2086 kcal against the scale's own measured
 * 2105 — a 1% disagreement between a formula and a bioimpedance device, which is
 * about as much validation as either deserves.
 */
function restingBurn(input: BodyInput): { bmr: number; formula: DailyTargets["basis"]["bmrFormula"] } {
  if (input.leanMassKg && input.leanMassKg > 0) {
    return { bmr: Math.round(370 + 21.6 * input.leanMassKg), formula: "katch-mcardle" };
  }
  return {
    bmr: Math.round(10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age + 5),
    formula: "mifflin-st-jeor",
  };
}

/**
 * Activity multiplier, derived from sessions actually logged in the last 28 days.
 *
 * The usual version of this is a dropdown where everyone picks "moderately
 * active", and the resulting target is wrong in the same direction for almost
 * everyone. This app already knows how often the training happens, so it reads
 * it instead of asking.
 *
 * The bands are the standard ones; what is unusual is only that the input is
 * measured. Capped at 1.55 because sessions-per-week stops being a good proxy
 * above that — at which point what is actually needed is the weight trend, and
 * that is the honest signal to switch to once there are enough readings.
 */
function activityFactor(sessionsLast28: number): number {
  const perWeek = sessionsLast28 / 4;
  if (perWeek < 1) return 1.2;
  if (perWeek < 3) return 1.375;
  if (perWeek < 5) return 1.465;
  return 1.55;
}

/**
 * A percentage of maintenance, not a fixed number of calories.
 *
 * 20% is the middle of the range that holds without wrecking training or sleep.
 * A fixed −500 is the more common advice and gets progressively more aggressive
 * as bodyweight falls: 500 off 2900 is 17%, but 500 off 2300 is 22%, so a plan
 * that starts comfortable ends up punishing at exactly the point it gets hard.
 * A percentage keeps the pressure constant as the numbers move.
 */
const DEFICIT_SHARE = 0.2;

/**
 * Protein, and this is the "protein first" part.
 *
 * 2.4 g per kg of *lean* mass — the top of the evidence-backed range for someone
 * in a deficit who lifts. Scaling by lean mass rather than bodyweight is the
 * same argument as the BMR formula: fat tissue has no protein requirement, and
 * at 30% body fat, bodyweight-based advice overshoots by about a third.
 *
 * Protein is allocated *before* the other two, so a deeper deficit takes calories
 * from carbs and fat and never from here. That is the whole difference between
 * saying protein comes first and meaning it.
 */
const PROTEIN_G_PER_KG_LEAN = 2.4;

/**
 * The fat floor, set against *goal* weight rather than current.
 *
 * 0.8 g/kg is the usual lower bound for hormone production and fat-soluble
 * vitamin absorption. Anchoring it to the target weight rather than today's
 * keeps the floor still while the weight moves — a floor that falls as you lose
 * is not a floor.
 */
const FAT_G_PER_KG_GOAL = 0.8;

/** A kilo of body fat is about 7,700 kcal. Used only to project a timeline. */
const KCAL_PER_KG_FAT = 7700;

export function computeTargets(input: BodyInput): DailyTargets {
  const { bmr, formula } = restingBurn(input);
  const factor = activityFactor(input.sessionsLast28);
  const tdee = Math.round(bmr * factor);

  const kcal = Math.round(tdee * (1 - DEFICIT_SHARE));
  const deficitKcal = tdee - kcal;

  // Protein first, from lean mass. Falls back to goal bodyweight at 1.9 g/kg —
  // the same intake by a different route — when body composition is unknown.
  const protein_g = Math.round(
    input.leanMassKg && input.leanMassKg > 0
      ? input.leanMassKg * PROTEIN_G_PER_KG_LEAN
      : input.goalWeightKg * 1.9,
  );

  const fat_g = Math.round(input.goalWeightKg * FAT_G_PER_KG_GOAL);

  // Carbs take the remainder — they fuel the training, so they are the right
  // thing to flex. Clamped at zero: an aggressive enough deficit could in
  // principle ask for negative carbs, and a target of "less than nothing" is
  // worse than a plan that simply says the deficit is too deep.
  const carbs_g = Math.max(
    0,
    Math.round(
      (kcal - protein_g * KCAL_PER_G.protein - fat_g * KCAL_PER_G.fat) / KCAL_PER_G.carbs,
    ),
  );

  const weeklyLossKg = (deficitKcal * 7) / KCAL_PER_KG_FAT;
  const toLose = input.weightKg - input.goalWeightKg;

  return {
    kcal,
    protein_g,
    carbs_g,
    fat_g,
    basis: {
      bmr,
      bmrFormula: formula,
      tdee,
      activityFactor: factor,
      deficitKcal,
      weeklyLossKg: Math.round(weeklyLossKg * 100) / 100,
      weeksToGoal: toLose > 0 && weeklyLossKg > 0 ? Math.round(toLose / weeklyLossKg) : null,
    },
  };
}

/**
 * Where the app is heading, and the only figure here that is a preference rather
 * than a measurement.
 */
export const GOAL_WEIGHT_KG = 100;

/**
 * Used when there is no body-composition reading to compute from — a fresh
 * database, or before the first weigh-in. Deliberately the output of
 * `computeTargets` for the reading on file rather than a second set of numbers
 * maintained by hand, so the fallback can never drift from the real thing.
 */
export const FALLBACK_TARGETS: DailyTargets = computeTargets({
  weightKg: 114.8,
  leanMassKg: 79.44,
  heightCm: 193,
  age: 37,
  goalWeightKg: GOAL_WEIGHT_KG,
  sessionsLast28: 7,
});
