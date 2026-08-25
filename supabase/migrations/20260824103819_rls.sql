-- Row level security on everything, with no policies yet.
--
-- That combination is deliberate: RLS with no policy denies all access to the
-- `anon` and `authenticated` roles, so the tables are locked from the moment
-- they exist rather than from whenever the owner policy gets written. The
-- service role bypasses RLS, which is what the importers and the verification
-- gate use.
--
-- The owner policy lands in its own migration once the Google account is
-- confirmed. It is a single-user app, so it will read:
--
--   create policy "owner only" on <table>
--     for all using (auth.jwt() ->> 'email' = '<the account>');
--
-- Guessing the address here would produce a policy that silently matches
-- nobody, which is harder to notice than no policy at all.

do $$
declare
  t text;
begin
  foreach t in array array[
    'workouts', 'workout_exercises', 'sets', 'exercise_templates',
    'routines', 'routine_folders', 'body_measurements',
    'activities', 'body_composition', 'profile', 'meal_log'
  ]
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end
$$;
