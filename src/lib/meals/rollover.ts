import { weekOf } from "./repository";
import type { MealRow } from "./repository";

/**
 * Calories left unspent earlier in the week, available today.
 *
 * A fixed daily goal is easier to live with than a moving one, but it is also
 * blind to the fact that eating is not evenly distributed across a week. A
 * quiet Tuesday and a dinner out on Friday can average out perfectly well and
 * still read as two failures against a flat line. Banking the shortfall makes
 * the week the unit that matters, which is the unit it always actually was.
 *
 * Monday to Sunday, and it empties every Monday. Anything not spent by Sunday
 * night is gone — a budget that never resets stops being a budget.
 *
 * Two rules do most of the work here:
 *
 * A day with nothing logged banks nothing. This is the one that matters, and
 * the obvious implementation gets it wrong: an unlogged Tuesday looks exactly
 * like a Tuesday you ate nothing on, and would hand over a whole day's
 * allowance for the crime of forgetting to open the app. No record, no claim.
 *
 * Only surpluses are carried, never debts. Going over on Monday does not shrink
 * Tuesday. That is what was asked for, and it is the kinder half of the idea —
 * but it does mean the week's total can only grow, so this is a cushion for
 * light days rather than a strict weekly budget.
 */

export type Rollover = {
  /** Calories banked from earlier days this week. */
  banked: number;
  /** How many days contributed, for saying where it came from. */
  fromDays: number;
};

export const NO_ROLLOVER: Rollover = { banked: 0, fromDays: 0 };

export function rolloverFor(day: string, baseKcal: number, meals: MealRow[]): Rollover {
  const earlier = weekOf(day).filter((d) => d < day);
  if (earlier.length === 0) return NO_ROLLOVER;

  // Days are counted only if something was analysed on them. Pending and
  // failed meals are excluded for the same reason they are excluded from the
  // day's totals: their calories are not known yet, and treating an unfinished
  // day as a light one would bank calories that the estimate is about to spend.
  const consumed = new Map<string, number>();
  for (const meal of meals) {
    if (meal.status !== "analyzed") continue;
    consumed.set(meal.local_date, (consumed.get(meal.local_date) ?? 0) + (meal.kcal ?? 0));
  }

  let banked = 0;
  let fromDays = 0;
  for (const past of earlier) {
    const eaten = consumed.get(past);
    if (eaten === undefined) continue; // nothing logged: no claim
    const surplus = baseKcal - eaten;
    if (surplus <= 0) continue;
    banked += surplus;
    fromDays += 1;
  }

  return { banked: Math.round(banked), fromDays };
}

/** The goal for a given day: the fixed target, plus whatever was banked. */
export function allowanceFor(baseKcal: number, rollover: Rollover): number {
  return baseKcal + rollover.banked;
}
