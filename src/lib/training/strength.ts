/**
 * The strength-o-meter: four barbell lifts as one number.
 *
 * It replaced a chart of estimated one-rep maxes by quarter — four lines on
 * one axis, read once and then scrolled past. The question that chart was
 * answering is "am I as strong as I was?", and that has a one-number answer:
 * the lifts added up, against the same lifts at their best.
 *
 * ## Like for like
 *
 * A lift with no set in the recent window is left out of *both* sums, not
 * counted as zero. Four months off overhead press says nothing about the other
 * three, and a zero would drag the total down by seventy kilos and then report
 * it as lost strength. The lift is named instead, so the smaller total is
 * explained rather than silently smaller.
 *
 * "Best" is each lift's own all-time peak, added up. Those peaks were rarely
 * on the same day, so it is a ceiling you have touched piece by piece rather
 * than a total you once lifted — which is the honest reading of a meter
 * against it, and why it is called your best and not your record.
 */

export type LiftReading = {
  key: string;
  short: string;
  /** Best estimated one-rep max in the recent window, kg. */
  current: number | null;
  /** Best estimated one-rep max ever, kg. */
  peak: number | null;
};

export type StrengthMeter = {
  /** The counted lifts' current maxes, added up, kg. */
  total: number;
  /** The same lifts at their all-time peaks, added up, kg. */
  best: number;
  /** total as a percentage of best, whole number. */
  pctOfBest: number;
  /** total ÷ bodyweight, one decimal. Null without a weight to divide by. */
  timesBodyweight: number | null;
  lifts: { key: string; short: string; kg: number }[];
  /** Lifts with nothing in the recent window, left out of both sums. */
  missing: string[];
};

type Counted = LiftReading & { current: number; peak: number };

export function strengthMeter(
  lifts: readonly LiftReading[],
  bodyweightKg: number | null,
): StrengthMeter | null {
  const counted = lifts.filter((lift): lift is Counted => lift.current != null && lift.peak != null);
  if (counted.length === 0) return null;

  const total = Math.round(counted.reduce((sum, lift) => sum + lift.current, 0));
  const best = Math.round(counted.reduce((sum, lift) => sum + lift.peak, 0));

  return {
    total,
    best,
    pctOfBest: Math.round((total / best) * 100),
    timesBodyweight: bodyweightKg && bodyweightKg > 0 ? Math.round((total / bodyweightKg) * 10) / 10 : null,
    lifts: counted.map((lift) => ({ key: lift.key, short: lift.short, kg: Math.round(lift.current) })),
    missing: lifts.filter((lift) => lift.current == null).map((lift) => lift.short),
  };
}
