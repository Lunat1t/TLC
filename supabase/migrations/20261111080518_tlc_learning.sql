-- Learning records are private. The public schema only exposes typed RPC entry points.
create schema tlc_learning;
revoke all on schema tlc_learning from public, anon, authenticated;

create table tlc_learning.lessons (
  instruction_id uuid primary key references public.instructions(id) on delete cascade,
  topic text not null check (char_length(topic) between 1 and 80),
  position integer not null check (position between 0 and 10000),
  build_difficulty integer check (build_difficulty between 1 and 3),
  program_enabled boolean not null,
  check (build_difficulty is not null or program_enabled)
);

create table tlc_learning.seasons (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 100),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  check (isfinite(starts_at) and isfinite(ends_at) and starts_at < ends_at),
  exclude using gist (tstzrange(starts_at, ends_at, '[)') with &&)
);

create table tlc_learning.levels (
  season_id uuid not null references tlc_learning.seasons(id),
  number integer not null check (number > 0),
  xp_required integer not null check (xp_required > 0),
  tickets integer not null check (tickets > 0),
  primary key (season_id, number),
  unique (season_id, xp_required)
);

create table tlc_learning.completions (
  student_id uuid not null references public.profiles(id) on delete cascade,
  instruction_id uuid not null references public.instructions(id),
  kind text not null check (kind in ('build', 'program')),
  season_id uuid references tlc_learning.seasons(id),
  xp integer not null check (xp >= 0),
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz not null,
  primary key (student_id, instruction_id, kind),
  check ((season_id is null) = (xp = 0))
);
create index tlc_learning_completions_season on tlc_learning.completions (student_id, season_id)
where season_id is not null;

create table tlc_learning.claims (
  student_id uuid not null references public.profiles(id) on delete cascade,
  season_id uuid not null,
  level_number integer not null,
  claimed_at timestamptz not null,
  primary key (student_id, season_id, level_number),
  foreign key (season_id, level_number) references tlc_learning.levels(season_id, number)
);

create table tlc_learning.shop (
  key text primary key,
  title text not null,
  kind text not null check (kind in ('skin', 'accessory')),
  price integer not null check (price > 0),
  available boolean not null default true,
  unique (key, kind)
);

create table tlc_learning.owned_items (
  student_id uuid not null references public.profiles(id) on delete cascade,
  item_key text not null,
  kind text not null,
  season_id uuid not null references tlc_learning.seasons(id),
  tickets_paid integer not null check (tickets_paid > 0),
  purchased_at timestamptz not null,
  equipped boolean not null default false,
  primary key (student_id, item_key),
  foreign key (item_key, kind) references tlc_learning.shop(key, kind)
);
create index tlc_learning_owned_items_season on tlc_learning.owned_items (student_id, season_id);
create unique index tlc_learning_equipment_slot on tlc_learning.owned_items (student_id, kind)
where equipped;

create table tlc_learning.achievement_catalog (
  key text primary key,
  title text not null,
  position integer not null
);

create table tlc_learning.achievements (
  student_id uuid not null references public.profiles(id) on delete cascade,
  achievement_key text not null references tlc_learning.achievement_catalog(key)
    check (achievement_key <> 'mix_and_match_2025_2026'),
  awarded_by uuid references auth.users(id) on delete set null,
  awarded_at timestamptz not null default now(),
  primary key (student_id, achievement_key)
);

alter table tlc_learning.lessons enable row level security;
alter table tlc_learning.seasons enable row level security;
alter table tlc_learning.levels enable row level security;
alter table tlc_learning.completions enable row level security;
alter table tlc_learning.claims enable row level security;
alter table tlc_learning.shop enable row level security;
alter table tlc_learning.owned_items enable row level security;
alter table tlc_learning.achievement_catalog enable row level security;
alter table tlc_learning.achievements enable row level security;
revoke all on all tables in schema tlc_learning from public, anon, authenticated;

insert into tlc_learning.shop (key, title, kind, price) values
  ('workshop-cobalt', 'Кобальтовый корпус', 'skin', 2),
  ('workshop-amber', 'Янтарный корпус', 'skin', 2),
  ('workshop-visor', 'Визор мастерской', 'accessory', 3);

insert into tlc_learning.achievement_catalog (key, title, position) values
  ('mix_and_match_2025_2026', 'Mix & Match 2025–2026', 1),
  ('competition', 'Участие в соревновании', 2),
  ('event', 'Участие в событии', 3),
  ('ten_builds', '10 собранных роботов', 4);

-- Helpers are callable only from the privileged operations below.
create function tlc_learning.require_admin()
returns void
language plpgsql stable set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_instruction_admin() then
    raise exception 'learning admin required' using errcode = '42501';
  end if;
end;
$$;

create function tlc_learning.require_student(p_student_id uuid)
returns void
language plpgsql stable set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = p_student_id and p.role = 'student' and p.onboarding_complete
  ) then
    raise exception 'student not found' using errcode = '42501';
  end if;
end;
$$;

-- Every write to a student's learning account takes the same row lock.
-- Claims, purchases and confirmations can then calculate from the committed ledger.
create function tlc_learning.lock_student(p_student_id uuid)
returns void
language plpgsql set search_path = ''
as $$
begin
  perform 1 from public.profiles p
  where p.id = p_student_id and p.role = 'student' and p.onboarding_complete
  for update;
  if not found then
    raise exception 'student not found' using errcode = '42501';
  end if;
end;
$$;

create function tlc_learning.active_season(p_at timestamptz)
returns tlc_learning.seasons
language sql stable set search_path = ''
as $$
  select * from tlc_learning.seasons s where s.starts_at <= p_at and p_at < s.ends_at;
$$;

create function tlc_learning.require_active_season(p_season_id uuid, p_at timestamptz)
returns void
language plpgsql stable set search_path = ''
as $$
begin
  if p_season_id is null or p_season_id is distinct from (tlc_learning.active_season(p_at)).id then
    raise exception 'season expired' using errcode = '22023';
  end if;
end;
$$;

create function tlc_learning.season_xp(p_student_id uuid, p_season_id uuid)
returns bigint
language sql stable set search_path = ''
as $$
  select coalesce(sum(c.xp), 0) from tlc_learning.completions c
  where c.student_id = p_student_id and c.season_id = p_season_id;
$$;

create function tlc_learning.work_xp(p_kind text, p_build_difficulty integer)
returns integer
language sql immutable set search_path = ''
as $$
  select case
    when p_kind = 'program' then 20
    when p_build_difficulty = 1 then 20
    when p_build_difficulty = 2 then 35
    when p_build_difficulty = 3 then 50
    else 0
  end;
$$;

create function tlc_learning.ticket_balance(p_student_id uuid, p_season_id uuid)
returns bigint
language sql stable set search_path = ''
as $$
  select (
    select coalesce(sum(l.tickets), 0) from tlc_learning.claims c
    join tlc_learning.levels l on l.season_id = c.season_id and l.number = c.level_number
    where c.student_id = p_student_id and c.season_id = p_season_id
  ) - (
    select coalesce(sum(o.tickets_paid), 0) from tlc_learning.owned_items o
    where o.student_id = p_student_id and o.season_id = p_season_id
  );
$$;

create function tlc_learning.lesson_list(p_student_id uuid)
returns jsonb
language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'instruction_id', i.id,
      'slug', i.slug,
      'title', i.title,
      'topic', l.topic,
      'position', l.position,
      'build_difficulty', l.build_difficulty,
      'program_enabled', l.program_enabled,
      'build_done', b.student_id is not null,
      'program_done', p.student_id is not null
    ) order by l.topic_position, l.topic, l.position, i.title, i.id
  ), '[]'::jsonb)
  from (
    select config.*, min(config.position) over (partition by config.topic) as topic_position
    from tlc_learning.lessons config
    join public.instructions card on card.id = config.instruction_id and card.status = 'published'
  ) l
  join public.instructions i on i.id = l.instruction_id
  left join tlc_learning.completions b
    on b.student_id = p_student_id and b.instruction_id = i.id and b.kind = 'build'
  left join tlc_learning.completions p
    on p.student_id = p_student_id and p.instruction_id = i.id and p.kind = 'program';
$$;

create function tlc_learning.achievement_list(p_student_id uuid, p_include_unawarded boolean)
returns jsonb
language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', c.key, 'title', c.title, 'awarded_at', a.awarded_at
  ) order by c.position, c.title, c.key), '[]'::jsonb)
  from tlc_learning.achievement_catalog c
  left join (
    select achievement_key, awarded_at from tlc_learning.achievements
    where student_id = p_student_id
    union all
    select achievement_key, awarded_at from public.student_achievement_awards
    where student_id = p_student_id and achievement_key = 'mix_and_match_2025_2026'
  ) a on a.achievement_key = c.key
  where p_include_unawarded or a.awarded_at is not null;
$$;

create function tlc_learning.shop_list(p_student_id uuid, p_owned_only boolean)
returns jsonb
language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', s.key, 'title', s.title, 'kind', s.kind, 'price', s.price,
    'owned', o.student_id is not null, 'equipped', coalesce(o.equipped, false)
  ) order by s.kind desc, s.price, s.key), '[]'::jsonb)
  from tlc_learning.shop s
  left join tlc_learning.owned_items o on o.item_key = s.key and o.student_id = p_student_id
  where o.student_id is not null or (not p_owned_only and s.available);
$$;

create function tlc_learning.student()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_student_id uuid := auth.uid();
  v_season tlc_learning.seasons;
  v_season_json jsonb;
begin
  perform tlc_learning.require_student(v_student_id);
  v_season := tlc_learning.active_season(statement_timestamp());
  if v_season.id is not null then
    select jsonb_build_object(
      'id', v_season.id,
      'title', v_season.title,
      'starts_at', v_season.starts_at,
      'ends_at', v_season.ends_at,
      'xp', tlc_learning.season_xp(v_student_id, v_season.id),
      'tickets', tlc_learning.ticket_balance(v_student_id, v_season.id),
      'levels', coalesce(jsonb_agg(jsonb_build_object(
        'number', l.number, 'xp_required', l.xp_required, 'tickets', l.tickets,
        'claimed', c.student_id is not null
      ) order by l.number), '[]'::jsonb)
    ) into v_season_json
    from tlc_learning.levels l
    left join tlc_learning.claims c on c.student_id = v_student_id
      and c.season_id = l.season_id and c.level_number = l.number
    where l.season_id = v_season.id;
  end if;
  return jsonb_build_object(
    'lessons', tlc_learning.lesson_list(v_student_id),
    'achievements', tlc_learning.achievement_list(v_student_id, false),
    'history', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'instruction_id', c.instruction_id, 'title', i.title, 'kind', c.kind,
        'confirmed_at', c.confirmed_at, 'xp', c.xp
      ) order by c.confirmed_at desc, c.instruction_id, c.kind), '[]'::jsonb)
      from tlc_learning.completions c
      join public.instructions i on i.id = c.instruction_id
      where c.student_id = v_student_id
    ),
    'season', v_season_json,
    'shop', tlc_learning.shop_list(v_student_id, false)
  );
end;
$$;

create function tlc_learning.wardrobe()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_student_id uuid := auth.uid();
begin
  perform tlc_learning.require_student(v_student_id);
  return tlc_learning.shop_list(v_student_id, true);
end;
$$;

create function tlc_learning.claim(p_season_id uuid, p_level integer)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_student_id uuid := auth.uid();
  v_at timestamptz;
  v_xp_required integer;
begin
  perform tlc_learning.lock_student(v_student_id);
  v_at := clock_timestamp();
  perform tlc_learning.require_active_season(p_season_id, v_at);

  select l.xp_required into v_xp_required from tlc_learning.levels l
  where l.season_id = p_season_id and l.number = p_level;
  if not found or tlc_learning.season_xp(v_student_id, p_season_id) < v_xp_required then
    raise exception 'level locked' using errcode = '22023';
  end if;

  insert into tlc_learning.claims(student_id, season_id, level_number, claimed_at)
  values (v_student_id, p_season_id, p_level, v_at)
  on conflict (student_id, season_id, level_number) do nothing;
end;
$$;

create function tlc_learning.purchase(p_season_id uuid, p_item_key text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_student_id uuid := auth.uid();
  v_at timestamptz;
  v_item tlc_learning.shop;
begin
  perform tlc_learning.lock_student(v_student_id);
  v_at := clock_timestamp();
  perform tlc_learning.require_active_season(p_season_id, v_at);

  if exists (
    select 1 from tlc_learning.owned_items o where o.student_id = v_student_id and o.item_key = p_item_key
  ) then
    return;
  end if;

  select s.* into v_item from tlc_learning.shop s where s.key = p_item_key and s.available for share;
  if not found then
    raise exception 'item unavailable' using errcode = '22023';
  end if;
  if tlc_learning.ticket_balance(v_student_id, p_season_id) < v_item.price then
    raise exception 'insufficient tickets' using errcode = '22023';
  end if;

  -- This one row is both the permanent entitlement and the seasonal debit.
  insert into tlc_learning.owned_items(student_id, item_key, kind, season_id, tickets_paid, purchased_at)
  values (v_student_id, v_item.key, v_item.kind, p_season_id, v_item.price, v_at);
end;
$$;

create function tlc_learning.equip(p_item_key text, p_equipped boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_student_id uuid := auth.uid();
  v_kind text;
begin
  perform tlc_learning.lock_student(v_student_id);
  if p_equipped is null then
    raise exception 'invalid equipment state' using errcode = '22023';
  end if;

  select o.kind into v_kind from tlc_learning.owned_items o
  where o.student_id = v_student_id and o.item_key = p_item_key;
  if not found then
    raise exception 'item not owned' using errcode = '22023';
  end if;

  if p_equipped then
    update tlc_learning.owned_items set equipped = false
    where student_id = v_student_id and kind = v_kind and item_key <> p_item_key and equipped;
  end if;

  update tlc_learning.owned_items set equipped = p_equipped
  where student_id = v_student_id and item_key = p_item_key and equipped is distinct from p_equipped;
end;
$$;

create function tlc_learning.admin(p_student_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_season tlc_learning.seasons;
begin
  perform tlc_learning.require_admin();
  if p_student_id is not null then
    perform tlc_learning.require_student(p_student_id);
  end if;

  select s.* into v_season from tlc_learning.seasons s
  where statement_timestamp() < s.ends_at
  order by s.starts_at limit 1;
  return jsonb_build_object(
    'lessons', tlc_learning.lesson_list(p_student_id),
    'achievements', tlc_learning.achievement_list(p_student_id, true),
    'completed_builds', (
      select count(*) from tlc_learning.completions c
      where c.student_id = p_student_id and c.kind = 'build'
    ),
    'roadmap_xp', (
      select coalesce(sum(tlc_learning.work_xp('build', l.build_difficulty) +
        case when l.program_enabled then tlc_learning.work_xp('program', null) else 0 end), 0)
      from tlc_learning.lessons l
      join public.instructions i on i.id = l.instruction_id and i.status = 'published'
    ),
    'season', case when v_season.id is not null then jsonb_build_object(
      'id', v_season.id, 'title', v_season.title,
      'starts_at', v_season.starts_at, 'ends_at', v_season.ends_at
    ) end
  );
end;
$$;

create function tlc_learning.students(p_query text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_query text := lower(trim(coalesce(p_query, '')));
begin
  perform tlc_learning.require_admin();
  if char_length(v_query) not between 2 and 100 then
    return '[]'::jsonb;
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'student_id', s.id, 'nickname', s.nickname, 'login', s.login
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

create function tlc_learning.confirm(p_student_id uuid, p_instruction_id uuid, p_kind text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_lesson tlc_learning.lessons;
  v_season_id uuid;
  v_at timestamptz;
  v_xp integer;
begin
  perform tlc_learning.require_admin();
  perform tlc_learning.lock_student(p_student_id);
  if p_kind is null or p_kind not in ('build', 'program') then
    raise exception 'invalid work kind' using errcode = '22023';
  end if;

  select c.xp into v_xp from tlc_learning.completions c
  where c.student_id = p_student_id and c.instruction_id = p_instruction_id and c.kind = p_kind;
  if found then
    return jsonb_build_object('xp', v_xp, 'applied', false);
  end if;

  select l.* into v_lesson from tlc_learning.lessons l
  join public.instructions i on i.id = l.instruction_id and i.status = 'published'
  where l.instruction_id = p_instruction_id
  for share of l, i;
  if not found or (p_kind = 'build' and v_lesson.build_difficulty is null)
    or (p_kind = 'program' and not v_lesson.program_enabled) then
    raise exception 'lesson task unavailable' using errcode = '22023';
  end if;

  v_at := clock_timestamp();
  v_season_id := (tlc_learning.active_season(v_at)).id;
  v_xp := case
    when v_season_id is null then 0
    else tlc_learning.work_xp(p_kind, v_lesson.build_difficulty)
  end;
  insert into tlc_learning.completions(
    student_id, instruction_id, kind, season_id, xp, confirmed_by, confirmed_at
  ) values (p_student_id, p_instruction_id, p_kind, v_season_id, v_xp, auth.uid(), v_at);
  return jsonb_build_object('xp', v_xp, 'applied', true);
end;
$$;

create function tlc_learning.award(p_student_id uuid, p_key text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform tlc_learning.require_admin();
  perform tlc_learning.lock_student(p_student_id);
  if not exists (select 1 from tlc_learning.achievement_catalog c where c.key = p_key) then
    raise exception 'achievement unavailable' using errcode = '22023';
  end if;

  if p_key = 'mix_and_match_2025_2026' then
    perform public.award_mix_match_achievement(p_student_id, true);
    return;
  end if;

  if p_key = 'ten_builds' and (
    select count(*) from tlc_learning.completions c where c.student_id = p_student_id and c.kind = 'build'
  ) < 10 then
    raise exception 'achievement requirement incomplete' using errcode = '22023';
  end if;

  insert into tlc_learning.achievements(student_id, achievement_key, awarded_by)
  values (p_student_id, p_key, auth.uid())
  on conflict (student_id, achievement_key) do nothing;
end;
$$;

create function tlc_learning.open_season(
  p_title text, p_starts_at timestamptz, p_ends_at timestamptz, p_final_xp integer
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_title text := trim(coalesce(p_title, ''));
  v_id uuid;
begin
  perform tlc_learning.require_admin();
  if char_length(v_title) not between 1 and 100 or p_starts_at is null or p_ends_at is null
    or not isfinite(p_starts_at) or not isfinite(p_ends_at) or p_starts_at >= p_ends_at
    or p_ends_at <= clock_timestamp() or p_final_xp is null or p_final_xp not between 5 and 10000 then
    raise exception 'invalid season' using errcode = '22023';
  end if;
  if p_ends_at - p_starts_at > interval '90 days' then
    raise exception 'invalid season' using errcode = '22023';
  end if;

  insert into tlc_learning.seasons(title, starts_at, ends_at, created_by)
  values (v_title, p_starts_at, p_ends_at, auth.uid()) returning id into v_id;

  insert into tlc_learning.levels(season_id, number, xp_required, tickets)
  select v_id, n, (p_final_xp * n + 4) / 5, 1 from generate_series(1, 5) as n;
  return v_id;
exception
  when exclusion_violation then
    raise exception 'season overlaps' using errcode = '23P01';
end;
$$;

create function tlc_learning.define_achievement(p_title text, p_kind text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_title text := trim(regexp_replace(coalesce(p_title, ''), '[[:space:]]+', ' ', 'g'));
  v_key text;
begin
  perform tlc_learning.require_admin();
  if p_kind is null or p_kind not in ('competition', 'event') or char_length(v_title) not between 1 and 100 then
    raise exception 'invalid achievement' using errcode = '22023';
  end if;

  v_key := p_kind || '-' || md5(lower(v_title));
  insert into tlc_learning.achievement_catalog (key, title, position)
  values (v_key, v_title, 5)
  on conflict (key) do nothing;
  return v_key;
end;
$$;

create function tlc_learning.get_lesson(p_instruction_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform tlc_learning.require_admin();
  return (
    select jsonb_build_object(
      'topic', l.topic, 'position', l.position, 'build_difficulty', l.build_difficulty,
      'program_enabled', l.program_enabled
    ) from tlc_learning.lessons l where l.instruction_id = p_instruction_id
  );
end;
$$;

create function tlc_learning.save_lesson(
  p_instruction_id uuid, p_topic text, p_position integer,
  p_build_difficulty integer, p_program_enabled boolean
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_topic text := trim(coalesce(p_topic, ''));
begin
  perform tlc_learning.require_admin();
  if v_topic = '' then
    delete from tlc_learning.lessons where instruction_id = p_instruction_id;
    return;
  end if;
  if char_length(v_topic) > 80 or p_position is null or p_position not between 0 and 10000
    or p_build_difficulty not between 1 and 3 or p_program_enabled is null
    or (p_build_difficulty is null and not p_program_enabled) then
    raise exception 'invalid roadmap lesson' using errcode = '22023';
  end if;
  if not exists (select 1 from public.instructions i where i.id = p_instruction_id and i.status = 'published') then
    raise exception 'published instruction required' using errcode = '22023';
  end if;

  insert into tlc_learning.lessons(instruction_id, topic, position, build_difficulty, program_enabled)
  values (p_instruction_id, v_topic, p_position, p_build_difficulty, p_program_enabled)
  on conflict (instruction_id) do update set topic = excluded.topic, position = excluded.position,
    build_difficulty = excluded.build_difficulty, program_enabled = excluded.program_enabled;
end;
$$;

revoke all on all functions in schema tlc_learning from public, anon, authenticated;
grant usage on schema tlc_learning to authenticated;

grant execute on function tlc_learning.student() to authenticated;
create function public.tlc_learning_student()
returns jsonb
language sql stable security invoker set search_path = ''
as $$ select tlc_learning.student(); $$;
revoke all on function public.tlc_learning_student() from public, anon;
grant execute on function public.tlc_learning_student() to authenticated;

grant execute on function tlc_learning.wardrobe() to authenticated;
create function public.tlc_learning_wardrobe()
returns jsonb
language sql stable security invoker set search_path = ''
as $$ select tlc_learning.wardrobe(); $$;
revoke all on function public.tlc_learning_wardrobe() from public, anon;
grant execute on function public.tlc_learning_wardrobe() to authenticated;

grant execute on function tlc_learning.claim(uuid, integer) to authenticated;
create function public.tlc_learning_claim(p_season_id uuid, p_level integer)
returns void
language sql security invoker set search_path = ''
as $$ select tlc_learning.claim(p_season_id, p_level); $$;
revoke all on function public.tlc_learning_claim(uuid, integer) from public, anon;
grant execute on function public.tlc_learning_claim(uuid, integer) to authenticated;

grant execute on function tlc_learning.purchase(uuid, text) to authenticated;
create function public.tlc_learning_purchase(p_season_id uuid, p_item_key text)
returns void
language sql security invoker set search_path = ''
as $$ select tlc_learning.purchase(p_season_id, p_item_key); $$;
revoke all on function public.tlc_learning_purchase(uuid, text) from public, anon;
grant execute on function public.tlc_learning_purchase(uuid, text) to authenticated;

grant execute on function tlc_learning.equip(text, boolean) to authenticated;
create function public.tlc_learning_equip(p_item_key text, p_equipped boolean)
returns void
language sql security invoker set search_path = ''
as $$ select tlc_learning.equip(p_item_key, p_equipped); $$;
revoke all on function public.tlc_learning_equip(text, boolean) from public, anon;
grant execute on function public.tlc_learning_equip(text, boolean) to authenticated;

grant execute on function tlc_learning.admin(uuid) to authenticated;
create function public.tlc_learning_admin(p_student_id uuid default null)
returns jsonb
language sql stable security invoker set search_path = ''
as $$ select tlc_learning.admin(p_student_id); $$;
revoke all on function public.tlc_learning_admin(uuid) from public, anon;
grant execute on function public.tlc_learning_admin(uuid) to authenticated;

grant execute on function tlc_learning.students(text) to authenticated;
create function public.tlc_learning_students(p_query text)
returns jsonb
language sql stable security invoker set search_path = ''
as $$ select tlc_learning.students(p_query); $$;
revoke all on function public.tlc_learning_students(text) from public, anon;
grant execute on function public.tlc_learning_students(text) to authenticated;

grant execute on function tlc_learning.confirm(uuid, uuid, text) to authenticated;
create function public.tlc_learning_confirm(p_student_id uuid, p_instruction_id uuid, p_kind text)
returns jsonb
language sql security invoker set search_path = ''
as $$ select tlc_learning.confirm(p_student_id, p_instruction_id, p_kind); $$;
revoke all on function public.tlc_learning_confirm(uuid, uuid, text) from public, anon;
grant execute on function public.tlc_learning_confirm(uuid, uuid, text) to authenticated;

grant execute on function tlc_learning.award(uuid, text) to authenticated;
create function public.tlc_learning_award(p_student_id uuid, p_key text)
returns void
language sql security invoker set search_path = ''
as $$ select tlc_learning.award(p_student_id, p_key); $$;
revoke all on function public.tlc_learning_award(uuid, text) from public, anon;
grant execute on function public.tlc_learning_award(uuid, text) to authenticated;

grant execute on function tlc_learning.define_achievement(text, text) to authenticated;
create function public.tlc_learning_define_achievement(p_title text, p_kind text)
returns text
language sql security invoker set search_path = ''
as $$ select tlc_learning.define_achievement(p_title, p_kind); $$;
revoke all on function public.tlc_learning_define_achievement(text, text) from public, anon;
grant execute on function public.tlc_learning_define_achievement(text, text) to authenticated;

grant execute on function tlc_learning.open_season(text, timestamptz, timestamptz, integer) to authenticated;
create function public.tlc_learning_open_season(p_title text, p_starts_at timestamptz, p_ends_at timestamptz, p_final_xp integer)
returns uuid
language sql security invoker set search_path = ''
as $$ select tlc_learning.open_season(p_title, p_starts_at, p_ends_at, p_final_xp); $$;
revoke all on function public.tlc_learning_open_season(text, timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.tlc_learning_open_season(text, timestamptz, timestamptz, integer) to authenticated;

grant execute on function tlc_learning.get_lesson(uuid) to authenticated;
create function public.tlc_learning_get_lesson(p_instruction_id uuid)
returns jsonb
language sql stable security invoker set search_path = ''
as $$ select tlc_learning.get_lesson(p_instruction_id); $$;
revoke all on function public.tlc_learning_get_lesson(uuid) from public, anon;
grant execute on function public.tlc_learning_get_lesson(uuid) to authenticated;

grant execute on function tlc_learning.save_lesson(uuid, text, integer, integer, boolean) to authenticated;
create function public.tlc_learning_save_lesson(p_instruction_id uuid, p_topic text, p_position integer, p_build_difficulty integer, p_program_enabled boolean)
returns void
language sql security invoker set search_path = ''
as $$ select tlc_learning.save_lesson(p_instruction_id, p_topic, p_position, p_build_difficulty, p_program_enabled); $$;
revoke all on function public.tlc_learning_save_lesson(uuid, text, integer, integer, boolean) from public, anon;
grant execute on function public.tlc_learning_save_lesson(uuid, text, integer, integer, boolean) to authenticated;
