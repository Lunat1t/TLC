-- Non-destructive roadmap cards, per-kit rank ratchet, and teacher editor RPCs
-- layered cleanly on top of tlc_learning.

create table if not exists tlc_learning.roadmap_cards (
  id uuid primary key default gen_random_uuid(),
  kit text not null check (kit in ('ev3', 'vex', 'spike')),
  rank_index integer not null check (rank_index between 0 and 6),
  position integer not null default 0 check (position >= 0),
  instruction_id uuid references public.instructions(id) on delete cascade,
  title text not null default '' check (char_length(title) <= 160),
  mechanics_points integer not null default 1 check (mechanics_points between 0 and 20),
  logic_points integer not null default 0 check (logic_points between 0 and 20),
  creativity_points integer not null default 0 check (creativity_points between 0 and 20),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roadmap_cards_min_points check (mechanics_points + logic_points + creativity_points >= 1)
);

create unique index if not exists tlc_learning_roadmap_cards_kit_instruction_uidx
  on tlc_learning.roadmap_cards (kit, instruction_id)
  where instruction_id is not null;

create index if not exists tlc_learning_roadmap_cards_order_idx
  on tlc_learning.roadmap_cards (kit, rank_index, position, created_at);

create table if not exists tlc_learning.roadmap_card_progress (
  student_id uuid not null references public.profiles(id) on delete cascade,
  card_id uuid not null references tlc_learning.roadmap_cards(id) on delete cascade,
  skill text not null check (skill in ('mechanics', 'logic', 'creativity')),
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz not null default now(),
  primary key (student_id, card_id, skill)
);

create index if not exists tlc_learning_roadmap_progress_student_idx
  on tlc_learning.roadmap_card_progress (student_id, card_id);

create table if not exists tlc_learning.roadmap_kit_ranks (
  student_id uuid not null references public.profiles(id) on delete cascade,
  kit text not null check (kit in ('ev3', 'vex', 'spike')),
  unlocked_rank integer not null default 0 check (unlocked_rank between 0 and 6),
  updated_at timestamptz not null default now(),
  primary key (student_id, kit)
);

alter table tlc_learning.roadmap_cards enable row level security;
alter table tlc_learning.roadmap_card_progress enable row level security;
alter table tlc_learning.roadmap_kit_ranks enable row level security;

revoke all on tlc_learning.roadmap_cards from public, anon, authenticated;
revoke all on tlc_learning.roadmap_card_progress from public, anon, authenticated;
revoke all on tlc_learning.roadmap_kit_ranks from public, anon, authenticated;

create or replace function tlc_learning.require_roadmap_editor()
returns void
language plpgsql stable set search_path = ''
as $$
begin
  if auth.uid() is null or not public.can_publish_instruction() then
    raise exception 'roadmap editor required' using errcode = '42501';
  end if;
end;
$$;

create or replace function tlc_learning.compute_kit_rank(p_student_id uuid, p_kit text)
returns integer
language plpgsql stable set search_path = ''
as $$
declare
  v_total integer := 0;
  v_saved integer := 0;
  v_computed integer := 0;
  v_threshold integer := 0;
  v_can_reach boolean := true;
  v_r integer;
  v_count integer;
  v_tier_total integer;
begin
  select coalesce(sum(
    case p.skill
      when 'mechanics' then c.mechanics_points
      when 'logic' then c.logic_points
      when 'creativity' then c.creativity_points
      else 0
    end
  ), 0)
  into v_total
  from tlc_learning.roadmap_card_progress p
  join tlc_learning.roadmap_cards c on c.id = p.card_id
  left join public.instructions i on i.id = c.instruction_id
  where p.student_id = p_student_id
    and c.kit = p_kit
    and (c.instruction_id is null or i.status = 'published');

  for v_r in 0..6 loop
    select
      count(*),
      coalesce(sum(greatest(1, c.mechanics_points + c.logic_points + c.creativity_points)), 0)
    into v_count, v_tier_total
    from tlc_learning.roadmap_cards c
    left join public.instructions i on i.id = c.instruction_id
    where c.kit = p_kit
      and c.rank_index = v_r
      and (c.instruction_id is null or i.status = 'published');

    if v_r = 0 then
      v_can_reach := true;
    end if;

    if v_r > 0 then
      if v_can_reach and v_count > 0 and v_total >= v_threshold then
        v_computed := v_r;
      else
        v_can_reach := false;
      end if;
    end if;

    if v_can_reach and v_count > 0 and v_tier_total > 0 then
      v_threshold := v_threshold + ceil(v_tier_total * 0.7)::integer;
    else
      v_can_reach := false;
    end if;
  end loop;

  select coalesce(r.unlocked_rank, 0)
  into v_saved
  from tlc_learning.roadmap_kit_ranks r
  where r.student_id = p_student_id and r.kit = p_kit;

  return greatest(coalesce(v_saved, 0), v_computed);
end;
$$;

create or replace function tlc_learning.sync_student_kit_rank(p_student_id uuid, p_kit text)
returns integer
language plpgsql set search_path = ''
as $$
declare
  v_rank integer;
begin
  perform tlc_learning.lock_student(p_student_id);
  v_rank := tlc_learning.compute_kit_rank(p_student_id, p_kit);

  insert into tlc_learning.roadmap_kit_ranks (student_id, kit, unlocked_rank, updated_at)
  values (p_student_id, p_kit, v_rank, now())
  on conflict (student_id, kit) do update
    set unlocked_rank = greatest(tlc_learning.roadmap_kit_ranks.unlocked_rank, excluded.unlocked_rank),
        updated_at = excluded.updated_at;

  return v_rank;
end;
$$;

create or replace function tlc_learning.roadmap_cards_json(p_kit text default null)
returns jsonb
language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'kit', c.kit,
      'rank_index', c.rank_index,
      'position', c.position,
      'instruction_id', c.instruction_id,
      'instruction_slug', i.slug,
      'title', case when trim(c.title) <> '' then trim(c.title) else coalesce(i.title, 'Робот') end,
      'summary', coalesce(i.summary, ''),
      'cover_asset_id', i.cover_asset_id,
      'has_pdf', exists (
        select 1 from public.instruction_assets a
        where a.instruction_id = i.id
          and a.kind = 'document'
          and a.is_current
          and a.source_file_id is not null
      ),
      'mechanics_points', c.mechanics_points,
      'logic_points', c.logic_points,
      'creativity_points', c.creativity_points
    )
    order by c.kit, c.rank_index, c.position, c.created_at, c.id
  ), '[]'::jsonb)
  from tlc_learning.roadmap_cards c
  left join public.instructions i on i.id = c.instruction_id
  where (p_kit is null or c.kit = p_kit)
    and (c.instruction_id is null or i.status = 'published');
$$;

create or replace function tlc_learning.student_progress_json(p_student_id uuid)
returns jsonb
language sql stable set search_path = ''
as $$
  select coalesce(jsonb_object_agg(
    t.card_id::text,
    jsonb_build_object(
      'mechanicsDone', t.mechanics_done,
      'logicDone', t.logic_done,
      'creativityDone', t.creativity_done
    )
  ), '{}'::jsonb)
  from (
    select
      p.card_id,
      bool_or(p.skill = 'mechanics') as mechanics_done,
      bool_or(p.skill = 'logic') as logic_done,
      bool_or(p.skill = 'creativity') as creativity_done
    from tlc_learning.roadmap_card_progress p
    where p.student_id = p_student_id
    group by p.card_id
  ) t;
$$;

create or replace function tlc_learning.student_saved_ranks_json(p_student_id uuid)
returns jsonb
language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'ev3', coalesce((select unlocked_rank from tlc_learning.roadmap_kit_ranks where student_id = p_student_id and kit = 'ev3'), 0),
    'vex', coalesce((select unlocked_rank from tlc_learning.roadmap_kit_ranks where student_id = p_student_id and kit = 'vex'), 0),
    'spike', coalesce((select unlocked_rank from tlc_learning.roadmap_kit_ranks where student_id = p_student_id and kit = 'spike'), 0)
  );
$$;

create or replace function public.tlc_roadmap_state(p_kit text default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_onboarding boolean;
  v_is_editor boolean;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_kit is not null and p_kit not in ('ev3', 'vex', 'spike') then
    raise exception 'invalid kit' using errcode = '22023';
  end if;

  select p.role, p.onboarding_complete into v_role, v_onboarding
  from public.profiles p where p.id = v_user_id;

  v_is_editor := public.can_publish_instruction();
  if not v_is_editor and not (v_onboarding is true and v_role = 'student') then
    raise exception 'roadmap access denied' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'role', v_role,
    'is_editor', v_is_editor,
    'cards', tlc_learning.roadmap_cards_json(p_kit),
    'progress', case when v_role = 'student' then tlc_learning.student_progress_json(v_user_id) else '{}'::jsonb end,
    'saved_ranks', case when v_role = 'student' then tlc_learning.student_saved_ranks_json(v_user_id) else jsonb_build_object('ev3', 6, 'vex', 6, 'spike', 6) end
  );
end;
$$;

create or replace function public.tlc_instruction_access(p_slug text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_instruction_id uuid;
  v_user_id uuid := auth.uid();
  v_role text;
  v_onboarding boolean;
  v_min_rank integer;
  v_min_kit text;
  v_card record;
  v_current_rank integer := 0;
begin
  select i.id into v_instruction_id
  from public.instructions i
  where i.slug = p_slug and i.status = 'published';

  if v_instruction_id is null then
    return jsonb_build_object('exists', false, 'allowed', false, 'reason', 'not_found');
  end if;

  select c.rank_index, c.kit
  into v_min_rank, v_min_kit
  from tlc_learning.roadmap_cards c
  where c.instruction_id = v_instruction_id
  order by c.rank_index asc, c.kit asc
  limit 1;

  if v_min_rank is null or v_min_rank = 0 then
    return jsonb_build_object('exists', true, 'allowed', true, 'required_rank', 0);
  end if;

  if v_user_id is null then
    return jsonb_build_object(
      'exists', true,
      'allowed', false,
      'reason', 'unauthenticated',
      'required_rank', v_min_rank,
      'required_kit', v_min_kit
    );
  end if;

  if public.can_publish_instruction() then
    return jsonb_build_object('exists', true, 'allowed', true, 'bypass', true, 'required_rank', v_min_rank);
  end if;

  select p.role, p.onboarding_complete into v_role, v_onboarding
  from public.profiles p where p.id = v_user_id;

  if v_onboarding is not true or v_role <> 'student' then
    return jsonb_build_object(
      'exists', true,
      'allowed', false,
      'reason', 'forbidden',
      'required_rank', v_min_rank,
      'required_kit', v_min_kit
    );
  end if;

  for v_card in
    select c.kit, c.rank_index
    from tlc_learning.roadmap_cards c
    where c.instruction_id = v_instruction_id
    order by c.rank_index asc, c.kit asc
  loop
    v_current_rank := tlc_learning.compute_kit_rank(v_user_id, v_card.kit);
    if v_current_rank >= v_card.rank_index then
      return jsonb_build_object(
        'exists', true,
        'allowed', true,
        'required_rank', v_card.rank_index,
        'required_kit', v_card.kit,
        'current_rank', v_current_rank
      );
    end if;
  end loop;

  v_current_rank := tlc_learning.compute_kit_rank(v_user_id, v_min_kit);
  return jsonb_build_object(
    'exists', true,
    'allowed', false,
    'reason', 'rank_locked',
    'required_rank', v_min_rank,
    'required_kit', v_min_kit,
    'current_rank', v_current_rank
  );
end;
$$;

create or replace function public.tlc_roadmap_admin_catalog()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform tlc_learning.require_roadmap_editor();
  return jsonb_build_object(
    'cards', tlc_learning.roadmap_cards_json(null),
    'instructions', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'slug', i.slug,
          'title', i.title,
          'summary', i.summary,
          'kit', i.kit,
          'cover_asset_id', i.cover_asset_id,
          'has_pdf', exists (
            select 1 from public.instruction_assets a
            where a.instruction_id = i.id
              and a.kind = 'document'
              and a.is_current
              and a.source_file_id is not null
          )
        )
        order by i.published_at desc nulls last, i.title asc, i.id asc
      ), '[]'::jsonb)
      from public.instructions i
      where i.status = 'published'
    )
  );
end;
$$;

create or replace function public.tlc_roadmap_upsert_card(
  p_card_id uuid,
  p_kit text,
  p_rank_index integer,
  p_instruction_id uuid,
  p_title text default '',
  p_mechanics_points integer default 1,
  p_logic_points integer default 0,
  p_creativity_points integer default 0
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_title text := trim(coalesce(p_title, ''));
  v_existing tlc_learning.roadmap_cards;
  v_next_pos integer;
  v_id uuid;
begin
  perform tlc_learning.require_roadmap_editor();

  if p_kit is null or p_kit not in ('ev3', 'vex', 'spike') then
    raise exception 'invalid kit' using errcode = '22023';
  end if;
  if p_rank_index is null or p_rank_index not between 0 and 6 then
    raise exception 'invalid rank index' using errcode = '22023';
  end if;
  if char_length(v_title) > 160 then
    raise exception 'title too long' using errcode = '22023';
  end if;
  if p_mechanics_points is null or p_logic_points is null or p_creativity_points is null
    or p_mechanics_points not between 0 and 20
    or p_logic_points not between 0 and 20
    or p_creativity_points not between 0 and 20
    or (p_mechanics_points + p_logic_points + p_creativity_points) < 1 then
    raise exception 'invalid reward points' using errcode = '22023';
  end if;

  if p_instruction_id is not null and not exists (
    select 1 from public.instructions i where i.id = p_instruction_id and i.status = 'published'
  ) then
    raise exception 'published instruction required' using errcode = '22023';
  end if;
  if p_instruction_id is null and v_title = '' then
    raise exception 'instruction or title required' using errcode = '22023';
  end if;

  if p_card_id is null then
    select coalesce(max(c.position), -1) + 1 into v_next_pos
    from tlc_learning.roadmap_cards c
    where c.kit = p_kit and c.rank_index = p_rank_index;

    insert into tlc_learning.roadmap_cards (
      kit, rank_index, position, instruction_id, title,
      mechanics_points, logic_points, creativity_points, created_by
    ) values (
      p_kit, p_rank_index, v_next_pos, p_instruction_id, v_title,
      p_mechanics_points, p_logic_points, p_creativity_points, auth.uid()
    )
    returning id into v_id;
    return v_id;
  end if;

  select * into v_existing from tlc_learning.roadmap_cards where id = p_card_id for update;
  if not found then
    raise exception 'card not found' using errcode = '22023';
  end if;

  if v_existing.kit <> p_kit or v_existing.rank_index <> p_rank_index then
    select coalesce(max(c.position), -1) + 1 into v_next_pos
    from tlc_learning.roadmap_cards c
    where c.kit = p_kit and c.rank_index = p_rank_index;
  else
    v_next_pos := v_existing.position;
  end if;

  update tlc_learning.roadmap_cards
  set
    kit = p_kit,
    rank_index = p_rank_index,
    position = v_next_pos,
    instruction_id = p_instruction_id,
    title = v_title,
    mechanics_points = p_mechanics_points,
    logic_points = p_logic_points,
    creativity_points = p_creativity_points,
    updated_at = now()
  where id = p_card_id;

  return p_card_id;
end;
$$;

create or replace function public.tlc_roadmap_reorder_rank(
  p_kit text,
  p_rank_index integer,
  p_card_ids uuid[]
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_expected_count integer;
  v_supplied_count integer;
  v_matched_count integer;
begin
  perform tlc_learning.require_roadmap_editor();

  if p_kit is null or p_kit not in ('ev3', 'vex', 'spike') then
    raise exception 'invalid kit' using errcode = '22023';
  end if;
  if p_rank_index is null or p_rank_index not between 0 and 6 then
    raise exception 'invalid rank index' using errcode = '22023';
  end if;

  select count(*) into v_expected_count
  from tlc_learning.roadmap_cards
  where kit = p_kit and rank_index = p_rank_index;

  v_supplied_count := coalesce(array_length(p_card_ids, 1), 0);
  if v_expected_count <> v_supplied_count then
    raise exception 'card set mismatch' using errcode = '22023';
  end if;
  if v_expected_count = 0 then
    return;
  end if;

  select count(*) into v_matched_count
  from (select distinct unnest(p_card_ids) as id) u
  join tlc_learning.roadmap_cards c on c.id = u.id
  where c.kit = p_kit and c.rank_index = p_rank_index;

  if v_matched_count <> v_expected_count then
    raise exception 'card set mismatch' using errcode = '22023';
  end if;

  update tlc_learning.roadmap_cards c
  set position = ord.pos - 1, updated_at = now()
  from unnest(p_card_ids) with ordinality as ord(id, pos)
  where c.id = ord.id and c.kit = p_kit and c.rank_index = p_rank_index;
end;
$$;

create or replace function public.tlc_roadmap_delete_card(p_card_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  perform tlc_learning.require_roadmap_editor();
  delete from tlc_learning.roadmap_cards where id = p_card_id;
  return found;
end;
$$;

create or replace function public.tlc_roadmap_search_students(p_query text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_query text := lower(trim(coalesce(p_query, '')));
begin
  perform tlc_learning.require_roadmap_editor();
  if char_length(v_query) not between 2 and 100 then
    return '[]'::jsonb;
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'student_id', s.id,
      'nickname', s.nickname,
      'login', s.login
    ) order by s.login_match desc, s.nickname, s.id), '[]'::jsonb)
    from (
      select p.id, p.nickname, p.login, starts_with(lower(p.login), v_query) as login_match
      from public.profiles p
      where p.role = 'student' and p.onboarding_complete
        and (starts_with(lower(p.login), v_query) or strpos(lower(p.nickname), v_query) > 0)
      order by login_match desc, p.nickname, p.id
      limit 20
    ) s
  );
end;
$$;

create or replace function public.tlc_roadmap_student_progress(p_student_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform tlc_learning.require_roadmap_editor();
  perform tlc_learning.require_student(p_student_id);
  return jsonb_build_object(
    'student_id', p_student_id,
    'progress', tlc_learning.student_progress_json(p_student_id),
    'saved_ranks', tlc_learning.student_saved_ranks_json(p_student_id)
  );
end;
$$;

create or replace function public.tlc_roadmap_set_student_skill(
  p_student_id uuid,
  p_card_id uuid,
  p_skill text,
  p_done boolean
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_card tlc_learning.roadmap_cards;
  v_rank integer;
begin
  perform tlc_learning.require_roadmap_editor();
  perform tlc_learning.lock_student(p_student_id);

  if p_skill is null or p_skill not in ('mechanics', 'logic', 'creativity', 'all') then
    raise exception 'invalid skill' using errcode = '22023';
  end if;

  select * into v_card from tlc_learning.roadmap_cards where id = p_card_id;
  if not found then
    raise exception 'card not found' using errcode = '22023';
  end if;

  if p_done then
    if p_skill in ('mechanics', 'all') and v_card.mechanics_points > 0 then
      insert into tlc_learning.roadmap_card_progress (student_id, card_id, skill, confirmed_by)
      values (p_student_id, p_card_id, 'mechanics', auth.uid())
      on conflict (student_id, card_id, skill) do nothing;
    end if;
    if p_skill in ('logic', 'all') and v_card.logic_points > 0 then
      insert into tlc_learning.roadmap_card_progress (student_id, card_id, skill, confirmed_by)
      values (p_student_id, p_card_id, 'logic', auth.uid())
      on conflict (student_id, card_id, skill) do nothing;
    end if;
    if p_skill in ('creativity', 'all') and v_card.creativity_points > 0 then
      insert into tlc_learning.roadmap_card_progress (student_id, card_id, skill, confirmed_by)
      values (p_student_id, p_card_id, 'creativity', auth.uid())
      on conflict (student_id, card_id, skill) do nothing;
    end if;
  else
    if p_skill = 'all' then
      delete from tlc_learning.roadmap_card_progress
      where student_id = p_student_id and card_id = p_card_id;
    else
      delete from tlc_learning.roadmap_card_progress
      where student_id = p_student_id and card_id = p_card_id and skill = p_skill;
    end if;
  end if;

  v_rank := tlc_learning.sync_student_kit_rank(p_student_id, v_card.kit);
  return jsonb_build_object('kit', v_card.kit, 'unlocked_rank', v_rank);
end;
$$;

revoke all on all functions in schema tlc_learning from public, anon, authenticated;
grant usage on schema tlc_learning to authenticated;

revoke all on function public.tlc_roadmap_state(text) from public, anon;
grant execute on function public.tlc_roadmap_state(text) to authenticated;

revoke all on function public.tlc_instruction_access(text) from public;
grant execute on function public.tlc_instruction_access(text) to anon, authenticated;

revoke all on function public.tlc_roadmap_admin_catalog() from public, anon;
grant execute on function public.tlc_roadmap_admin_catalog() to authenticated;

revoke all on function public.tlc_roadmap_upsert_card(uuid, text, integer, uuid, text, integer, integer, integer) from public, anon;
grant execute on function public.tlc_roadmap_upsert_card(uuid, text, integer, uuid, text, integer, integer, integer) to authenticated;

revoke all on function public.tlc_roadmap_reorder_rank(text, integer, uuid[]) from public, anon;
grant execute on function public.tlc_roadmap_reorder_rank(text, integer, uuid[]) to authenticated;

revoke all on function public.tlc_roadmap_delete_card(uuid) from public, anon;
grant execute on function public.tlc_roadmap_delete_card(uuid) to authenticated;

revoke all on function public.tlc_roadmap_search_students(text) from public, anon;
grant execute on function public.tlc_roadmap_search_students(text) to authenticated;

revoke all on function public.tlc_roadmap_student_progress(uuid) from public, anon;
grant execute on function public.tlc_roadmap_student_progress(uuid) to authenticated;

revoke all on function public.tlc_roadmap_set_student_skill(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.tlc_roadmap_set_student_skill(uuid, uuid, text, boolean) to authenticated;
