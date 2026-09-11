/**
 * The order a day's meals are shown in: latest first.
 *
 * Stated as a sort rather than inherited from the array, which is what it used
 * to be. Today reversed whatever order the meals arrived in, and the database
 * returns them by time, so it looked right — until a meal's time was edited.
 * The edit replaced the row where it already sat, so a milkshake moved to 07:30
 * kept its place at the top of the day, now labelled with a time that
 * contradicted its position. Insertion order and time order agreed only as long
 * as nobody corrected anything, and correcting things is the feature.
 *
 * Times are compared as instants, not as strings. The database hands back
 * `+00:00` and a row built on the phone says `Z`, and the two sort differently
 * character by character while meaning the same moment.
 *
 * Ties fall back to the id, so two meals logged in the same second keep a
 * stable order instead of swapping places whenever the list re-renders.
 */
export function timelineOrder<T extends { id: string; logged_at: string }>(meals: readonly T[]): T[] {
  return [...meals].sort(
    (a, b) => Date.parse(b.logged_at) - Date.parse(a.logged_at) || a.id.localeCompare(b.id),
  );
}
