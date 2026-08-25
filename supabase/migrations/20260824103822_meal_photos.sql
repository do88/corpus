-- Storage for meal photos.
--
-- Private bucket. The photos are of the owner's food, in the owner's house —
-- a public bucket would make every one of them readable by anyone who guessed
-- a path, and object paths are guessable by design (they are just names).
-- Reads go through signed URLs instead.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meal-photos',
  'meal-photos',
  false,
  2 * 1024 * 1024,   -- the client resizes to ~200 KB; this is a ceiling, not a target
  array['image/jpeg', 'image/webp', 'image/png']
)
on conflict (id) do nothing;

-- Same owner rule as every table. `storage.objects` already has RLS enabled by
-- Supabase, so these policies are what grant access rather than restrict it.
--
-- `storage` is a shared schema, so these cannot be sandboxed into the throwaway
-- schema the replay check uses — dropping first is what keeps a replay from
-- failing on policies the real run already created.
drop policy if exists "owner reads meal photos" on storage.objects;
drop policy if exists "owner writes meal photos" on storage.objects;
drop policy if exists "owner deletes meal photos" on storage.objects;

create policy "owner reads meal photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'meal-photos' and auth.jwt() ->> 'email' = 'dmitryosipchuk@gmail.com');

create policy "owner writes meal photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'meal-photos' and auth.jwt() ->> 'email' = 'dmitryosipchuk@gmail.com');

create policy "owner deletes meal photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'meal-photos' and auth.jwt() ->> 'email' = 'dmitryosipchuk@gmail.com');
