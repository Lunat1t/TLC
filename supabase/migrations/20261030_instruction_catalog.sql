-- Catalog metadata is public only while published. Steps and private assets are admin-only at table level.
create table if not exists public.instructions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null default '',
  summary text not null default '',
  kit text not null check (kit in ('spike','ev3')),
  topics text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','published','archived')),
  cover_asset_id uuid,
  rights_attested_by uuid references auth.users(id),
  rights_attested_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'published' or published_at is not null)
);
create index if not exists instructions_catalog_idx on public.instructions (kit, published_at desc, id) where status = 'published';
create index if not exists instructions_topics_idx on public.instructions using gin (topics);

create table if not exists public.instruction_assets (
  id uuid primary key default gen_random_uuid(),
  instruction_id uuid not null references public.instructions(id) on delete cascade,
  kind text not null check (kind in ('cover','step_image','document')),
  object_key text not null unique,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0),
  created_at timestamptz not null default now(),
  unique (instruction_id, id)
);
alter table public.instructions drop constraint if exists instructions_cover_asset_fk;
alter table public.instructions add constraint instructions_cover_asset_fk
  foreign key (id, cover_asset_id) references public.instruction_assets(instruction_id, id)
  deferrable initially deferred;

create table if not exists public.instruction_steps (
  id uuid primary key default gen_random_uuid(),
  instruction_id uuid not null references public.instructions(id) on delete cascade,
  position integer not null check (position > 0),
  caption text not null default '',
  asset_id uuid,
  unique (instruction_id, position),
  foreign key (instruction_id, asset_id) references public.instruction_assets(instruction_id, id)
);

create or replace function public.keep_instruction_slug()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.status in ('published','archived') and new.slug is distinct from old.slug then
    raise exception 'published instruction slug is immutable';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists instruction_slug_guard on public.instructions;
create trigger instruction_slug_guard before update on public.instructions
for each row execute function public.keep_instruction_slug();

alter table public.instructions enable row level security;
alter table public.instruction_steps enable row level security;
alter table public.instruction_assets enable row level security;

create policy "Published instruction cards"
  on public.instructions for select to anon, authenticated
  using (status = 'published');
create policy "Admin reads all instruction cards"
  on public.instructions for select to authenticated
  using (public.is_instruction_admin());
create policy "Admin writes instruction cards"
  on public.instructions for all to authenticated
  using (public.is_instruction_admin()) with check (public.is_instruction_admin());
create policy "Admin controls instruction steps"
  on public.instruction_steps for all to authenticated
  using (public.is_instruction_admin()) with check (public.is_instruction_admin());
create policy "Admin controls instruction assets"
  on public.instruction_assets for all to authenticated
  using (public.is_instruction_admin()) with check (public.is_instruction_admin());

-- A published card's cover may be resolved server-side without exposing step/document records.
create or replace function public.catalog_cover_object(p_instruction_id uuid, p_asset_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select a.object_key from public.instruction_assets a
  join public.instructions i on i.id = a.instruction_id
  where i.id = p_instruction_id and a.id = p_asset_id
    and a.kind = 'cover' and i.cover_asset_id = a.id
    and (i.status = 'published' or public.is_instruction_admin());
$$;
revoke all on function public.catalog_cover_object(uuid,uuid) from public;
grant execute on function public.catalog_cover_object(uuid,uuid) to anon, authenticated;

create or replace function public.is_published_cover_object(p_object_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.instruction_assets a
    join public.instructions i on i.id = a.instruction_id
    where a.object_key = p_object_key and a.kind = 'cover'
      and i.cover_asset_id = a.id and i.status = 'published'
  );
$$;
revoke all on function public.is_published_cover_object(text) from public;
grant execute on function public.is_published_cover_object(text) to anon, authenticated;

create or replace function public.search_instruction_cards(
  p_kit text default null,
  p_query text default null,
  p_after_time timestamptz default null,
  p_after_id uuid default null,
  p_limit integer default 21
)
returns table (id uuid, slug text, title text, summary text, kit text,
  topics text[], cover_asset_id uuid, published_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, i.slug, i.title, i.summary, i.kit, i.topics, i.cover_asset_id, i.published_at
  from public.instructions i
  where i.status = 'published'
    and (p_kit is null or i.kit = p_kit)
    and (nullif(trim(p_query), '') is null or i.title ilike '%' || p_query || '%'
      or exists (select 1 from unnest(i.topics) topic where topic ilike '%' || p_query || '%'))
    and (p_after_time is null or (i.published_at, i.id) < (p_after_time, p_after_id))
  order by i.published_at desc, i.id desc
  limit least(greatest(p_limit, 1), 50);
$$;
revoke all on function public.search_instruction_cards(text,text,timestamptz,uuid,integer) from public;
grant execute on function public.search_instruction_cards(text,text,timestamptz,uuid,integer) to anon, authenticated;
