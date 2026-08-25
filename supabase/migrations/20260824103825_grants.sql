-- Explicit privileges for the signed-in role.
--
-- This was a real production outage, and worth understanding rather than just
-- fixing. Postgres has two independent gates: a GRANT decides whether a role
-- may touch a table at all, and RLS decides which rows it then sees. RLS was
-- correct from the start; the GRANT was missing, so the query failed with
-- "permission denied for table meal_log" before any policy was consulted.
--
-- It worked locally and failed on the hosted project because the two apply
-- different default privileges — `supabase db push` creates tables as a role
-- whose defaults do not include the API roles. Relying on those defaults is
-- what made the difference invisible until it was live.
--
-- So: stated outright, and least privilege while we are here. The training
-- tables are written only by the importers, which use the secret key and bypass
-- all of this; the app only ever reads them.

grant usage on schema public to authenticated;

-- Read-only: the app never writes training history.
grant select on
  workouts, workout_exercises, sets, exercise_templates,
  routines, routine_folders, body_measurements,
  activities, body_composition, profile,
  v_sets, v_workouts
  to authenticated;

-- The one table the app writes.
grant select, insert, update, delete on meal_log to authenticated;

grant execute on function local_day(timestamptz) to authenticated;

-- `anon` is revoked outright rather than left to inherit. Nothing in this app
-- is public, and the local stack had in fact granted anon full CRUD by default
-- — RLS still returned nothing, so it was not a leak, but "the policy happens
-- to be empty" is a weaker guarantee than "the role cannot reach the table".
-- Revoking makes both environments agree and makes the intent legible.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
