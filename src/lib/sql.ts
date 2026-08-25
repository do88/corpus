import sql from "./db";

/**
 * SQL fragments shared across queries, ported from Alpha 1. Each rule lives
 * here once so a change to what counts as "recent" or "working volume" can't
 * apply to some queries and miss others.
 */

/** Anchor every window to the last logged workout, not to today. */
export const LATEST = sql`(select max(date) from workouts)`;

/**
 * `since("28 days")` → a date relative to the last workout.
 *
 * SQLite's `date(x, '-28 days')` becomes date arithmetic with an interval. The
 * interval text can't be a bind parameter in Postgres — `$1::interval` would
 * work but reads worse — so it is inlined, and callers only ever pass literals
 * built here.
 */
export const since = (interval: string) => sql`(${LATEST} - ${sql.unsafe(`interval '${interval}'`)})`;

/**
 * Assisted machine work (pull-up, dip, chin-up) logs the *assistance* weight,
 * so higher means easier. Counting it as load would invert the meaning, hence
 * it is excluded from every volume figure.
 *
 * Assumes the caller aliases workout_exercises as `we` and sets as `s`.
 */
export const WORKING_VOLUME = sql`
  case when lower(we.title) not like '%assisted%'
       then coalesce(s.weight_kg, 0) * coalesce(s.reps, 0) end
`;

/** Exercises that load the knee through flexion — the constraint being tracked. */
export const KNEE_LOADING = sql`(
  muscle = 'quadriceps'
  or lower(exercise) like '%lunge%'
  or lower(exercise) like '%step up%'
  or lower(exercise) like '%burpee%'
  or lower(exercise) like '%wall ball%'
  or lower(exercise) like '%thruster%'
)`;

/**
 * Monday of a row's week, so bars carry a real date instead of a week number.
 *
 * Alpha 1 computed this by hand from `strftime('%w')`; Postgres has
 * `date_trunc('week')`, which is ISO and therefore already Monday-based.
 */
export const WEEK_START = sql`date_trunc('week', date)::date`;
