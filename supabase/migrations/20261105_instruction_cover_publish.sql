create function public.publish_drive_instruction(
  p_title text,
  p_kit text,
  p_slug text,
  p_file_id text,
  p_size bigint,
  p_cover_object_key text,
  p_cover_mime_type text,
  p_cover_size bigint
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  instruction_id uuid;
  v_cover_asset_id uuid;
begin
  if auth.uid() is null or not public.is_instruction_admin() then
    raise exception 'admin required' using errcode='42501';
  end if;
  if length(trim(p_title)) not between 1 and 120
    or p_kit not in ('spike','ev3')
    or p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or p_file_id !~ '^[a-zA-Z0-9_-]{10,200}$'
    or p_size not between 1 and 100000000
    or p_cover_object_key !~ '^covers/[0-9a-f-]{36}\.(jpg|png|webp)$'
    or p_cover_mime_type not in ('image/jpeg','image/png','image/webp')
    or p_cover_size not between 1 and 3145728
    or (p_cover_mime_type = 'image/jpeg' and p_cover_object_key !~ '\.jpg$')
    or (p_cover_mime_type = 'image/png' and p_cover_object_key !~ '\.png$')
    or (p_cover_mime_type = 'image/webp' and p_cover_object_key !~ '\.webp$') then
    raise exception 'invalid instruction';
  end if;

  insert into public.instructions(slug,title,kit,status,published_at,rights_attested_by,rights_attested_at)
  values(p_slug,trim(p_title),p_kit,'published',now(),auth.uid(),now())
  returning id into instruction_id;

  insert into public.instruction_assets(instruction_id,kind,object_key,mime_type,byte_size)
  values(instruction_id,'cover',p_cover_object_key,p_cover_mime_type,p_cover_size)
  returning id into v_cover_asset_id;
  update public.instructions set cover_asset_id = v_cover_asset_id
  where id = instruction_id;

  insert into public.instruction_assets(instruction_id,kind,mime_type,byte_size,source_provider,source_file_id)
  values(instruction_id,'document','application/pdf',p_size,'google_drive',p_file_id);
  return instruction_id;
end; $$;

revoke all on function public.publish_drive_instruction(text,text,text,text,bigint,text,text,bigint) from public,anon;
grant execute on function public.publish_drive_instruction(text,text,text,text,bigint,text,text,bigint) to authenticated;
