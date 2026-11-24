begin;

-- Immutable, content-addressed images. Media is never publicly readable.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('workspace-media', 'workspace-media', false, 2000000, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy workspace_media_owner_read on storage.objects
for select to authenticated
using (bucket_id = 'workspace-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy workspace_media_owner_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'workspace-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ ('^' || (select auth.uid())::text || '/[a-f0-9]{64}\.(jpg|png|webp)$')
);

-- No UPDATE/DELETE grants: content-addressed blobs are immutable. Replaced files
-- remain recoverable; any future garbage collection must check all references.
commit;
