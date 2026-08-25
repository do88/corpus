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

export async function getLiftSummary() {
  return Promise.all(
    MAIN_LIFTS.map(async (lift) => {
      // Three independent lookups per lift, in parallel. Sequentially this was
      // twelve round trips for four lifts.
      const [[peak], [current], [best]] = await Promise.all([
        sql<{ e1rm: number; date: string }[]>`
        select round(e1rm_kg::numeric, 1) as e1rm, date from v_sets
        where exercise = ${lift.name} and e1rm_kg is not null
        order by e1rm_kg desc limit 1
      `,
        sql<{ e1rm: number; date: string }[]>`
        select round(e1rm_kg::numeric, 1) as e1rm, date from v_sets
        where exercise = ${lift.name} and e1rm_kg is not null
          and date > ${since("120 days")}
        order by e1rm_kg desc limit 1
      `,
        sql<{ weight_kg: number; reps: number; date: string }[]>`
        select weight_kg, reps, date from v_sets
        where exercise = ${lift.name} and weight_kg is not null
        order by weight_kg desc, reps desc limit 1
      `,
      ]);

      return {
        key: lift.key,
        short: lift.short,
        peak: peak?.e1rm ?? null,
        peakDate: peak?.date ?? null,
        current: current?.e1rm ?? null,
        currentDate: current?.date ?? null,
        bestSet: best ? `${best.weight_kg}kg × ${best.reps}` : null,
        pctOfPeak: peak && current ? Math.round((current.e1rm / peak.e1rm) * 100) : null,
      };
    }),
  );
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

  return Promise.all(
    sessions.map(async (s) => ({
      ...s,
      exercises: await sql<{ exercise: string; detail: string }[]>`
        select exercise,
               string_agg(
                 case when weight_kg > 0 then weight_kg::int::text || '×' || reps
                      when reps > 0      then reps::text
                      else '—' end, '  ' order by set_index) as detail
        from v_sets where workout_id = ${s.id}
        group by exercise_index, exercise order by exercise_index
      `,
    })),
  );
}
