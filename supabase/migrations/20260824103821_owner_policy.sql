-- The owner policy. Single-user app: one Google account sees everything, and
-- nobody else sees anything.
--
-- The address is checked against the JWT rather than a user id so the policy
-- keeps working if the account is ever re-created — the email is the identity
-- here, not the uuid. `auth.jwt()` returns null for an unauthenticated request,
-- so `anon` matches nothing and is denied by the RLS that migration ...819
-- already switched on.
--
-- `to authenticated` keeps the policy off the anon role entirely rather than
-- relying on the comparison to fail. The service role bypasses RLS regardless,
-- which is what the importers and the verification gate run as.

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
    -- Unqualified, so it resolves through search_path. A hard-coded `public.`
    -- would reach past the throwaway schema that scripts/verify-migrations.sh
    -- replays into, and collide with the real tables.
    execute format($f$
      create policy "owner only" on %I
        for all
        to authenticated
        using (auth.jwt() ->> 'email' = 'dmitryosipchuk@gmail.com')
        with check (auth.jwt() ->> 'email' = 'dmitryosipchuk@gmail.com')
    $f$, t);
  end loop;
end
$$;
