/**
 * How far the weight has moved, for the figure beside the chart.
 *
 * Measured from the last reading on or before the cutoff, and the date of that
 * reading travels with the number. Weigh-ins are irregular — a fortnight of
 * daily readings, then nothing for a month — so the reading nearest "ninety
 * days ago" can be a hundred and twenty days old. A label that said "in 90
 * days" over a four-month change would be the chart quietly lying about its
 * own axis; "since 12 May" is true whatever the gaps were.
 */

export type WeightPoint = { date: string; kg: number };

export function weightChange(
  series: readonly WeightPoint[],
  days = 90,
): { kg: number; since: string } | null {
  const latest = series.at(-1);
  if (!latest) return null;

  const cutoff = new Date(Date.parse(latest.date.slice(0, 10)) - days * 86_400_000).toISOString().slice(0, 10);
  const then = series.findLast((point) => point.date.slice(0, 10) <= cutoff);
  if (!then) return null;

  return { kg: Math.round((latest.kg - then.kg) * 10) / 10, since: then.date.slice(0, 10) };
}
