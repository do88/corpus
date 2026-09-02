/**
 * How GarminDB's SQLite values become this app's columns.
 *
 * GarminDB writes through SQLAlchemy into SQLite, which has no date or time
 * types, so everything temporal arrives as text in SQLAlchemy's own formats:
 *
 *   DateTime  "2026-09-01 00:00:00.000000"   (a `day` column carries midnight)
 *   Time      "07:42:15.000000"               (a duration, never past 24h)
 *
 * Pure functions, tested on their own, because the port script that uses them
 * only ever runs against one person's real database and a wrong conversion
 * there would be a wrong number on a screen with nothing to compare it to.
 */

/** "2026-09-01 00:00:00.000000" -> "2026-09-01". Null through. */
export function dayOf(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  return match ? match[1] : null;
}

/**
 * A SQLAlchemy Time to whole minutes.
 *
 * "01:05:30" -> 66 (rounded), "00:00:00" -> 0. GarminDB uses `time.min` as
 * its "no value" default rather than NULL, so a zero is indistinguishable
 * from absent and is returned as 0, not null — callers should treat 0 as
 * "nothing recorded" where that matters.
 */
export function minutesOf(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const match = /^(\d{1,2}):(\d{2}):(\d{2})(?:\.\d+)?$/.exec(String(value).trim());
  if (!match) return null;
  const [, h, m, s] = match;
  return Number(h) * 60 + Number(m) + Math.round(Number(s) / 60);
}

/** A SQLAlchemy DateTime to an ISO instant, or null. Local to the watch's zone. */
export function instantOf(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().replace(" ", "T");
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** An integer, or null for anything that is not one. */
export function intOf(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function floatOf(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** GarminDB's `daily_summary` row, as `garmin_daily`. */
export function toDaily(row: Record<string, unknown>) {
  const day = dayOf(row.day);
  if (!day) return null;
  return {
    day,
    resting_hr: intOf(row.rhr),
    hr_min: intOf(row.hr_min),
    hr_max: intOf(row.hr_max),
    steps: intOf(row.steps),
    step_goal: intOf(row.step_goal),
    calories_total: intOf(row.calories_total),
    calories_bmr: intOf(row.calories_bmr),
    calories_active: intOf(row.calories_active),
    moderate_min: minutesOf(row.moderate_activity_time),
    vigorous_min: minutesOf(row.vigorous_activity_time),
    stress_avg: intOf(row.stress_avg),
    body_battery_max: intOf(row.bb_max),
    body_battery_min: intOf(row.bb_min),
  };
}

/** GarminDB's `sleep` row, as `garmin_sleep`. */
export function toSleep(row: Record<string, unknown>) {
  const day = dayOf(row.day);
  if (!day) return null;
  return {
    day,
    start_at: instantOf(row.start),
    end_at: instantOf(row.end),
    total_min: minutesOf(row.total_sleep),
    deep_min: minutesOf(row.deep_sleep),
    light_min: minutesOf(row.light_sleep),
    rem_min: minutesOf(row.rem_sleep),
    awake_min: minutesOf(row.awake),
    score: intOf(row.score),
    qualifier: row.qualifier == null ? null : String(row.qualifier),
    avg_spo2: floatOf(row.avg_spo2),
    avg_rr: floatOf(row.avg_rr),
  };
}

export type GarminDailyInsert = NonNullable<ReturnType<typeof toDaily>>;
export type GarminSleepInsert = NonNullable<ReturnType<typeof toSleep>>;
