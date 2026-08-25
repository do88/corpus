-- The UPDATE policy the photo upload has always needed.
--
-- `outbox/sync.ts` uploads with `upsert: true`, deliberately: a retry names the
-- object after the meal's client id so it overwrites its own earlier upload
-- rather than littering the bucket with orphans. Supabase Storage implements
-- that overwrite as an UPDATE on `storage.objects`, and requires a policy for
-- it — migration ...822 created select, insert and delete, and stopped there.
--
-- So the path failed exactly when it mattered. First upload: fine, INSERT. But
-- the case the upsert exists for — photo uploaded, response lost on a bad
-- connection, outbox retries — hit the missing policy, threw, and sent the meal
-- back to the outbox to fail the same way on every subsequent flush. A meal
-- with a photo could get permanently stuck on a connection bad enough to drop a
-- response, which is precisely the connection this app is built for.
--
-- Same shape and same owner rule as the other three. Both `using` and
-- `with check`: the first decides which existing rows may be updated, the
-- second what they may be updated to, and omitting either leaves half the
-- operation ungoverned.
drop policy if exists "owner updates meal photos" on storage.objects;

create policy "owner updates meal photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'meal-photos' and auth.jwt() ->> 'email' = 'dmitryosipchuk@gmail.com')
  with check (bucket_id = 'meal-photos' and auth.jwt() ->> 'email' = 'dmitryosipchuk@gmail.com');

-- Revoke-by-default for anything added to `public` later.
--
-- Migration ...825 revoked `anon`'s privileges on the tables that existed at
-- the time, which is a snapshot rather than a rule. The next table created
-- inherits whatever the creating role's defaults grant — which is exactly the
-- local/hosted divergence that caused the original outage, in the opposite
-- direction. ...826 set defaults for `service_role`; this states the matching
-- rule for `anon`, so a new table is unreachable to it without a deliberate
-- grant.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;
