import type { Sql, TransactionSql } from "postgres";
import { inZone, toDay } from "../time";

/**
 * Pull the Hevy account into Postgres, straight from their API.
 *
 * This replaces a pipeline that only existed on one laptop: a Python script in
 * a sibling repo downloaded the account into SQLite, and a port script then
 * truncated every training table and reloaded it. Three moving parts, two of
 * them machine-bound, and the middle one has since been deleted. Hevy has a
 * real API, so none of it was necessary.
 *
 * **Upsert, never truncate.** The old port emptied the tables first because
 * the verification gate needed the two databases byte-identical — the right
 * call for a one-time port and the wrong one for something on a schedule,
 * where a truncate is a data-loss event waiting for a bad night.
 *
 * The whole account is re-fetched each run rather than only what changed.
 * Hevy pages at ten, so a few hundred workouts is a few dozen requests: far
 * cheaper than the bookkeeping incremental sync would need, and it means every
 * run repairs whatever a previous one got wrong.
 *
 * Lives here rather than in the script so the scheduled route and the manual
 * lever run the same code, for the same reason `processMeal` is shared by the
 * estimate job and the sweep.
 */

const API = "https://api.hevyapp.com/v1";

/**
 * A partial fetch must not be mistaken for a shrunken account.
 *
 * Workouts deleted in Hevy are deleted here too, which is what keeps the two
 * in step. But "the API returned fewer than are stored" has two causes and
 * only one of them is a real deletion; the other is paging that failed
 * halfway. Below this share, the run keeps what it has and says so.
 */
const MIN_KEEP_RATIO = 0.9;

export type HevyCounts = {
  workouts: number;
  workout_exercises: number;
  sets: number;
  exercise_templates: number;
  /** True when deletion was skipped because the fetch looked partial. */
  keptOrphans: boolean;
};

/**
 * The API shape, declared rather than validated.
 *
 * Every field below lands in a typed Postgres column, so a response that does
 * not match fails the insert loudly instead of writing something wrong — the
 * database is the check, and a zod schema in front of it would only restate
 * the table definition.
 */
type HevySet = {
  index: number;
  type: string | null;
  weight_kg: number | null;
  reps: number | null;
  distance_meters: number | null;
  duration_seconds: number | null;
  rpe: number | null;
  custom_metric: number | null;
};

type HevyExercise = {
  index: number;
  title: string | null;
  notes: string | null;
  exercise_template_id: string | null;
  superset_id: number | null;
  sets: HevySet[] | null;
};

type HevyWorkout = {
  id: string;
  title: string | null;
  routine_id: string | null;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  created_at: string | null;
  updated_at: string | null;
  exercises: HevyExercise[] | null;
};

type HevyTemplate = {
  id: string;
  title: string | null;
  type: string | null;
  primary_muscle_group: string | null;
  secondary_muscle_groups: string[] | null;
  equipment: string | null;
  is_custom: boolean | null;
};

type Row = Record<string, string | number | boolean | null>;
type Page<T> = { page_count?: number } & Record<string, T[] | number | undefined>;

/** One page, with the retry a scheduled job needs and a person does not. */
async function fetchPage<T>(key: string, path: string, page: number, pageSize: number): Promise<Page<T>> {
  const url = `${API}/${path}?page=${page}&pageSize=${pageSize}`;
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { headers: { "api-key": key } });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      return (await response.json()) as Page<T>;
    } catch (thrown) {
      if (attempt === 3) throw new Error(`hevy ${path} page ${page}: ${(thrown as Error).message}`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
}

/** Every page of a collection. `page_count` counts pages, not rows. */
async function fetchAll<T>(key: string, path: string, field: string, pageSize: number): Promise<T[]> {
  const first = await fetchPage<T>(key, path, 1, pageSize);
  const rows: T[] = [...((first[field] as T[] | undefined) ?? [])];
  for (let page = 2; page <= (first.page_count ?? 1); page++) {
    const next = await fetchPage<T>(key, path, page, pageSize);
    rows.push(...((next[field] as T[] | undefined) ?? []));
  }
  return rows;
}

/** Minutes between two ISO timestamps, to one decimal, matching the stored values. */
function durationMin(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const span = (Date.parse(end) - Date.parse(start)) / 60_000;
  return Number.isFinite(span) ? Math.round(span * 10) / 10 : null;
}

async function insertChunked(tx: TransactionSql, table: string, rows: Row[]) {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]);
  for (let i = 0; i < rows.length; i += 500) {
    await tx`insert into ${tx(table)} ${tx(rows.slice(i, i + 500) as never, columns)}`;
  }
}

export async function syncHevy(sql: Sql, apiKey: string): Promise<HevyCounts> {
  const workouts = await fetchAll<HevyWorkout>(apiKey, "workouts", "workouts", 10);
  const templates = await fetchAll<HevyTemplate>(apiKey, "exercise_templates", "exercise_templates", 100);

  // The calendar date in London, not the tracking day: the 04:00 rule is a
  // food-logging idea, and a workout belongs to the date on the wall clock.
  const workoutRows = workouts.map((w) => ({
    id: w.id,
    title: w.title ?? null,
    routine_id: w.routine_id || null,
    description: w.description ?? null,
    start_time: w.start_time ?? null,
    end_time: w.end_time ?? null,
    created_at: w.created_at ?? null,
    updated_at: w.updated_at ?? null,
    date: w.start_time ? toDay(inZone(new Date(w.start_time))) : null,
    duration_min: durationMin(w.start_time ?? null, w.end_time ?? null),
  }));

  const exerciseRows = workouts.flatMap((w) =>
    (w.exercises ?? []).map((e) => ({
      workout_id: w.id,
      exercise_index: e.index,
      title: e.title ?? null,
      notes: e.notes ?? null,
      exercise_template_id: e.exercise_template_id ?? null,
      superset_id: e.superset_id ?? null,
    })),
  );

  const setRows = workouts.flatMap((w) =>
    (w.exercises ?? []).flatMap((e) =>
      (e.sets ?? []).map((s) => ({
        workout_id: w.id,
        exercise_index: e.index,
        set_index: s.index,
        type: s.type ?? null,
        weight_kg: s.weight_kg ?? null,
        reps: s.reps ?? null,
        distance_meters: s.distance_meters ?? null,
        duration_seconds: s.duration_seconds ?? null,
        rpe: s.rpe ?? null,
        custom_metric: s.custom_metric ?? null,
      })),
    ),
  );

  const templateRows = templates.map((t) => ({
    id: t.id,
    title: t.title ?? null,
    type: t.type ?? null,
    primary_muscle_group: t.primary_muscle_group ?? null,
    secondary_muscle_groups: JSON.stringify(t.secondary_muscle_groups ?? []),
    equipment: t.equipment ?? null,
    is_custom: Boolean(t.is_custom),
  }));

  const [{ count: stored }] = await sql<{ count: number }[]>`
    select count(*)::int as count from workouts`;
  const partial = stored > 0 && workoutRows.length < stored * MIN_KEEP_RATIO;

  // One transaction: a run either lands completely or changes nothing, so a
  // failure part-way cannot leave a workout holding half its sets.
  await sql.begin(async (tx) => {
    const ids = workoutRows.map((w) => w.id as string);

    // Children before parents, and by workout rather than wholesale, so a set
    // removed inside an edited workout disappears here too.
    await tx`delete from sets where workout_id = any(${ids})`;
    await tx`delete from workout_exercises where workout_id = any(${ids})`;
    await tx`delete from workouts where id = any(${ids})`;

    if (!partial) {
      await tx`delete from sets where workout_id <> all(${ids})`;
      await tx`delete from workout_exercises where workout_id <> all(${ids})`;
      await tx`delete from workouts where id <> all(${ids})`;
    }

    await insertChunked(tx, "workouts", workoutRows);
    await insertChunked(tx, "workout_exercises", exerciseRows);
    await insertChunked(tx, "sets", setRows);

    // A flat catalogue with a stable key, so it replaces in place.
    await tx`delete from exercise_templates where id = any(${templateRows.map((t) => t.id as string)})`;
    await insertChunked(tx, "exercise_templates", templateRows);
  });

  return {
    workouts: workoutRows.length,
    workout_exercises: exerciseRows.length,
    sets: setRows.length,
    exercise_templates: templateRows.length,
    keptOrphans: partial,
  };
}
