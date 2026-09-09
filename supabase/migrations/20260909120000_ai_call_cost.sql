-- What the models cost, one row per call.
--
-- The cost argument for this whole app lives in AGENTS.md — eight models
-- compared, $0.013 a meal, £2.10 a month — and it was measured once, by a
-- benchmark script that has since been deleted. Everything added afterwards
-- went in uncosted. `lib/ai/cost.ts` started logging a price per call; a log
-- line answers "what did that question cost" and cannot answer "what did
-- September cost", which is the only version of the question anybody asks.
--
-- Small by construction: a handful of meals and a few advisor questions a day
-- is a few thousand rows a year. No retention rule, because there is nothing
-- here worth the risk of a delete job.

create table ai_call (
  id                  uuid primary key default gen_random_uuid(),
  at                  timestamptz not null default now(),
  -- Which caller. Checked rather than free text so a typo in a new caller is
  -- a failed insert rather than a category that silently never appears in a
  -- total.
  kind                text not null check (kind in ('advisor', 'meal', 'lookup')),
  -- The model *requested*, not the version the provider reports back: that
  -- arrives dated ("…-001"), which no price table can hold.
  model               text not null,
  input_tokens        integer not null check (input_tokens >= 0),
  -- Prompt tokens served from cache, billed at a tenth. Held separately
  -- because Gemini's promptTokenCount includes them and the split is the
  -- difference between a right and a tenfold-wrong number.
  cached_input_tokens integer not null default 0 check (cached_input_tokens >= 0),
  -- Visible output plus thinking, which is billed at the same rate.
  output_tokens       integer not null check (output_tokens >= 0),
  --
  -- Deliberately nullable, and deliberately without a default.
  --
  -- Null means "this model had no price on file", which is a different fact
  -- from "this call was free". A `not null default 0` would collapse the two
  -- and understate every total that contained one, in silence — the same shape
  -- as an unbounded row cap dropping the oldest days without saying so.
  --
  -- Frozen at write time rather than derived on read. Gemini 3.7 Flash's
  -- introductory rate doubles on 1 January 2027, so a total recomputed later
  -- at today's prices would quietly restate what last year actually cost.
  cost_micros         bigint check (cost_micros >= 0),
  -- Advisor only: how many look-ups that answer made. The figure that explains
  -- why one question costs several times a meal estimate.
  tool_calls          integer check (tool_calls >= 0),
  latency_ms          integer check (latency_ms >= 0)
);

-- Every question of this table is "a period, grouped by kind", and the period
-- is always the leading edge.
create index ai_call_at_idx on ai_call (at desc);

alter table ai_call enable row level security;

-- Unqualified, so it resolves through search_path — see migration ...821 for
-- why a hard-coded `public.` breaks the migration replay gate.
create policy "owner only" on ai_call
  for all
  to authenticated
  using (auth.jwt() ->> 'email' = 'dmitryosipchuk@gmail.com')
  with check (auth.jwt() ->> 'email' = 'dmitryosipchuk@gmail.com');

-- The GRANT is the other gate, and forgetting it was a real outage once
-- already: the query fails with "permission denied" before any policy is
-- consulted. See migration ...825.
--
-- The advisor runs as `authenticated` and inserts its own row; the meal worker
-- runs as `service_role`, which migration ...826 already granted by default
-- privileges, so it needs nothing here. No update and no delete: a record of
-- what was spent is not a thing to edit.
grant select, insert on ai_call to authenticated;

comment on table ai_call is
  'One row per model call, with its cost frozen at the rate in force when it ran.';

-- What a period cost, aggregated where the rows are.
--
-- In SQL rather than in Node, and that is not premature: the sister project's
-- dashboard read its rows into JavaScript behind a `limit`, and once the table
-- outgrew the cap it dropped the oldest days and reported a smaller number
-- without a word. A total that can quietly shrink is worse than no total. This
-- returns a fixed-size object however large the table gets.
--
-- `unpriced` is the honest part. A call whose model had no price on file
-- contributes nothing to the sum, so a total containing one is a floor rather
-- than a figure — and the caller cannot say so unless it is told.
create or replace function ai_spend(window_days integer default 30)
returns jsonb
language sql
stable
as $$
  with scoped as (
    select kind, cost_micros, tool_calls
    from ai_call
    where at >= now() - make_interval(days => window_days)
  )
  select jsonb_build_object(
    'windowDays', window_days,
    'calls',      (select count(*) from scoped),
    'costMicros', (select coalesce(sum(cost_micros), 0) from scoped),
    'unpriced',   (select count(*) from scoped where cost_micros is null),
    'byKind', coalesce((
      select jsonb_agg(k order by k->>'kind')
      from (
        select jsonb_build_object(
                 'kind',       kind,
                 'calls',      count(*),
                 'costMicros', coalesce(sum(cost_micros), 0),
                 'unpriced',   count(*) filter (where cost_micros is null)
               ) as k
        from scoped group by kind
      ) rows
    ), '[]'::jsonb)
  );
$$;

-- Read through the signed-in session like every other query here. `anon` has
-- no business asking what the models cost, and the table's RLS would return
-- nothing to it anyway.
revoke execute on function ai_spend(integer) from anon;

comment on function ai_spend(integer) is
  'Spend over the last N days, by kind, with a count of calls whose model had no price on file.';
