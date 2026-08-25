-- Privileges for `service_role`, the role with no user behind it.
--
-- The previous migration granted `authenticated` and stopped there, which was
-- half the job. `service_role` bypasses RLS, and that is easy to mistake for
-- bypassing everything — it does not. A GRANT is still required, and on the
-- hosted project it was absent, so the background worker's very first query
-- failed with "permission denied for table meal_log".
--
-- That failure was near-invisible: the worker reported it as "No such meal",
-- never incremented `attempts`, and the meal sat saying "analysing" forever.
--
-- This is the role the worker, the reconciler and the importers run as, so it
-- gets write access to everything — including the training tables, which the
-- app itself only reads.

grant usage on schema public to service_role;

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- New objects too, so the next table added does not repeat this.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;
alter default privileges in schema public
  grant execute on functions to service_role;
