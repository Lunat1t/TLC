alter table public.instruction_assets
  add column if not exists is_current boolean not null default true;

with ranked_documents as (
  select id, row_number() over (partition by instruction_id order by created_at, id) as position
  from public.instruction_assets
  where kind = 'document'
)
update public.instruction_assets a
set is_current = (ranked_documents.position = 1)
from ranked_documents
where a.id = ranked_documents.id;

create unique index if not exists instruction_assets_one_current_document
  on public.instruction_assets(instruction_id)
  where kind = 'document' and is_current;

create or replace function public.search_instruction_cards(
  p_kit text default null,
  p_query text default null,
  p_after_time timestamptz default null,
  p_after_id uuid default null,
  p_limit integer default 21
)
returns table (
  id uuid, slug text, title text, summary text, kit text, topics text[],
  cover_asset_id uuid, has_pdf boolean, published_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select i.id, i.slug, i.title, i.summary, i.kit, i.topics, i.cover_asset_id,
    document.source_file_id is not null, i.published_at
  from public.instructions i
  left join lateral (
    select a.source_file_id
    from public.instruction_assets a
    where a.instruction_id = i.id and a.kind = 'document'
      and a.source_provider = 'google_drive' and a.source_file_id is not null and a.is_current
    limit 1
  ) document on true
  where i.status = 'published'
    and (p_kit is null or i.kit = p_kit)
    and (nullif(trim(p_query), '') is null or i.title ilike '%' || p_query || '%'
      or exists (select 1 from unnest(i.topics) topic where topic ilike '%' || p_query || '%'))
    and (p_after_time is null or (i.published_at, i.id) < (p_after_time, p_after_id))
  order by i.published_at desc, i.id desc
  limit least(greatest(p_limit, 1), 50);
$$;
revoke all on function public.search_instruction_cards(text, text, timestamptz, uuid, integer) from public;
grant execute on function public.search_instruction_cards(text, text, timestamptz, uuid, integer) to anon, authenticated;

create or replace function public.published_instruction_drive_file(p_slug text)
returns text language sql stable security definer set search_path = public as $$
  select a.source_file_id
  from public.instructions i
  join public.instruction_assets a on a.instruction_id = i.id
  where i.slug = p_slug and i.status = 'published' and a.kind = 'document'
    and a.source_provider = 'google_drive' and a.source_file_id is not null and a.is_current
  limit 1;
$$;
revoke all on function public.published_instruction_drive_file(text) from public;
grant execute on function public.published_instruction_drive_file(text) to anon, authenticated;

create or replace function public.publish_drive_instruction(
  p_title text, p_kit text, p_slug text, p_file_id text, p_size bigint,
  p_summary text, p_topics text[], p_cover_object_key text,
  p_cover_mime_type text, p_cover_size bigint
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  instruction_id uuid;
  v_cover_asset_id uuid;
begin
  if auth.uid() is null or not public.can_publish_instruction() then
    raise exception 'teacher required' using errcode='42501';
  end if;
  if length(trim(p_title)) not between 1 and 120 or length(coalesce(p_summary, '')) > 1000
    or p_kit not in ('spike','ev3') or p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or p_file_id !~ '^[a-zA-Z0-9_-]{10,200}$' or p_size not between 1 and 100000000
    or coalesce(cardinality(p_topics), 0) > 12
    or exists (select 1 from unnest(coalesce(p_topics, '{}')) topic where length(topic) not between 1 and 40)
    or p_cover_object_key !~ '^covers/[0-9a-f-]{36}\.(jpg|png|webp)$'
    or p_cover_mime_type not in ('image/jpeg','image/png','image/webp')
    or p_cover_size not between 1 and 3145728 then
    raise exception 'invalid instruction';
  end if;

  if not public.is_instruction_admin() and not exists (
    select 1 from storage.objects where bucket_id='instruction-assets'
      and name=p_cover_object_key and owner_id=auth.uid()::text
  ) then raise exception 'Own cover required' using errcode='42501'; end if;

  insert into public.instructions(slug,title,summary,kit,topics,status,published_at,rights_attested_by,rights_attested_at)
  values(p_slug,trim(p_title),trim(coalesce(p_summary,'')),p_kit,coalesce(p_topics,'{}'),'published',now(),auth.uid(),now())
  returning id into instruction_id;

  insert into public.instruction_assets(instruction_id,kind,object_key,mime_type,byte_size,is_current)
  values(instruction_id,'cover',p_cover_object_key,p_cover_mime_type,p_cover_size,true)
  returning id into v_cover_asset_id;
  update public.instructions set cover_asset_id = v_cover_asset_id where id = instruction_id;

  insert into public.instruction_assets(instruction_id,kind,mime_type,byte_size,source_provider,source_file_id,is_current)
  values(instruction_id,'document','application/pdf',p_size,'google_drive',p_file_id,true);
  return instruction_id;
end; $$;
revoke all on function public.publish_drive_instruction(text,text,text,text,bigint,text,text[],text,text,bigint) from public,anon;
grant execute on function public.publish_drive_instruction(text,text,text,text,bigint,text,text[],text,text,bigint) to authenticated;

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
  if auth.uid() is null or not public.is_instruction_admin() then
    raise exception 'admin required' using errcode='42501';
  end if;
  if length(trim(p_title)) not between 1 and 120 or length(coalesce(p_summary, '')) > 1000
    or p_kit not in ('spike','ev3') or p_file_id !~ '^[a-zA-Z0-9_-]{10,200}$'
    or p_file_size not between 1 and 100000000 or coalesce(cardinality(p_topics), 0) > 12
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

  select * into v_instruction from public.instructions
  where id = p_instruction_id and status = 'published' for update;
  if not found then raise exception 'instruction not found' using errcode='P0002'; end if;

  select source_file_id into v_old_file_id from public.instruction_assets
  where instruction_id = p_instruction_id and kind = 'document' and is_current for update;
  if v_old_file_id is distinct from p_file_id then
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
