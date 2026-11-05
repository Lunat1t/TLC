-- A private image bucket. PDFs remain in Google Drive and are never copied here.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('instruction-assets', 'instruction-assets', false, 26214400,
  array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Instruction admin uploads"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'instruction-assets' and public.is_instruction_admin());
create policy "Instruction admin updates"
  on storage.objects for update to authenticated
  using (bucket_id = 'instruction-assets' and public.is_instruction_admin())
  with check (bucket_id = 'instruction-assets' and public.is_instruction_admin());
create policy "Instruction admin deletes"
  on storage.objects for delete to authenticated
  using (bucket_id = 'instruction-assets' and public.is_instruction_admin());
create policy "Instruction admin reads"
  on storage.objects for select to authenticated
  using (bucket_id = 'instruction-assets' and public.is_instruction_admin());

create policy "Published instruction covers"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'instruction-assets' and public.is_published_cover_object(name));

-- Public cover and active-launch read policies are added with the launch migration,
-- after those entities exist. No public bucket or permanent public URL is created.
