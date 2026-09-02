-- What the watch knows about each day.
--
-- Two tables, ported from GarminDB's SQLite (scripts/port-garmin.mts) and
-- narrowed to the columns this app has a use for. GarminDB itself holds far
-- more — per-minute heart rate, every activity's GPS trace — and none of it
-- belongs here until a screen wants it. A table nobody reads is a schema
-- somebody still has to understand.
--
-- The reason the first one exists: the account screen estimates maintenance
-- from a formula and an activity factor guessed off session counts. The watch
-- measures it. `calories_total` averaged over a week is the number the whole
-- calorie goal is set against, and until now it was the crudest figure in the
-- app.
--
-- Additive, by design. The Hevy port truncates and reloads; this one upserts
-- by day, so re-running it after `garmindb_cli.py --latest` adds the new days
-- and rewrites any that Garmin revised, and never touches the training tables.

create table garmin_daily (
  day               date primary key,

  resting_hr        int,
  hr_min            int,
  hr_max            int,

  steps             int,
  step_goal         int,

  -- Garmin's own split: total burn, the resting part of it, and what was
  -- earned by moving. `calories_total` is the maintenance figure.
  calories_total    int,
  calories_bmr      int,
  calories_active   int,

  -- Intensity minutes, the WHO-style count the watch keeps.
  moderate_min      int,
  vigorous_min      int,

  stress_avg        int,
  body_battery_max  int,
  body_battery_min  int,

  imported_at       timestamptz not null default now()
);

comment on table garmin_daily is
  'One row per day from Garmin Connect, via GarminDB. calories_total is the '
  'measured maintenance the calorie goal is judged against.';

create table garmin_sleep (
  day         date primary key,   -- the morning it ended on, as Garmin files it
  start_at    timestamptz,
  end_at      timestamptz,

  total_min   int,
  deep_min    int,
  light_min   int,
  rem_min     int,
  awake_min   int,

  score       int,                -- Garmin's 0–100
  qualifier   text,               -- "Good", "Fair", …
  avg_spo2    double precision,
  avg_rr      double precision,

  imported_at timestamptz not null default now()
);

comment on table garmin_sleep is
  'One row per night from Garmin Connect, via GarminDB. Durations in minutes.';

alter table garmin_daily enable row level security;
alter table garmin_sleep enable row level security;

-- Unqualified, so it resolves through search_path — see migration ...821 for
-- why a hard-coded `public.` breaks the migration replay gate.
create policy "owner only" on garmin_daily
  for all
  to authenticated
  using (auth.jwt() ->> 'email' = 'dmitryosipchuk@gmail.com')
  with check (auth.jwt() ->> 'email' = 'dmitryosipchuk@gmail.com');

create policy "owner only" on garmin_sleep
  for all
  to authenticated
  using (auth.jwt() ->> 'email' = 'dmitryosipchuk@gmail.com')
  with check (auth.jwt() ->> 'email' = 'dmitryosipchuk@gmail.com');

-- Read-only for the app, like the training tables: the port script writes
-- with the direct connection and bypasses all of this. The GRANT is a
-- separate gate from the policy and forgetting it was an outage once — see
-- migration ...825.
grant select on garmin_daily, garmin_sleep to authenticated;
