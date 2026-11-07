-- Teachers may edit published cards through the existing publishing permission.
-- Keep the privileged update atomic and restrict uploaded covers to the caller's own objects.
create or replace function public.update_instruction_card_admin(
  p_instruction_id uuid, p_title text, p_summary text, p_kit text, p_topics text[],
  p_file_id text, p_file_size bigint, p_cover_object_key text default null,
  p_cover_mime_type text default null, p_cover_size bigint default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_instruction public.instructions%rowtype;
  v_old_file_id text;
  v_target_asset_id uuid;
  v_cover_asset_id uuid;
begin
  if auth.uid() is null or not public.can_publish_instruction() then
    raise exception 'teacher required' using errcode='42501';
  end if;
  if length(trim(p_title)) not between 1 and 120 or length(coalesce(p_summary, '')) > 1000
    or p_kit not in ('spike','ev3') or p_file_id is null
    or p_file_id !~ '^[a-zA-Z0-9_-]{10,200}$'
    or (p_file_size is not null and p_file_size not between 1 and 100000000)
    or coalesce(cardinality(p_topics), 0) > 12
    or exists (select 1 from unnest(coalesce(p_topics, '{}')) topic where length(topic) not between 1 and 40)
    or ((p_cover_object_key is null) <> (p_cover_mime_type is null))
    or ((p_cover_object_key is null) <> (p_cover_size is null)) then
    raise exception 'invalid instruction';
  end if;
  if p_cover_object_key is not null and (
    p_cover_object_key !~ '^covers/[0-9a-f-]{36}\.(jpg|png|webp)$'
    or p_cover_mime_type not in ('image/jpeg','image/png','image/webp')
    or p_cover_size not between 1 and 3145728
    or (p_cover_mime_type = 'image/jpeg' and p_cover_object_key !~ '\.jpg$')
    or (p_cover_mime_type = 'image/png' and p_cover_object_key !~ '\.png$')
    or (p_cover_mime_type = 'image/webp' and p_cover_object_key !~ '\.webp$')
  ) then raise exception 'invalid cover'; end if;

  if p_cover_object_key is not null and not public.is_instruction_admin() and not exists (
    select 1 from storage.objects
    where bucket_id = 'instruction-assets'
      and name = p_cover_object_key
      and owner_id = auth.uid()::text
  ) then
    raise exception 'own cover required' using errcode='42501';
  end if;

  select * into v_instruction from public.instructions
  where id = p_instruction_id and status = 'published' for update;
  if not found then raise exception 'instruction not found' using errcode='P0002'; end if;

  select source_file_id into v_old_file_id from public.instruction_assets
  where instruction_id = p_instruction_id and kind = 'document' and is_current for update;
  if v_old_file_id is distinct from p_file_id then
    if p_file_size is null then raise exception 'PDF size required'; end if;
    if exists (select 1 from public.instruction_assets where source_provider='google_drive'
      and source_file_id=p_file_id and instruction_id <> p_instruction_id) then
      raise exception 'PDF already used' using errcode='23505';
    end if;
    update public.instruction_assets set is_current=false
      where instruction_id=p_instruction_id and kind='document' and is_current;
    select id into v_target_asset_id from public.instruction_assets
      where instruction_id=p_instruction_id and kind='document'
        and source_provider='google_drive' and source_file_id=p_file_id limit 1;
    if v_target_asset_id is null then
      insert into public.instruction_assets(instruction_id,kind,mime_type,byte_size,source_provider,source_file_id,is_current)
      values(p_instruction_id,'document','application/pdf',p_file_size,'google_drive',p_file_id,true);
    else
      update public.instruction_assets set is_current=true,byte_size=p_file_size where id=v_target_asset_id;
    end if;
  end if;

  if p_cover_object_key is not null then
    insert into public.instruction_assets(instruction_id,kind,object_key,mime_type,byte_size,is_current)
    values(p_instruction_id,'cover',p_cover_object_key,p_cover_mime_type,p_cover_size,true)
    returning id into v_cover_asset_id;
  end if;

  update public.instructions set title=trim(p_title), summary=trim(coalesce(p_summary,'')),
    kit=p_kit, topics=coalesce(p_topics,'{}'),
    cover_asset_id=coalesce(v_cover_asset_id,cover_asset_id),
    rights_attested_by=auth.uid(), rights_attested_at=now()
  where id=p_instruction_id;
  return p_instruction_id;
end; $$;
revoke all on function public.update_instruction_card_admin(uuid,text,text,text,text[],text,bigint,text,text,bigint) from public,anon;
grant execute on function public.update_instruction_card_admin(uuid,text,text,text,text[],text,bigint,text,text,bigint) to authenticated;
