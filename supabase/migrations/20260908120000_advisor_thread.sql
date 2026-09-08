-- The advisor's thread, which it never had.
--
-- It used to hold the exchange in React state and throw it away on leaving the
-- screen, and that was the right call while the advisor could only see the
-- options you typed: an answer built on what was in the kitchen on Tuesday is
-- worse than no answer. Now that it can look up your own history, the thread
-- is where a preference lives — "no more fish", "I have the shake every
-- morning" — and those are worth keeping between visits.
--
-- One thread, not many. There is one person and one running conversation; a
-- list of threads would be a filing system for something nobody files.
create table advisor_turn (
  id         uuid primary key default gen_random_uuid(),
  -- `summary` is a fold of older turns, written by compaction. It stands in
  -- the history exactly where the turns it replaced used to be.
  role       text not null check (role in ('user', 'model', 'summary')),
  text       text not null check (length(trim(text)) > 0),
  -- The structured recommendation a model turn attached, if it made one: the
  -- pick, its figures and why. Null on a turn that only answered a question.
  advice     jsonb,
  created_at timestamptz not null default now()
);

-- Every read is "the thread, oldest first", and every compaction is "the
-- oldest N". Both are this index.
create index advisor_turn_created_at_idx on advisor_turn (created_at);

alter table advisor_turn enable row level security;

-- Unqualified, so it resolves through search_path — see migration ...821 for
-- why a hard-coded `public.` breaks the migration replay gate.
create policy "owner only" on advisor_turn
  for all
  to authenticated
  using (auth.jwt() ->> 'email' = 'dmitryosipchuk@gmail.com')
  with check (auth.jwt() ->> 'email' = 'dmitryosipchuk@gmail.com');

-- The GRANT is a separate gate from the policy, and forgetting it was a real
-- outage once already: the query fails with "permission denied" before any
-- policy is consulted. See migration ...825.
grant select, insert, delete on advisor_turn to authenticated;

comment on table advisor_turn is
  'The advisor''s single running conversation. Cleared by the person, compacted by the app.';
