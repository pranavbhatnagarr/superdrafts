-- Allow every signed-in player to manage only the avatar stored inside
-- their own `<auth.uid()>/` folder. Public buckets serve known object URLs
-- without a broad SELECT policy; this narrow SELECT is still required by
-- Storage when an owner replaces an existing object with `upsert: true`.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "avatar owners can insert" on storage.objects;
drop policy if exists "avatar owners can update" on storage.objects;
drop policy if exists "avatar owners can select" on storage.objects;
drop policy if exists "avatar owners can delete" on storage.objects;

create policy "avatar owners can insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "avatar owners can update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "avatar owners can select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "avatar owners can delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
