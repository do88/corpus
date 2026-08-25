-- Storage for the profile picture.
--
-- Its own bucket rather than a folder inside `meal-photos`, because the two
-- have different lifetimes and different rules: meal photos accumulate forever
-- and are read once by the worker, an avatar is a single object overwritten in
-- place and read on every page. Sharing a bucket would mean one policy trying
-- to describe both.
--
-- Private, like the photos. It is a picture of the owner's face and the paths
-- are guessable, which is the same argument that made `meal-photos` private.
-- Reads go through a signed URL minted server-side.
--
-- 2 MB is generous for an image the UI renders at 72px; the client resizes
-- before upload and this is the ceiling, not the target.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  2 * 1024 * 1024,
  array['image/jpeg', 'image/webp', 'image/png']
)
on conflict (id) do nothing;

-- All four verbs, stated together this time.
--
-- `meal-photos` shipped with select, insert and delete and no update, and the
-- gap only showed when a retry tried to overwrite an object — the first upload
-- worked and every replacement failed. An avatar is *always* an overwrite after
-- the first one, so the same omission here would break the feature on its
-- second use rather than in a corner case.
--
-- `storage` is a shared schema, so these cannot be sandboxed into the throwaway
-- schema the replay check uses — dropping first is what keeps a replay from
-- failing on policies the real run already created.
drop policy if exists "owner reads avatar" on storage.objects;
drop policy if exists "owner writes avatar" on storage.objects;
drop policy if exists "owner updates avatar" on storage.objects;
drop policy if exists "owner deletes avatar" on storage.objects;

create policy "owner reads avatar" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and auth.jwt() ->> 'email' = 'dmitryosipchuk@gmail.com');

create policy "owner writes avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and auth.jwt() ->> 'email' = 'dmitryosipchuk@gmail.com');

create policy "owner updates avatar" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and auth.jwt() ->> 'email' = 'dmitryosipchuk@gmail.com')
  with check (bucket_id = 'avatars' and auth.jwt() ->> 'email' = 'dmitryosipchuk@gmail.com');

create policy "owner deletes avatar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and auth.jwt() ->> 'email' = 'dmitryosipchuk@gmail.com');
