import sql from "./db";
import { KNEE_LOADING, WEEK_START, WORKING_VOLUME, since } from "./sql";

/**
 * Analysis layer, ported from Alpha 1's SQLite. A few conventions that apply
 * throughout:
 *
 * - e1RM uses Epley (w * (1 + reps/30)). It is only meaningful for
 *   weight_reps exercises with both a load and a rep count.
 * - Assisted machine work (assisted pull-up/dip/chin-up) logs the *assistance*
 *   weight, so higher = easier. Counting it as load would invert the meaning,
 *   so it is excluded from every volume and e1RM figure and flagged in the UI.
 * - "Knee load" is a rep count, not a tonnage — the constraint being tracked is
 *   accumulated knee-flexion reps, which is what actually triggers a flare.
 *
 * The port keeps the shape of every result identical to Alpha 1's, because the
 * verification gate diffs the two. Where the dialects differ the Postgres form
 * is used — `to_char` for date parts, `string_agg` for `GROUP_CONCAT`, an
 * explicit `::numeric` for two-argument `round` — but nothing is restructured.
 */

/**
 * `key` doubles as a CSS custom-property name inside the chart container, so it
 * has to stay a bare slug — the Hevy exercise title lives in `name`.
 */
export const MAIN_LIFTS = [
  { key: "deadlift", name: "Deadlift (Barbell)", short: "Deadlift" },
  { key: "squat", name: "Squat (Barbell)", short: "Squat" },
  { key: "bench", name: "Bench Press (Barbell)", short: "Bench Press" },
  { key: "ohp", name: "Overhead Press (Barbell)", short: "Overhead Press" },
] as const;

export type Lift = (typeof MAIN_LIFTS)[number];

/* ---------------------------------------------------------------- profile */

export async function getProfile(): Promise<Record<string, string>> {
  const rows = await sql<{ key: string; value: string }[]>`
    select key, value from profile
  `;
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export type BodyReading = {
  date: string;
  weight_kg: number;
  bmi: number;
  body_fat_kg: number;
  body_fat_pct: number;
  skeletal_muscle_kg: number;
  fat_free_mass_kg: number;
  visceral_fat: number;
  body_water_kg: number;
  body_water_pct: number;
  muscle_mass_kg: number;
  protein_pct: number;
  bmr_kcal: number;
  metabolic_age: number;
  subcutaneous_fat_pct: number;
};

export async function getBodyReadings() {
  return sql<BodyReading[]>`
    select * from body_composition order by date desc
  `;
}

/** Hevy's own weight log — sparser, but goes back further than the scale export. */
export async function getWeightHistory() {
  return sql<{ date: string; weight_kg: number }[]>`
    select date, weight_kg from (
      select date, weight_kg from body_measurements where weight_kg is not null
      union
      select date, weight_kg from body_composition where weight_kg is not null
    ) h order by date
  `;
}

/* --------------------------------------------------------------- headline */

export async function getHeadline() {
  // Two statements, run together. Neither reads the other's result, and on a
  // pooled connection a sequential pair is two full round trips rather than
  // one — the same mistake `getDashboardData` fixed at the level above.
  const [[row], [cadence]] = await Promise.all([
    sql<
    {
      total_workouts: number;
      first_date: string;
      last_date: string;
      total_sets: number;
      total_hours: number;
    }[]
  >`
    select count(*)::int                              as total_workouts,
           min(date)                                  as first_date,
           max(date)                                  as last_date,
           (select count(*)::int from sets)           as total_sets,
           round(sum(duration_min)::numeric / 60.0)   as total_hours
    from workouts
  `,
    sql<{ last_28: number; prev_28: number }[]>`
    select
      (select count(*)::int from workouts where date > ${since("28 days")}) as last_28,
      (select count(*)::int from workouts where date > ${since("56 days")}
         and date <= ${since("28 days")})                                   as prev_28
  `,
  ]);

  return { ...row, ...cadence };
}

/* --------------------------------------------------------------- strength */

/** Best e1RM per quarter per main lift — smooth enough to read as a trend. */
export async function getStrengthByQuarter() {
  const rows = await sql<{ period: string; exercise: string; e1rm: number }[]>`
    select to_char(date, 'YYYY') || '-Q' || extract(quarter from date)::int as period,
           exercise,
           round(max(e1rm_kg)::numeric, 1)                                  as e1rm
    from v_sets
    where exercise in ${sql(MAIN_LIFTS.map((l) => l.name))}
      and e1rm_kg is not null
    group by period, exercise
    order by period
  `;

  const periods = [...new Set(rows.map((r) => r.period))];
  return periods.map((period) => {
    const point: Record<string, string | number | null> = { period };
    for (const lift of MAIN_LIFTS) {
      point[lift.key] =
        rows.find((r) => r.period === period && r.exercise === lift.name)?.e1rm ?? null;
    }
    return point;
  });
}

/**
 * One query for all four lifts, where it used to be twelve.
 *
 * Three facts are wanted per lift — best e1RM ever, best in the last 120 days,
 * and the heaviest single set — and the old shape asked for each of them one
 * lift at a time. Parallelising the twelve helped locally and not at all in
 * production: on a pooled connection `prepare` is off, so every parameterised
 * query blocks its connection until it completes, and twelve of them queue.
 *
 * `distinct on (exercise)` is Postgres's answer to "top row per group" and does
 * the same work in a single pass.
 *
 * Each branch orders by `date desc` last, which the per-lift version did not,
 * and that turned out to matter. A 140kg × 6 deadlift appears on 2026-07-13 and
 * again on 2022-12-17 — the same e1RM to the last decimal — so "the best set"
 * was a genuine tie that `limit 1` resolved by whichever row the plan happened
 * to reach first. Rewriting the query changed the plan and with it the answer:
 * the peak date jumped back four years while the peak itself stayed at 168.
 *
 * The old behaviour was never chosen, only observed. `date desc` states the
 * intended reading — the most recent date you hit your best — and makes the
 * answer independent of the plan. Same class of bug as the `string_agg`
 * ordering in the README, found the same way: the gate.
 *
 * Anchored on the lift list so a lift with no sets still comes back, as a row
 * of nulls, exactly as `[undefined]` did before.
 */
export async function getLiftSummary() {
  const names = MAIN_LIFTS.map((lift) => lift.name);

  const rows = await sql<
    {
      exercise: string;
      peak_e1rm: number | null;
      peak_date: string | null;
      current_e1rm: number | null;
      current_date: string | null;
      best_weight: number | null;
      best_reps: number | null;
    }[]
  >`
    with target as (
      select unnest(${names}::text[]) as exercise
    ),
    peak as (
      select distinct on (exercise)
             exercise, round(e1rm_kg::numeric, 1) as e1rm, date
      from v_sets
      where exercise = any(${names}::text[]) and e1rm_kg is not null
      order by exercise, e1rm_kg desc, date desc
    ),
    recent as (
      select distinct on (exercise)
             exercise, round(e1rm_kg::numeric, 1) as e1rm, date
      from v_sets
      where exercise = any(${names}::text[]) and e1rm_kg is not null
        and date > ${since("120 days")}
      order by exercise, e1rm_kg desc, date desc
    ),
    heaviest as (
      select distinct on (exercise)
             exercise, weight_kg, reps
      from v_sets
      where exercise = any(${names}::text[]) and weight_kg is not null
      order by exercise, weight_kg desc, reps desc, date desc
    )
    select t.exercise,
           p.e1rm      as peak_e1rm,
           p.date      as peak_date,
           r.e1rm      as current_e1rm,
           r.date      as current_date,
           h.weight_kg as best_weight,
           h.reps      as best_reps
    from target t
    left join peak     p on p.exercise = t.exercise
    left join recent   r on r.exercise = t.exercise
    left join heaviest h on h.exercise = t.exercise
  `;

  // Mapped over MAIN_LIFTS rather than over the rows, so the order the
  // dashboard renders in stays the order declared here rather than whatever
  // the join returns.
  return MAIN_LIFTS.map((lift) => {
    const row = rows.find((r) => r.exercise === lift.name);
    const peak = row?.peak_e1rm ?? null;
    const current = row?.current_e1rm ?? null;

    return {
      key: lift.key,
      short: lift.short,
      peak,
      peakDate: row?.peak_date ?? null,
      current,
      currentDate: row?.current_date ?? null,
      bestSet:
        row?.best_weight != null ? `${row.best_weight}kg × ${row.best_reps}` : null,
      pctOfPeak: peak && current ? Math.round((current / peak) * 100) : null,
    };
  });
}

/* ------------------------------------------------------------------ load */

export async function getSessionsByMonth(months = 24) {
  return sql<{ month: string; sessions: number; volume_t: number }[]>`
    select to_char(date, 'YYYY-MM')                                        as month,
           count(distinct w.id)::int                                       as sessions,
           round(coalesce(sum(${WORKING_VOLUME}), 0)::numeric / 1000.0, 1) as volume_t
    from workouts w
    left join workout_exercises we on we.workout_id = w.id
    left join sets s on s.workout_id = w.id and s.exercise_index = we.exercise_index
    where date > ${since(`${months} months`)}
    group by month order by month
  `;
}

/**
 * Weekly knee-flexion rep count. This is the constraint that actually matters
 * for the right knee: it tolerates heavy load but flares on accumulated reps.
 * Running is tracked alongside in km since it is impact rather than flexion.
 */
export async function getKneeLoadByWeek(weeks = 26) {
  return sql<
    { week_start: string; knee_reps: number; run_km: number; breakdown: string | null }[]
  >`
    with bounds as (select ${since(`${weeks * 7} days`)} as since),
    knee_sets as (
      select ${WEEK_START} as week_start, exercise, coalesce(reps, 0) as reps
      from v_sets, bounds
      where date > bounds.since and ${KNEE_LOADING}
    ),
    per_exercise as (
      select week_start, exercise, sum(reps) as reps
      from knee_sets group by week_start, exercise
    ),
    lifting as (
      select week_start,
             sum(reps)::int as knee_reps,
             -- Alpha 1 ordered a subquery and hoped GROUP_CONCAT preserved it;
             -- Postgres lets the ordering be stated where it belongs. The name
             -- is the tiebreaker: without it two exercises on equal reps come
             -- back in whatever order the plan happens to produce.
             string_agg(exercise || ' ' || reps, ' · ' order by reps desc, exercise) as breakdown
      from per_exercise
      group by week_start
    ),
    running as (
      select ${WEEK_START} as week_start,
             round(sum(coalesce(distance_km, 0))::numeric, 1) as run_km
      from activities, bounds
      where date > bounds.since and activity_type = 'Running'
      group by week_start
    ),
    all_weeks as (
      select week_start from lifting union select week_start from running
    )
    select all_weeks.week_start,
           coalesce(lifting.knee_reps, 0) as knee_reps,
           coalesce(running.run_km, 0)    as run_km,
           lifting.breakdown              as breakdown
    from all_weeks
    left join lifting using (week_start)
    left join running using (week_start)
    order by all_weeks.week_start
  `;
}

export async function getMuscleBalance(months = 12) {
  return sql<{ muscle: string; sets: number; pct: number }[]>`
    with recent as (
      select muscle from v_sets
      where date > ${since(`${months} months`)} and muscle is not null
    )
    select muscle, count(*)::int as sets,
           round(100.0 * count(*) / (select count(*) from recent), 1) as pct
    from recent group by muscle order by sets desc
  `;
}

/* ----------------------------------------------------------- conditioning */

export async function getRuns() {
  return sql<
    {
      date: string;
      distance_km: number;
      duration_min: number;
      calories: number;
      avg_hr: number;
      max_hr: number;
      pace: number;
    }[]
  >`
    select date, distance_km, duration_min, calories, avg_hr, max_hr,
           avg_pace_sec_per_km as pace
    from activities where activity_type = 'Running' order by date
  `;
}

/* --------------------------------------------------------------- sessions */

export async function getRecentSessions(limit = 8) {
  const sessions = await sql<
    {
      id: string;
      date: string;
      title: string;
      duration_min: number;
      n_sets: number;
      volume_t: number;
    }[]
  >`
    select w.id, w.date, w.title, w.duration_min,
           count(s.set_index)::int                                as n_sets,
           round(sum(${WORKING_VOLUME})::numeric / 1000.0, 1)     as volume_t
    from workouts w
    left join workout_exercises we on we.workout_id = w.id
    left join sets s on s.workout_id = w.id and s.exercise_index = we.exercise_index
    group by w.id order by w.date desc limit ${limit}
  `;

  if (sessions.length === 0) return [];

  /**
   * Every session's exercises in one query, where it used to be one per
   * session — eight more round trips at the default limit, each blocking its
   * connection on a pooled endpoint.
   *
   * `workout_id = any(...)` over the ids just fetched. Grouping by
   * `workout_id` as well as the exercise keeps the rows separable afterwards,
   * and the `order by` carries the per-workout exercise order out with them so
   * the split below does not have to re-sort.
   */
  const rows = await sql<
    { workout_id: string; exercise: string; detail: string }[]
  >`
    select workout_id, exercise,
           string_agg(
             case when weight_kg > 0 then weight_kg::int::text || '×' || reps
                  when reps > 0      then reps::text
                  else '—' end, '  ' order by set_index) as detail
    from v_sets
    where workout_id = any(${sessions.map((s) => s.id)}::text[])
    group by workout_id, exercise_index, exercise
    order by workout_id, exercise_index
  `;

  const byWorkout = new Map<string, { exercise: string; detail: string }[]>();
  for (const { workout_id, exercise, detail } of rows) {
    // Appended in the order the query returned, which is exercise_index.
    const list = byWorkout.get(workout_id);
    if (list) list.push({ exercise, detail });
    else byWorkout.set(workout_id, [{ exercise, detail }]);
  }

  return sessions.map((s) => ({ ...s, exercises: byWorkout.get(s.id) ?? [] }));
}

/* ------------------------------------------------------------------ watch */

/**
 * The watch's tables, unlike the training ones, are keyed to the calendar
 * rather than to the last workout — a week with no session is still a week
 * the watch recorded — so these use `current_date` rather than `since()`.
 */

/** Weekly movement: the watch's intensity minutes beside the log's sessions. */
export async function getWeeklyMovement(weeks = 12) {
  const days = weeks * 7;
  return sql<
    { week_start: string; who_minutes: number; moderate: number; vigorous: number; sessions: number; steps: number }[]
  >`
    with weeks as (
      select generate_series(
        date_trunc('week', current_date - ${days}::int)::date + 7,
        date_trunc('week', current_date)::date,
        interval '1 week'
      )::date as week_start
    ),
    watch as (
      select date_trunc('week', day)::date as w,
             sum(moderate_min)::int as moderate, sum(vigorous_min)::int as vigorous,
             round(avg(steps))::int as steps
      from garmin_daily where day >= current_date - ${days}::int group by 1
    ),
    lifted as (
      select date_trunc('week', date)::date as w, count(*)::int as sessions
      from workouts where date >= current_date - ${days}::int group by 1
    )
    select weeks.week_start::text                                         as week_start,
           coalesce(watch.moderate, 0) + 2 * coalesce(watch.vigorous, 0)  as who_minutes,
           coalesce(watch.moderate, 0)                                    as moderate,
           coalesce(watch.vigorous, 0)                                    as vigorous,
           coalesce(lifted.sessions, 0)                                   as sessions,
           coalesce(watch.steps, 0)                                       as steps
    from weeks
    left join watch  on watch.w  = weeks.week_start
    left join lifted on lifted.w = weeks.week_start
    order by weeks.week_start
  `;
}

/** Resting heart rate, averaged by month. A slow signal, read slowly. */
export async function getRestingHrByMonth(months = 18) {
  return sql<{ month: string; rhr: number; n: number }[]>`
    select to_char(date_trunc('month', day), 'YYYY-MM') as month,
           round(avg(resting_hr))::int                   as rhr,
           count(*)::int                                 as n
    from garmin_daily
    where resting_hr > 0
      and day >= (date_trunc('month', current_date) - interval '1 month' * ${months - 1}::int)::date
    group by 1 order by 1
  `;
}

/** Sleep by week: hours a night and minutes awake. Not Garmin's score. */
export async function getWeeklySleep(weeks = 12) {
  return sql<{ week_start: string; hours: number; awake_min: number; nights: number }[]>`
    select date_trunc('week', day)::date::text     as week_start,
           round(avg(total_min) / 60.0, 1)::float   as hours,
           round(avg(awake_min))::int               as awake_min,
           count(*)::int                            as nights
    from garmin_sleep
    where total_min > 0 and day >= current_date - ${weeks * 7}::int
    group by 1 order by 1
  `;
}

/** The last thirty days from the watch, as one row for the headline. */
export async function getWatchSummary() {
  const [row] = await sql<
    {
      steps: number | null;
      rhr: number | null;
      burn: number | null;
      who_minutes_week: number | null;
      sleep_hours: number | null;
      awake_min: number | null;
      days: number;
    }[]
  >`
    select round(avg(d.steps))::int                                                  as steps,
           round(avg(d.resting_hr))::int                                             as rhr,
           round(avg(d.calories_total))::int                                         as burn,
           round((sum(d.moderate_min) + 2 * sum(d.vigorous_min)) / (30 / 7.0))::int  as who_minutes_week,
           (select round(avg(total_min) / 60.0, 1)::float from garmin_sleep
             where total_min > 0 and day > current_date - 30)                        as sleep_hours,
           (select round(avg(awake_min))::int from garmin_sleep
             where total_min > 0 and day > current_date - 30)                        as awake_min,
           count(*)::int                                                             as days
    from garmin_daily d
    where d.calories_total > 0 and d.day > current_date - 30
  `;
  return row;
}
