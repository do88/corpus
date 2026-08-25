-- Alpha 1's SQLite schema, ported to Postgres.
--
-- The port is mostly about types SQLite never had. Dates were TEXT and are now
-- proper `date`/`timestamptz`; the columns that held serialised JSON are
-- `jsonb`; the 0/1 flag is a boolean. Column names are unchanged so the ported
-- queries stay recognisable against the originals.
--
-- SQLite's REAL is an 8-byte float, so it maps to `double precision`. Postgres
-- `real` is 4-byte and would quietly shift every volume sum and e1RM — small
-- enough to look like rounding, large enough to fail the verification gate.

create table workouts (
  id            text primary key,
  title         text,
  routine_id    text,
  description   text,
  start_time    timestamptz,
  end_time      timestamptz,
  created_at    timestamptz,
  updated_at    timestamptz,
  date          date,          -- the day it counts toward, derived from start_time
  duration_min  double precision
);

create table workout_exercises (
  workout_id            text    not null,
  exercise_index        integer not null,
  title                 text,
  notes                 text,
  exercise_template_id  text,
  superset_id           integer,
  primary key (workout_id, exercise_index)
);

create table sets (
  workout_id        text    not null,
  exercise_index    integer not null,
  set_index         integer not null,
  type              text,
  weight_kg         double precision,
  reps              integer,
  distance_meters   double precision,
  duration_seconds  double precision,
  rpe               double precision,
  custom_metric     double precision,
  primary key (workout_id, exercise_index, set_index)
);

create table exercise_templates (
  id                        text primary key,
  title                     text,
  type                      text,
  primary_muscle_group      text,
  secondary_muscle_groups   jsonb,
  equipment                 text,
  is_custom                 boolean
);

create table routines (
  id          text primary key,
  title       text,
  folder_id   text,
  -- Hevy accepts `notes` on write but never returns them on read, so this
  -- column is only ever as good as what we last sent.
  notes       text,
  created_at  timestamptz,
  updated_at  timestamptz,
  raw         jsonb
);

create table routine_folders (
  id     text primary key,
  title  text,
  raw    jsonb
);

create table body_measurements (
  id         bigint primary key,
  date       date,
  weight_kg  double precision,
  raw        jsonb
);

create table activities (
  id                   text primary key,   -- "<type>|<start_time>"
  activity_type        text,
  start_time           timestamptz,
  date                 date,
  title                text,
  distance_km          double precision,
  duration_min         double precision,
  calories             integer,
  avg_hr               integer,
  max_hr               integer,
  aerobic_te           double precision,
  avg_pace_sec_per_km  double precision,
  total_ascent_m       double precision,
  steps                integer
);

create table body_composition (
  date                   date primary key,
  weight_kg              double precision,
  bmi                    double precision,
  body_fat_kg            double precision,
  body_fat_pct           double precision,
  skeletal_muscle_kg     double precision,
  skeletal_muscle_pct    double precision,
  fat_free_mass_kg       double precision,
  subcutaneous_fat_pct   double precision,
  visceral_fat           double precision,
  body_water_kg          double precision,
  body_water_pct         double precision,
  muscle_mass_kg         double precision,
  muscle_mass_pct        double precision,
  bone_mass_kg           double precision,
  bone_mass_pct          double precision,
  protein_kg             double precision,
  protein_pct            double precision,
  bmr_kcal               double precision,
  metabolic_age          double precision,
  source                 text
);

create table profile (
  key    text primary key,
  value  text
);

create index idx_workouts_date  on workouts (date);
create index idx_we_template    on workout_exercises (exercise_template_id);
create index idx_sets_workout   on sets (workout_id);
create index idx_activities_date on activities (date);

-- `security_invoker` matters: without it a view runs with its owner's rights
-- and reads straight past the RLS on the tables underneath it.
create view v_sets with (security_invoker = true) as
select
  w.id                    as workout_id,
  w.date                  as date,
  w.title                 as workout_title,
  w.duration_min          as duration_min,
  we.exercise_index,
  s.set_index,
  we.title                as exercise,
  we.exercise_template_id,
  t.primary_muscle_group  as muscle,
  t.equipment,
  t.type                  as exercise_type,
  s.type                  as set_type,
  s.weight_kg,
  s.reps,
  s.rpe,
  s.distance_meters,
  s.duration_seconds,
  coalesce(s.weight_kg, 0) * coalesce(s.reps, 0) as volume_kg,
  case when s.weight_kg > 0 and s.reps > 0
       then s.weight_kg * (1 + s.reps / 30.0) end as e1rm_kg
from sets s
join workout_exercises we
  on we.workout_id = s.workout_id and we.exercise_index = s.exercise_index
join workouts w on w.id = s.workout_id
left join exercise_templates t on t.id = we.exercise_template_id;

create view v_workouts with (security_invoker = true) as
select
  w.id, w.date, w.title, w.duration_min,
  count(distinct we.exercise_index) as n_exercises,
  count(s.set_index)                as n_sets,
  sum(coalesce(s.weight_kg, 0) * coalesce(s.reps, 0)) as volume_kg,
  sum(coalesce(s.reps, 0))          as total_reps
from workouts w
left join workout_exercises we on we.workout_id = w.id
left join sets s on s.workout_id = w.id and s.exercise_index = we.exercise_index
group by w.id;
