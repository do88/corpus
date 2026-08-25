-- Publish meal_log changes so the phone hears the worker finish.
--
-- Realtime respects RLS, so a subscriber only receives rows a policy already
-- lets them read — the owner policy on meal_log applies here unchanged.
--
-- `replica identity full` is what makes an UPDATE carry the whole row rather
-- than just the primary key. Without it the estimate arriving would push a
-- payload containing an id and nothing else, and the UI would have to refetch
-- to learn what actually changed.
alter table meal_log replica identity full;

do $$
begin
  alter publication supabase_realtime add table meal_log;
exception when duplicate_object then
  null;   -- already published; a replay from zero must not fail here
end
$$;
