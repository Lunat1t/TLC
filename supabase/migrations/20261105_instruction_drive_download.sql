-- Published catalog cards may expose that they have a PDF. The download route
-- resolves its Drive file ID server-side and redirects to Drive's webContentLink.
alter table public.instruction_assets
  drop constraint if exists instruction_assets_source_contract_check;
alter table public.instruction_assets
  drop column if exists source_revision_verified,
  drop column if exists source_revision;

drop function if exists public.search_instruction_cards(text, text, timestamptz, uuid, integer);

create function public.search_instruction_cards(
  p_kit text default null,
  p_query text default null,
  p_after_time timestamptz default null,
  p_after_id uuid default null,
  p_limit integer default 21
)
returns table (
  id uuid,
  slug text,
  title text,
  summary text,
  kit text,
  topics text[],
  cover_asset_id uuid,
  has_pdf boolean,
  published_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select i.id, i.slug, i.title, i.summary, i.kit, i.topics, i.cover_asset_id,
    document.source_file_id is not null, i.published_at
  from public.instructions i
  left join lateral (
    select a.source_file_id
    from public.instruction_assets a
    where a.instruction_id = i.id
      and a.kind = 'document'
      and a.source_provider = 'google_drive'
      and a.source_file_id is not null
    order by a.created_at, a.id
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
returns text
language sql stable security definer set search_path = public as $$
  select a.source_file_id
  from public.instructions i
  join public.instruction_assets a on a.instruction_id = i.id
  where i.slug = p_slug
    and i.status = 'published'
    and a.kind = 'document'
    and a.source_provider = 'google_drive'
    and a.source_file_id is not null
  order by a.created_at, a.id
  limit 1;
$$;
revoke all on function public.published_instruction_drive_file(text) from public;
grant execute on function public.published_instruction_drive_file(text) to anon, authenticated;
