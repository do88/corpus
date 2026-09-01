-- Foods you eat again: named once, priced once, replayed after that.
--
-- The archive already existed — `meal_log` holds every item you have ever
-- logged, with its macros. What it lacked was identity. Two hundred protein
-- shakes were two hundred independent estimates of the same glass, each one
-- costing a model call, a three-second wait and a slightly different number.
--
-- A saved food fixes the numbers. Logging one copies them rather than asking
-- for them again, which is the whole point: the same shake is the same figure
-- every morning, it is instant, it costs nothing, and it works with no signal.
-- An estimate that varies by 15% on identical input cannot be calibrated away
-- by a weigh-in; a replayed one has no variance at all.

create table saved_food (
  id            uuid primary key default gen_random_uuid(),

  -- What you call it. Free text, because "shake" is a better name than any
  -- canonical one and this list has exactly one reader.
  name          text not null check (length(trim(name)) > 0),

  -- The same shape as meal_log.items, so a saved food can be replayed into a
  -- meal without translation, and so the per-item breakdown survives. Storing
  -- only totals would make "the shake plus the banana" unsplittable later.
  items         jsonb not null,

  -- Denormalised from `items` by the app, exactly as meal_log does it, so a
  -- list query never unpacks jsonb to sort or display.
  kcal          int not null,
  protein_g     int not null,
  carbs_g       int not null,
  fat_g         int not null,

  -- Carried over from the estimate this came from. It is the sentence that
  -- says which portion was assumed, and it is the thing you read when the
  -- number looks wrong a month later.
  assumptions   text,

  -- Where it came from. Nulled rather than cascaded: deleting the meal you
  -- happened to save this from must not delete the saved food, which has had
  -- its own life since.
  source_meal_id uuid references meal_log(id) on delete set null,

  -- Ordering the list by what you actually eat beats ordering it
  -- alphabetically. Maintained by the app on each log.
  times_used    int not null default 0,
  last_used_at  timestamptz,

  -- Archived, not deleted. A meal logged from this keeps its own copy of the
  -- macros, so removing the row would not corrupt history — but a list you can
  -- only ever add to becomes a list you stop using, and a hard delete of
  -- something referenced by `meal_log.saved_food_id` loses the provenance.
  archived_at   timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- One name, once. Partial, so an archived "shake" does not block a new one —
-- renaming by archiving and recreating is a reasonable thing to do.
create unique index saved_food_live_name
  on saved_food (lower(trim(name)))
  where archived_at is null;

-- The list's own sort order: most used first, then most recent.
create index saved_food_ranking
  on saved_food (times_used desc, last_used_at desc nulls last)
  where archived_at is null;

comment on table saved_food is
  'Foods logged often enough to be worth naming. Logging one copies its macros '
  'rather than re-estimating them, so a repeated meal is identical every time.';

-- Provenance on the meal side. A meal that came from the saved list did not
-- involve the model at all, and both the card and the estimator want to know
-- that: the card to say so, the estimator to leave those figures alone.
alter table meal_log
  add column saved_food_id uuid references saved_food(id) on delete set null;

create index meal_log_saved_food on meal_log (saved_food_id)
  where saved_food_id is not null;

alter table saved_food enable row level security;

-- Unqualified, so it resolves through search_path — see migration ...821 for
-- why a hard-coded `public.` breaks the migration replay gate.
create policy "owner only" on saved_food
  for all
  to authenticated
  using (auth.jwt() ->> 'email' = 'dmitryosipchuk@gmail.com')
  with check (auth.jwt() ->> 'email' = 'dmitryosipchuk@gmail.com');

-- The GRANT is a separate gate from the policy, and forgetting it was a real
-- outage once already: the query fails with "permission denied" before any
-- policy is consulted. See migration ...825.
grant select, insert, update, delete on saved_food to authenticated;

create trigger saved_food_updated_at
  before update on saved_food
  for each row
  execute function extensions.moddatetime (updated_at);
