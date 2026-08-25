-- The new table Alpha 1 never had: one row per logged meal.

-- A meal eaten at 1am belongs to the night before, not to the morning after.
-- The day therefore rolls at 04:00 rather than midnight, and every date in the
-- app goes through this function so the rule lives in exactly one place.
create function local_day(ts timestamptz)
returns date
language sql
stable
as $$
  select ((ts at time zone 'Europe/London') - interval '4 hours')::date
$$;

comment on function local_day is
  'The day a timestamp counts toward. The day boundary is 04:00 Europe/London, '
  'so a post-midnight meal is credited to the previous day.';

create table meal_log (
  id            uuid primary key default gen_random_uuid(),
  logged_at     timestamptz not null default now(),
  local_date    date not null,
  status        text not null default 'pending'
                  check (status in ('pending', 'analyzed', 'failed')),
  attempts      int  not null default 0,

  photo_path    text,
  note          text,                   -- typed or transcribed

  -- Totals are derived from `items` by the app, never asked of the model; see
  -- lib/meal/schema.ts. They are stored so a query never has to unpack jsonb.
  kcal          int,
  protein_g     int,
  carbs_g       int,
  fat_g         int,
  items         jsonb,                  -- [{name, qty, kcal, protein_g, ...}]

  confidence    text check (confidence in ('low', 'medium', 'high')),
  assumptions   text,
  edited        boolean not null default false,   -- user corrected the estimate

  model         text,
  raw_response  jsonb,
  error         text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index on meal_log (local_date);
create index on meal_log (status) where status = 'pending';

-- moddatetime ships with Supabase; no reason to hand-roll the trigger.
create extension if not exists moddatetime with schema extensions;

create trigger meal_log_updated_at
  before update on meal_log
  for each row
  execute function extensions.moddatetime (updated_at);
