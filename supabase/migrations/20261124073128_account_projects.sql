begin;

-- Prevent a legacy save racing the backfill: the lock is held through commit.
lock table public.account_workspace in share row exclusive mode;

create table public.account_projects (
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id text collate "C" not null,
  value jsonb,
  revision integer not null default 1 check (revision > 0),
  deleted_at timestamptz,
  primary key (user_id, project_id),
  constraint account_projects_id check (
    octet_length(project_id) between 1 and 1024 and project_id not in ('.', '..') and project_id !~ '[[:cntrl:]]'
  ),
  constraint account_projects_value_size check (value is null or octet_length(value::text) <= 3500000),
  constraint account_projects_tombstone check ((value is null) = (deleted_at is not null)),
  constraint account_projects_value_shape check ((value is null or (
    jsonb_typeof(value) = 'object'
    and value->>'id' = project_id and jsonb_typeof(value->'id') = 'string'
    and value->'version' = '1'::jsonb
    and value->>'hub' in ('spike', 'ev3')
    and jsonb_typeof(value->'name') = 'string'
    and length(regexp_replace(btrim(value->>'name'), '\s+', ' ', 'g')) between 1 and 64
    and jsonb_typeof(value->'createdAt') = 'string'
    and (not value ? 'updatedAt' or jsonb_typeof(value->'updatedAt') = 'string')
    and (not value ? 'devices' or jsonb_typeof(value->'devices') = 'array')
    and (not value ? 'workspace' or value->'workspace' = 'null'::jsonb or jsonb_typeof(value->'workspace') = 'object')
  )) is true)
);

alter table public.account_projects enable row level security;
revoke all on public.account_projects from public, anon, authenticated;
grant select, insert, update on public.account_projects to authenticated;
create policy account_projects_select on public.account_projects for select to authenticated
  using (user_id = (select auth.uid()));
create policy account_projects_insert on public.account_projects for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy account_projects_update on public.account_projects for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Refuse ambiguous IDs before copying anything; any malformed value also fails
-- the new table constraints and rolls this entire migration back.
do $$
begin
  if exists (
    select 1 from public.account_workspace where section = 'projects' and jsonb_typeof(value) <> 'array'
  ) then raise exception 'Legacy project library is not an array; original data retained'; end if;
  if exists (
    select 1 from public.account_workspace w
    cross join lateral jsonb_array_elements(case when w.section = 'projects' then w.value else '[]'::jsonb end) p
    where w.section = 'projects'
    and (jsonb_typeof(p) <> 'object' or jsonb_typeof(p->'id') is distinct from 'string' or coalesce(p->>'id', '') = '')
  ) then raise exception 'Legacy project library contains an invalid ID; original data retained'; end if;
  if exists (
    select 1 from public.account_workspace w
    cross join lateral jsonb_array_elements(case when w.section = 'projects' then w.value else '[]'::jsonb end) p
    where w.section = 'projects'
    group by w.user_id, p->>'id' having count(*) > 1
  ) then raise exception 'Legacy project library contains duplicate IDs; original data retained'; end if;
end;
$$;

insert into public.account_projects (user_id, project_id, value, revision)
select w.user_id, p->>'id', p, 1
from public.account_workspace w
cross join lateral jsonb_array_elements(case when w.section = 'projects' then w.value else '[]'::jsonb end) p
where w.section = 'projects';

create function public.save_account_project(p_project_id text, p_value jsonb, p_revision integer)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_revision integer;
begin
  if v_user is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_revision is null or p_revision < 0 or p_revision >= 2147483647 then
    raise exception 'invalid revision' using errcode = '22023';
  end if;
  if p_revision = 0 then
    insert into public.account_projects (user_id, project_id, value, deleted_at)
    values (v_user, p_project_id, p_value, case when p_value is null then clock_timestamp() else null end)
    on conflict (user_id, project_id) do nothing returning revision into v_revision;
  else
    update public.account_projects
    set value = p_value, revision = revision + 1,
      deleted_at = case when p_value is null then clock_timestamp() else null end
    where user_id = v_user and project_id = p_project_id and revision = p_revision
    returning revision into v_revision;
  end if;
  return coalesce(v_revision, -1);
end;
$$;
revoke all on function public.save_account_project(text, jsonb, integer) from public, anon;
grant execute on function public.save_account_project(text, jsonb, integer) to authenticated;

-- Keep the legacy array as a frozen, recoverable source. Previously deployed
-- clients must reload instead of writing into a second divergent program store.
create or replace function public.save_workspace_section(p_section text, p_value jsonb, p_revision integer)
returns integer language plpgsql security definer set search_path = public as $$
declare v_revision integer;
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  if p_section = 'projects' then raise exception 'project_storage_moved: reload Brick Studio'; end if;
  if p_revision = 0 then
    insert into account_workspace(user_id, section, value) values(auth.uid(), p_section, p_value)
    on conflict do nothing returning revision into v_revision;
  else
    update account_workspace set value = p_value, revision = revision + 1
    where user_id = auth.uid() and section = p_section and revision = p_revision returning revision into v_revision;
  end if;
  return coalesce(v_revision, -1);
end;
$$;
revoke all on function public.save_workspace_section(text, jsonb, integer) from public, anon;
grant execute on function public.save_workspace_section(text, jsonb, integer) to authenticated;

commit;
