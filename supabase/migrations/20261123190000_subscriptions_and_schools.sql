-- Subscriptions (solo, school_mini, school_pro), organizations, groups, invites,
-- solo auto-check progress, scoped teacher access, and CloudPayments KZ billing ledger.

create schema if not exists tlc_billing;
revoke all on schema tlc_billing from public, anon, authenticated;
grant usage on schema tlc_billing to service_role;

create table if not exists tlc_billing.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  plan text not null check (plan in ('school_mini', 'school_pro')),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  teacher_limit integer not null check (teacher_limit >= 1),
  student_limit integer not null check (student_limit >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tlc_billing_organizations_owner_idx
  on tlc_billing.organizations (owner_id);

create table if not exists tlc_billing.org_groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references tlc_billing.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  teacher_id uuid references public.profiles(id) on delete set null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists tlc_billing_org_groups_org_idx
  on tlc_billing.org_groups (org_id, teacher_id);

create table if not exists tlc_billing.org_members (
  org_id uuid not null references tlc_billing.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  org_role text not null check (org_role in ('school_admin', 'teacher', 'student')),
  group_id uuid references tlc_billing.org_groups(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'removed')),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create unique index if not exists tlc_billing_one_active_org_per_user_uidx
  on tlc_billing.org_members (user_id)
  where status = 'active';

create index if not exists tlc_billing_org_members_org_role_idx
  on tlc_billing.org_members (org_id, status, org_role, group_id);

create table if not exists tlc_billing.org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references tlc_billing.organizations(id) on delete cascade,
  group_id uuid references tlc_billing.org_groups(id) on delete set null,
  target_role text not null check (target_role in ('student', 'teacher')),
  code_hash text not null unique,
  code_hint text not null,
  max_uses integer not null default 30 check (max_uses between 1 and 500),
  used_count integer not null default 0 check (used_count >= 0),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists tlc_billing_org_invites_org_idx
  on tlc_billing.org_invites (org_id, created_at desc);

create table if not exists tlc_billing.org_invite_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started timestamptz not null default now(),
  attempts integer not null default 0
);

create table if not exists tlc_billing.subscriptions (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('user', 'org')),
  subject_id uuid not null,
  plan text not null check (plan in ('solo', 'school_mini', 'school_pro')),
  status text not null check (status in ('active', 'past_due', 'canceled')),
  provider text not null check (provider in ('cloudpayments_kz', 'manual', 'test')),
  external_id text,
  amount_kzt integer check (amount_kzt is null or amount_kzt >= 0),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_subject_plan_check check (
    (subject_type = 'user' and plan = 'solo')
    or (subject_type = 'org' and plan in ('school_mini', 'school_pro'))
  )
);

create unique index if not exists tlc_billing_subscriptions_subject_uidx
  on tlc_billing.subscriptions (subject_type, subject_id);

create index if not exists tlc_billing_subscriptions_external_idx
  on tlc_billing.subscriptions (provider, external_id)
  where external_id is not null;

create table if not exists tlc_billing.billing_events (
  provider text not null,
  event_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now(),
  primary key (provider, event_id)
);

create table if not exists tlc_learning.roadmap_card_checks (
  card_id uuid primary key references tlc_learning.roadmap_cards(id) on delete cascade,
  check_kind text not null default 'quiz' check (check_kind in ('quiz', 'build', 'code')),
  question text not null check (char_length(trim(question)) between 1 and 500),
  options jsonb not null default '[]'::jsonb,
  answer_hash text not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists tlc_learning.solo_check_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references tlc_learning.roadmap_cards(id) on delete cascade,
  window_started timestamptz not null default now(),
  attempts integer not null default 0,
  primary key (user_id, card_id)
);

alter table tlc_billing.organizations enable row level security;
alter table tlc_billing.org_groups enable row level security;
alter table tlc_billing.org_members enable row level security;
alter table tlc_billing.org_invites enable row level security;
alter table tlc_billing.org_invite_attempts enable row level security;
alter table tlc_billing.subscriptions enable row level security;
alter table tlc_billing.billing_events enable row level security;
alter table tlc_learning.roadmap_card_checks enable row level security;
alter table tlc_learning.solo_check_attempts enable row level security;

revoke all on all tables in schema tlc_billing from public, anon, authenticated;
revoke all on tlc_learning.roadmap_card_checks from public, anon, authenticated;
revoke all on tlc_learning.solo_check_attempts from public, anon, authenticated;

grant select, insert, update, delete on all tables in schema tlc_billing to service_role;

-- Enforce seat limits and school_mini single-teacher cap atomically.
create or replace function tlc_billing.enforce_org_member_limits()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_org tlc_billing.organizations;
  v_teachers integer := 0;
  v_students integer := 0;
begin
  if new.status <> 'active' then
    return new;
  end if;

  select * into v_org
  from tlc_billing.organizations o
  where o.id = new.org_id
  for update;

  if not found then
    raise exception 'organization not found' using errcode = '22023';
  end if;

  if new.org_role in ('school_admin', 'teacher') then
    select count(*) into v_teachers
    from tlc_billing.org_members m
    where m.org_id = new.org_id
      and m.status = 'active'
      and m.org_role in ('school_admin', 'teacher')
      and m.user_id <> new.user_id;

    if v_org.plan = 'school_mini' and v_teachers >= 1 then
      raise exception 'school_mini_teacher_limit' using errcode = '42501';
    end if;
    if v_teachers >= v_org.teacher_limit then
      raise exception 'teacher_limit_reached' using errcode = '42501';
    end if;
  elsif new.org_role = 'student' then
    select count(*) into v_students
    from tlc_billing.org_members m
    where m.org_id = new.org_id
      and m.status = 'active'
      and m.org_role = 'student'
      and m.user_id <> new.user_id;

    if v_students >= v_org.student_limit then
      raise exception 'student_limit_reached' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists tlc_billing_org_member_limits_trg on tlc_billing.org_members;
create trigger tlc_billing_org_member_limits_trg
  before insert or update of status, org_role, org_id on tlc_billing.org_members
  for each row
  execute function tlc_billing.enforce_org_member_limits();

create or replace function tlc_billing.has_active_subscription(p_subject_type text, p_subject_id uuid)
returns boolean
language sql stable set search_path = ''
as $$
  select exists (
    select 1
    from tlc_billing.subscriptions s
    where s.subject_type = p_subject_type
      and s.subject_id = p_subject_id
      and s.status = 'active'
      and (s.current_period_end is null or s.current_period_end > now())
  );
$$;

create or replace function tlc_billing.user_entitlements_row(p_user_id uuid)
returns jsonb
language plpgsql stable set search_path = ''
as $$
declare
  v_role text;
  v_onboarding boolean;
  v_is_admin boolean := false;
  v_member record;
  v_org_sub tlc_billing.subscriptions;
  v_user_sub tlc_billing.subscriptions;
  v_has_active_org boolean := false;
  v_has_active_solo boolean := false;
  v_is_school_student boolean := false;
  v_can_access boolean := false;
  v_can_manage_school boolean := false;
  v_can_use_solo boolean := false;
  v_plan text := null;
  v_status text := 'none';
  v_source text := 'none';
  v_period_end timestamptz := null;
begin
  if p_user_id is null then
    return jsonb_build_object(
      'user_id', null,
      'plan', null,
      'status', 'none',
      'source', 'none',
      'org_id', null,
      'org_name', null,
      'org_plan', null,
      'org_role', null,
      'group_id', null,
      'group_name', null,
      'can_access_learning', false,
      'can_manage_school', false,
      'can_use_solo_check', false,
      'is_school_student', false,
      'is_admin', false,
      'current_period_end', null
    );
  end if;

  select p.role, p.onboarding_complete into v_role, v_onboarding
  from public.profiles p where p.id = p_user_id;

  select exists (select 1 from public.instruction_admins a where a.user_id = p_user_id)
  into v_is_admin;

  select
    m.org_id,
    m.org_role,
    m.group_id,
    o.name as org_name,
    o.plan as org_plan,
    g.name as group_name
  into v_member
  from tlc_billing.org_members m
  join tlc_billing.organizations o on o.id = m.org_id
  left join tlc_billing.org_groups g on g.id = m.group_id
  where m.user_id = p_user_id and m.status = 'active'
  limit 1;

  if v_member.org_id is not null then
    v_is_school_student := (v_member.org_role = 'student');
    select * into v_org_sub
    from tlc_billing.subscriptions s
    where s.subject_type = 'org' and s.subject_id = v_member.org_id
    limit 1;

    if found and v_org_sub.status = 'active' and (v_org_sub.current_period_end is null or v_org_sub.current_period_end > now()) then
      v_has_active_org := true;
    end if;
  end if;

  select * into v_user_sub
  from tlc_billing.subscriptions s
  where s.subject_type = 'user' and s.subject_id = p_user_id and s.plan = 'solo'
  limit 1;

  if found and v_user_sub.status = 'active' and (v_user_sub.current_period_end is null or v_user_sub.current_period_end > now()) then
    v_has_active_solo := true;
  end if;

  if v_is_admin then
    v_can_access := true;
    v_can_manage_school := true;
    v_source := 'admin';
    v_status := 'active';
  elsif v_onboarding is true and v_role <> 'parent' then
    if v_has_active_org then
      v_can_access := true;
      v_can_manage_school := v_member.org_role in ('school_admin', 'teacher');
      v_plan := v_org_sub.plan;
      v_status := v_org_sub.status;
      v_source := 'org';
      v_period_end := v_org_sub.current_period_end;
    elsif v_has_active_solo and v_role = 'student' then
      v_can_access := true;
      v_can_use_solo := not v_is_school_student;
      v_plan := v_user_sub.plan;
      v_status := v_user_sub.status;
      v_source := 'user';
      v_period_end := v_user_sub.current_period_end;
    elsif v_member.org_id is not null and v_org_sub.id is not null then
      v_plan := v_org_sub.plan;
      v_status := case
        when v_org_sub.status = 'active' and v_org_sub.current_period_end <= now() then 'past_due'
        else v_org_sub.status
      end;
      v_source := 'org';
      v_period_end := v_org_sub.current_period_end;
    elsif v_user_sub.id is not null then
      v_plan := v_user_sub.plan;
      v_status := case
        when v_user_sub.status = 'active' and v_user_sub.current_period_end <= now() then 'past_due'
        else v_user_sub.status
      end;
      v_source := 'user';
      v_period_end := v_user_sub.current_period_end;
    end if;
  end if;

  return jsonb_build_object(
    'user_id', p_user_id,
    'plan', v_plan,
    'status', v_status,
    'source', v_source,
    'org_id', v_member.org_id,
    'org_name', v_member.org_name,
    'org_plan', v_member.org_plan,
    'org_role', v_member.org_role,
    'group_id', v_member.group_id,
    'group_name', v_member.group_name,
    'can_access_learning', v_can_access,
    'can_manage_school', v_can_manage_school,
    'can_use_solo_check', v_can_use_solo,
    'is_school_student', v_is_school_student,
    'is_admin', v_is_admin,
    'current_period_end', v_period_end
  );
end;
$$;

create or replace function public.get_effective_entitlements()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  return tlc_billing.user_entitlements_row(auth.uid());
end;
$$;

-- Scope teacher roadmap administration and student progress strictly to active org / groups.
create or replace function tlc_learning.require_roadmap_editor()
returns void
language plpgsql stable set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_ent jsonb;
begin
  if v_user_id is null then
    raise exception 'roadmap editor required' using errcode = '42501';
  end if;
  if public.is_instruction_admin() then
    return;
  end if;
  v_ent := tlc_billing.user_entitlements_row(v_user_id);
  if coalesce((v_ent ->> 'can_manage_school')::boolean, false) is not true then
    raise exception 'active school subscription required' using errcode = '42501';
  end if;
end;
$$;

create or replace function tlc_learning.require_roadmap_student_access(p_student_id uuid)
returns void
language plpgsql stable set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_caller record;
begin
  perform tlc_learning.require_student(p_student_id);

  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if public.is_instruction_admin() then
    return;
  end if;

  select m.org_id, m.org_role, o.plan
  into v_caller
  from tlc_billing.org_members m
  join tlc_billing.organizations o on o.id = m.org_id
  where m.user_id = v_user_id
    and m.status = 'active'
    and m.org_role in ('school_admin', 'teacher')
    and tlc_billing.has_active_subscription('org', m.org_id)
  limit 1;

  if not found then
    raise exception 'active school subscription required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from tlc_billing.org_members sm
    left join tlc_billing.org_groups g on g.id = sm.group_id
    where sm.org_id = v_caller.org_id
      and sm.user_id = p_student_id
      and sm.org_role = 'student'
      and sm.status = 'active'
      and (
        v_caller.org_role = 'school_admin'
        or v_caller.plan = 'school_mini'
        or g.teacher_id = v_user_id
      )
  ) then
    raise exception 'student outside school scope' using errcode = '42501';
  end if;
end;
$$;

create or replace function tlc_learning.solo_checks_json()
returns jsonb
language sql stable set search_path = ''
as $$
  select coalesce(jsonb_object_agg(
    rc.card_id::text,
    jsonb_build_object(
      'checkKind', rc.check_kind,
      'question', rc.question,
      'options', rc.options
    )
  ), '{}'::jsonb)
  from tlc_learning.roadmap_card_checks rc;
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
  v_ent jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_kit is not null and p_kit not in ('ev3', 'vex', 'spike') then
    raise exception 'invalid kit' using errcode = '22023';
  end if;

  select p.role, p.onboarding_complete into v_role, v_onboarding
  from public.profiles p where p.id = v_user_id;

  v_ent := tlc_billing.user_entitlements_row(v_user_id);
  if coalesce((v_ent ->> 'can_access_learning')::boolean, false) is not true then
    raise exception 'subscription_required' using errcode = '42501';
  end if;

  v_is_editor := coalesce((v_ent ->> 'can_manage_school')::boolean, false);
  if not v_is_editor and not (v_onboarding is true and v_role = 'student') then
    raise exception 'roadmap access denied' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'role', v_role,
    'is_editor', v_is_editor,
    'can_use_solo_check', coalesce((v_ent ->> 'can_use_solo_check')::boolean, false),
    'is_school_student', coalesce((v_ent ->> 'is_school_student')::boolean, false),
    'solo_checks', case when coalesce((v_ent ->> 'can_use_solo_check')::boolean, false) then tlc_learning.solo_checks_json() else '{}'::jsonb end,
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
  v_ent jsonb;
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

  if v_user_id is null then
    return jsonb_build_object(
      'exists', true,
      'allowed', false,
      'reason', 'unauthenticated',
      'required_rank', coalesce(v_min_rank, 0),
      'required_kit', v_min_kit
    );
  end if;

  if public.is_instruction_admin() then
    return jsonb_build_object(
      'exists', true,
      'allowed', true,
      'bypass', true,
      'required_rank', coalesce(v_min_rank, 0)
    );
  end if;

  select p.role, p.onboarding_complete into v_role, v_onboarding
  from public.profiles p where p.id = v_user_id;

  if v_onboarding is not true or v_role not in ('student', 'teacher') then
    return jsonb_build_object(
      'exists', true,
      'allowed', false,
      'reason', 'forbidden',
      'required_rank', coalesce(v_min_rank, 0),
      'required_kit', v_min_kit
    );
  end if;

  v_ent := tlc_billing.user_entitlements_row(v_user_id);
  if coalesce((v_ent ->> 'can_access_learning')::boolean, false) is not true then
    return jsonb_build_object(
      'exists', true,
      'allowed', false,
      'reason', 'subscription_required',
      'required_rank', coalesce(v_min_rank, 0),
      'required_kit', v_min_kit
    );
  end if;

  if v_role = 'teacher' then
    return jsonb_build_object(
      'exists', true,
      'allowed', true,
      'bypass', true,
      'required_rank', coalesce(v_min_rank, 0)
    );
  end if;

  if v_min_rank is null or v_min_rank = 0 then
    return jsonb_build_object('exists', true, 'allowed', true, 'required_rank', 0);
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

create or replace function public.tlc_roadmap_search_students(p_query text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_query text := lower(trim(coalesce(p_query, '')));
  v_is_admin boolean := public.is_instruction_admin();
  v_caller record;
begin
  perform tlc_learning.require_roadmap_editor();
  if char_length(v_query) not between 2 and 100 then
    return '[]'::jsonb;
  end if;

  if v_is_admin then
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
  end if;

  select m.org_id, m.org_role, o.plan
  into v_caller
  from tlc_billing.org_members m
  join tlc_billing.organizations o on o.id = m.org_id
  where m.user_id = v_user_id
    and m.status = 'active'
    and m.org_role in ('school_admin', 'teacher')
    and tlc_billing.has_active_subscription('org', m.org_id)
  limit 1;

  if not found then
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
      from tlc_billing.org_members sm
      join public.profiles p on p.id = sm.user_id
      left join tlc_billing.org_groups g on g.id = sm.group_id
      where sm.org_id = v_caller.org_id
        and sm.org_role = 'student'
        and sm.status = 'active'
        and p.role = 'student'
        and p.onboarding_complete
        and (
          v_caller.org_role = 'school_admin'
          or v_caller.plan = 'school_mini'
          or g.teacher_id = v_user_id
        )
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
  perform tlc_learning.require_roadmap_student_access(p_student_id);
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
  perform tlc_learning.require_roadmap_student_access(p_student_id);
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

-- Server-verified solo card completion (prohibited for school students).
create or replace function public.complete_solo_card(
  p_card_id uuid,
  p_answer text
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_ent jsonb;
  v_card tlc_learning.roadmap_cards;
  v_check tlc_learning.roadmap_card_checks;
  v_has_check boolean := false;
  v_attempts integer := 0;
  v_normalized text := lower(trim(coalesce(p_answer, '')));
  v_answer_hash text;
  v_current_rank integer := 0;
  v_next_rank integer := 0;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  v_ent := tlc_billing.user_entitlements_row(v_user_id);
  if coalesce((v_ent ->> 'is_school_student')::boolean, false) then
    raise exception 'school_student_forbidden' using errcode = '42501';
  end if;
  if coalesce((v_ent ->> 'can_use_solo_check')::boolean, false) is not true then
    raise exception 'solo_subscription_required' using errcode = '42501';
  end if;

  perform tlc_learning.lock_student(v_user_id);

  select c.* into v_card
  from tlc_learning.roadmap_cards c
  left join public.instructions i on i.id = c.instruction_id
  where c.id = p_card_id
    and (c.instruction_id is null or i.status = 'published');
  if not found then
    raise exception 'card not found' using errcode = '22023';
  end if;

  v_current_rank := tlc_learning.compute_kit_rank(v_user_id, v_card.kit);
  if v_card.rank_index > v_current_rank then
    raise exception 'card_rank_locked' using errcode = '42501';
  end if;

  insert into tlc_learning.solo_check_attempts (user_id, card_id, window_started, attempts)
  values (v_user_id, p_card_id, now(), 1)
  on conflict (user_id, card_id) do update set
    attempts = case
      when tlc_learning.solo_check_attempts.window_started < now() - interval '5 minutes' then 1
      else tlc_learning.solo_check_attempts.attempts + 1
    end,
    window_started = case
      when tlc_learning.solo_check_attempts.window_started < now() - interval '5 minutes' then now()
      else tlc_learning.solo_check_attempts.window_started
    end
  returning attempts into v_attempts;

  if v_attempts > 5 then
    return jsonb_build_object('ok', false, 'error', 'solo_check_rate_limited', 'attempts_remaining', 0);
  end if;

  if v_normalized = '' then
    return jsonb_build_object('ok', false, 'error', 'invalid_answer', 'attempts_remaining', greatest(0, 5 - v_attempts));
  end if;

  select * into v_check
  from tlc_learning.roadmap_card_checks rc
  where rc.card_id = p_card_id;
  v_has_check := found;

  if v_has_check then
    v_answer_hash := encode(extensions.digest(convert_to(v_normalized, 'utf8'), 'sha256'), 'hex');
    if v_answer_hash <> v_check.answer_hash then
      return jsonb_build_object('ok', false, 'error', 'wrong_answer', 'attempts_remaining', greatest(0, 5 - v_attempts));
    end if;
  else
    -- Default server-verified robotics kit check when no custom quiz is configured.
    if v_normalized <> v_card.kit then
      return jsonb_build_object('ok', false, 'error', 'wrong_answer', 'attempts_remaining', greatest(0, 5 - v_attempts));
    end if;
  end if;

  update tlc_learning.solo_check_attempts
  set attempts = 0
  where user_id = v_user_id and card_id = p_card_id;

  if v_card.mechanics_points > 0 then
    insert into tlc_learning.roadmap_card_progress (student_id, card_id, skill, confirmed_by)
    values (v_user_id, p_card_id, 'mechanics', null)
    on conflict (student_id, card_id, skill) do nothing;
  end if;
  if v_card.logic_points > 0 then
    insert into tlc_learning.roadmap_card_progress (student_id, card_id, skill, confirmed_by)
    values (v_user_id, p_card_id, 'logic', null)
    on conflict (student_id, card_id, skill) do nothing;
  end if;
  if v_card.creativity_points > 0 then
    insert into tlc_learning.roadmap_card_progress (student_id, card_id, skill, confirmed_by)
    values (v_user_id, p_card_id, 'creativity', null)
    on conflict (student_id, card_id, skill) do nothing;
  end if;

  v_next_rank := tlc_learning.sync_student_kit_rank(v_user_id, v_card.kit);
  return jsonb_build_object('ok', true, 'kit', v_card.kit, 'unlocked_rank', v_next_rank);
end;
$$;

-- School management & invite RPCs.
create or replace function public.tlc_school_workspace()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_member record;
  v_org tlc_billing.organizations;
  v_sub tlc_billing.subscriptions;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select m.* into v_member
  from tlc_billing.org_members m
  where m.user_id = v_user_id and m.status = 'active'
    and m.org_role in ('school_admin', 'teacher')
  limit 1;

  if not found then
    return jsonb_build_object('org', null, 'subscription', null, 'groups', '[]'::jsonb, 'members', '[]'::jsonb, 'invites', '[]'::jsonb);
  end if;

  select * into v_org from tlc_billing.organizations where id = v_member.org_id;
  select * into v_sub from tlc_billing.subscriptions where subject_type = 'org' and subject_id = v_member.org_id;

  return jsonb_build_object(
    'my_org_role', v_member.org_role,
    'org', jsonb_build_object(
      'id', v_org.id,
      'name', v_org.name,
      'plan', v_org.plan,
      'owner_id', v_org.owner_id,
      'teacher_limit', v_org.teacher_limit,
      'student_limit', v_org.student_limit
    ),
    'subscription', case when v_sub.id is not null then jsonb_build_object(
      'plan', v_sub.plan,
      'status', v_sub.status,
      'current_period_end', v_sub.current_period_end
    ) else null end,
    'groups', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', g.id,
        'name', g.name,
        'teacher_id', g.teacher_id,
        'is_default', g.is_default
      ) order by g.is_default desc, g.created_at asc), '[]'::jsonb)
      from tlc_billing.org_groups g
      where g.org_id = v_org.id
        and (v_member.org_role = 'school_admin' or v_org.plan = 'school_mini' or g.teacher_id = v_user_id)
    ),
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', m.user_id,
        'org_role', m.org_role,
        'group_id', m.group_id,
        'nickname', p.nickname,
        'login', p.login,
        'joined_at', m.joined_at
      ) order by m.org_role asc, p.nickname asc), '[]'::jsonb)
      from tlc_billing.org_members m
      join public.profiles p on p.id = m.user_id
      left join tlc_billing.org_groups g on g.id = m.group_id
      where m.org_id = v_org.id
        and m.status = 'active'
        and (v_member.org_role = 'school_admin' or v_org.plan = 'school_mini' or g.teacher_id = v_user_id or m.user_id = v_user_id)
    ),
    'invites', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', iv.id,
        'group_id', iv.group_id,
        'target_role', iv.target_role,
        'code_hint', iv.code_hint,
        'max_uses', iv.max_uses,
        'used_count', iv.used_count,
        'expires_at', iv.expires_at,
        'revoked_at', iv.revoked_at,
        'created_at', iv.created_at
      ) order by iv.created_at desc), '[]'::jsonb)
      from tlc_billing.org_invites iv
      left join tlc_billing.org_groups g on g.id = iv.group_id
      where iv.org_id = v_org.id
        and (v_member.org_role = 'school_admin' or v_org.plan = 'school_mini' or g.teacher_id = v_user_id or iv.created_by = v_user_id)
    )
  );
end;
$$;

create or replace function public.create_org_group(
  p_org_id uuid,
  p_name text,
  p_teacher_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := trim(coalesce(p_name, ''));
  v_org tlc_billing.organizations;
  v_teacher uuid := coalesce(p_teacher_id, v_user_id);
  v_id uuid;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'invalid_group_name' using errcode = '22023';
  end if;

  select * into v_org from tlc_billing.organizations where id = p_org_id;
  if not found or v_org.plan <> 'school_pro' then
    raise exception 'school_pro_required' using errcode = '42501';
  end if;
  if not tlc_billing.has_active_subscription('org', p_org_id) then
    raise exception 'subscription_required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from tlc_billing.org_members m
    where m.org_id = p_org_id and m.user_id = v_user_id and m.status = 'active' and m.org_role = 'school_admin'
  ) then
    raise exception 'school_admin_required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from tlc_billing.org_members m
    where m.org_id = p_org_id and m.user_id = v_teacher and m.status = 'active' and m.org_role in ('school_admin', 'teacher')
  ) then
    raise exception 'invalid_group_teacher' using errcode = '22023';
  end if;

  insert into tlc_billing.org_groups (org_id, name, teacher_id, is_default)
  values (p_org_id, v_name, v_teacher, false)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.create_org_invite(
  p_org_id uuid,
  p_group_id uuid default null,
  p_target_role text default 'student',
  p_max_uses integer default 30,
  p_ttl_minutes integer default 1440
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_member tlc_billing.org_members;
  v_org tlc_billing.organizations;
  v_group_id uuid := p_group_id;
  v_group tlc_billing.org_groups;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text := '';
  v_i integer;
  v_hash text;
  v_hint text;
  v_expires_at timestamptz;
  v_invite_id uuid;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_target_role not in ('student', 'teacher') then
    raise exception 'invalid_target_role' using errcode = '22023';
  end if;
  if p_max_uses is null or p_max_uses not between 1 and 500 then
    raise exception 'invalid_max_uses' using errcode = '22023';
  end if;
  if p_ttl_minutes is null or p_ttl_minutes not between 5 and 43200 then
    raise exception 'invalid_ttl' using errcode = '22023';
  end if;

  select * into v_org from tlc_billing.organizations where id = p_org_id for update;
  if not found then raise exception 'organization not found' using errcode = '22023'; end if;
  if not tlc_billing.has_active_subscription('org', p_org_id) then
    raise exception 'subscription_required' using errcode = '42501';
  end if;

  select * into v_member
  from tlc_billing.org_members m
  where m.org_id = p_org_id and m.user_id = v_user_id and m.status = 'active'
    and m.org_role in ('school_admin', 'teacher');
  if not found then
    raise exception 'school_staff_required' using errcode = '42501';
  end if;

  if p_target_role = 'teacher' then
    if v_org.plan = 'school_mini' then
      raise exception 'school_mini_teacher_limit' using errcode = '42501';
    end if;
    if v_member.org_role <> 'school_admin' then
      raise exception 'school_admin_required' using errcode = '42501';
    end if;
  end if;

  if v_group_id is null then
    select id into v_group_id
    from tlc_billing.org_groups g
    where g.org_id = p_org_id
      and (v_member.org_role = 'school_admin' or g.teacher_id = v_user_id)
    order by g.is_default desc, g.created_at asc
    limit 1;
  end if;

  if v_group_id is not null then
    select * into v_group from tlc_billing.org_groups g where g.id = v_group_id and g.org_id = p_org_id;
    if not found then
      raise exception 'group_not_found' using errcode = '22023';
    end if;
    if v_member.org_role <> 'school_admin' and v_org.plan <> 'school_mini' and v_group.teacher_id <> v_user_id then
      raise exception 'group_access_denied' using errcode = '42501';
    end if;
  end if;

  v_bytes := extensions.gen_random_bytes(10);
  for v_i in 0..9 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, v_i) % 32) + 1, 1);
  end loop;

  v_hash := encode(extensions.digest(convert_to(v_code, 'utf8'), 'sha256'), 'hex');
  v_hint := left(v_code, 2) || '••••' || right(v_code, 2);
  v_expires_at := now() + make_interval(mins => p_ttl_minutes);

  insert into tlc_billing.org_invites (
    org_id, group_id, target_role, code_hash, code_hint, max_uses, expires_at, created_by
  ) values (
    p_org_id, v_group_id, p_target_role, v_hash, v_hint, p_max_uses, v_expires_at, v_user_id
  )
  returning id into v_invite_id;

  return jsonb_build_object(
    'invite_id', v_invite_id,
    'code', v_code,
    'code_hint', v_hint,
    'target_role', p_target_role,
    'group_id', v_group_id,
    'max_uses', p_max_uses,
    'expires_at', v_expires_at
  );
end;
$$;

create or replace function public.revoke_org_invite(p_invite_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_inv tlc_billing.org_invites;
  v_member tlc_billing.org_members;
  v_group tlc_billing.org_groups;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode = '42501'; end if;

  select * into v_inv from tlc_billing.org_invites where id = p_invite_id for update;
  if not found then return false; end if;

  select * into v_member
  from tlc_billing.org_members m
  where m.org_id = v_inv.org_id and m.user_id = v_user_id and m.status = 'active'
    and m.org_role in ('school_admin', 'teacher');
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;

  if v_member.org_role <> 'school_admin' and v_inv.created_by <> v_user_id then
    if v_inv.group_id is null then raise exception 'forbidden' using errcode = '42501'; end if;
    select * into v_group from tlc_billing.org_groups where id = v_inv.group_id;
    if v_group.teacher_id <> v_user_id then raise exception 'forbidden' using errcode = '42501'; end if;
  end if;

  update tlc_billing.org_invites
  set revoked_at = coalesce(revoked_at, now())
  where id = p_invite_id;
  return true;
end;
$$;

create or replace function public.remove_org_member(p_org_id uuid, p_target_user_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_org tlc_billing.organizations;
  v_caller tlc_billing.org_members;
  v_target tlc_billing.org_members;
  v_group tlc_billing.org_groups;
begin
  if v_user_id is null then raise exception 'authentication required' using errcode = '42501'; end if;

  select * into v_org from tlc_billing.organizations where id = p_org_id;
  if not found then raise exception 'organization not found' using errcode = '22023'; end if;
  if p_target_user_id = v_org.owner_id then
    raise exception 'cannot_remove_owner' using errcode = '42501';
  end if;

  select * into v_caller
  from tlc_billing.org_members m
  where m.org_id = p_org_id and m.user_id = v_user_id and m.status = 'active'
    and m.org_role in ('school_admin', 'teacher');
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;

  select * into v_target
  from tlc_billing.org_members m
  where m.org_id = p_org_id and m.user_id = p_target_user_id and m.status = 'active';
  if not found then return false; end if;

  if v_caller.org_role <> 'school_admin' then
    if v_target.org_role <> 'student' then raise exception 'forbidden' using errcode = '42501'; end if;
    if v_org.plan <> 'school_mini' then
      select * into v_group from tlc_billing.org_groups where id = v_target.group_id;
      if not found or v_group.teacher_id <> v_user_id then raise exception 'forbidden' using errcode = '42501'; end if;
    end if;
  end if;

  update tlc_billing.org_members
  set status = 'removed', updated_at = now()
  where org_id = p_org_id and user_id = p_target_user_id;
  return true;
end;
$$;

create or replace function public.redeem_org_invite(p_code text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile record;
  v_attempts integer := 0;
  v_code text := upper(regexp_replace(trim(coalesce(p_code, '')), '[^A-Za-z0-9]', '', 'g'));
  v_hash text;
  v_inv tlc_billing.org_invites;
  v_org tlc_billing.organizations;
  v_existing tlc_billing.org_members;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select p.role, p.onboarding_complete into v_profile
  from public.profiles p where p.id = v_user_id for update;
  if not found or v_profile.onboarding_complete is not true then
    raise exception 'onboarding_required' using errcode = '42501';
  end if;

  insert into tlc_billing.org_invite_attempts (user_id, window_started, attempts)
  values (v_user_id, now(), 1)
  on conflict (user_id) do update set
    attempts = case
      when tlc_billing.org_invite_attempts.window_started < now() - interval '15 minutes' then 1
      else tlc_billing.org_invite_attempts.attempts + 1
    end,
    window_started = case
      when tlc_billing.org_invite_attempts.window_started < now() - interval '15 minutes' then now()
      else tlc_billing.org_invite_attempts.window_started
    end
  returning attempts into v_attempts;

  if v_attempts > 5 then
    return jsonb_build_object('ok', false, 'error', 'invite_rate_limited', 'attempts_remaining', 0);
  end if;

  if char_length(v_code) < 8 or char_length(v_code) > 32 then
    return jsonb_build_object('ok', false, 'error', 'invite_invalid', 'attempts_remaining', greatest(0, 5 - v_attempts));
  end if;

  v_hash := encode(extensions.digest(convert_to(v_code, 'utf8'), 'sha256'), 'hex');
  select * into v_inv from tlc_billing.org_invites where code_hash = v_hash for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invite_invalid', 'attempts_remaining', greatest(0, 5 - v_attempts));
  end if;
  if v_inv.revoked_at is not null then
    return jsonb_build_object('ok', false, 'error', 'invite_revoked');
  end if;
  if v_inv.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'invite_expired');
  end if;
  if v_inv.used_count >= v_inv.max_uses then
    return jsonb_build_object('ok', false, 'error', 'invite_exhausted');
  end if;

  if v_inv.target_role = 'student' and v_profile.role <> 'student' then
    return jsonb_build_object('ok', false, 'error', 'student_role_required');
  end if;
  if v_inv.target_role = 'teacher' and v_profile.role <> 'teacher' then
    return jsonb_build_object('ok', false, 'error', 'teacher_role_required');
  end if;

  select * into v_org from tlc_billing.organizations where id = v_inv.org_id for update;
  if not tlc_billing.has_active_subscription('org', v_org.id) then
    return jsonb_build_object('ok', false, 'error', 'school_subscription_inactive');
  end if;

  select * into v_existing
  from tlc_billing.org_members m
  where m.user_id = v_user_id and m.status = 'active'
  limit 1;

  if found and v_existing.org_id <> v_org.id then
    return jsonb_build_object('ok', false, 'error', 'already_in_another_school');
  end if;

  if not found then
    insert into tlc_billing.org_members (org_id, user_id, org_role, group_id, status, joined_at, updated_at)
    values (v_org.id, v_user_id, v_inv.target_role, v_inv.group_id, 'active', now(), now())
    on conflict (org_id, user_id) do update
      set org_role = excluded.org_role,
          group_id = excluded.group_id,
          status = 'active',
          updated_at = now();

    update tlc_billing.org_invites
    set used_count = used_count + 1
    where id = v_inv.id;
  end if;

  update tlc_billing.org_invite_attempts set attempts = 0 where user_id = v_user_id;

  return jsonb_build_object(
    'ok', true,
    'org_id', v_org.id,
    'org_name', v_org.name,
    'org_role', v_inv.target_role,
    'group_id', v_inv.group_id
  );
end;
$$;

-- Billing service_role RPC for idempotent CloudPayments KZ / test-mode updates.
create or replace function tlc_billing.apply_billing_event(
  p_provider text,
  p_event_id text,
  p_event_type text,
  p_payload jsonb,
  p_user_id uuid,
  p_plan text,
  p_status text,
  p_external_id text,
  p_amount_kzt integer,
  p_period_end timestamptz,
  p_org_name text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_inserted integer := 0;
  v_subject_type text;
  v_subject_id uuid;
  v_org_id uuid;
  v_sub_id uuid;
  v_org_title text := coalesce(nullif(trim(coalesce(p_org_name, '')), ''), 'Школа Brick Studio');
  v_teacher_limit integer;
  v_student_limit integer;
  v_profile_role text;
begin
  select p.role into v_profile_role from public.profiles p where p.id = p_user_id;
  if p_plan = 'solo' and coalesce(v_profile_role, '') <> 'student' and not exists (select 1 from public.instruction_admins a where a.user_id = p_user_id) then
    raise exception 'solo_requires_student_role' using errcode = '42501';
  end if;
  if p_plan in ('school_mini', 'school_pro') and coalesce(v_profile_role, '') <> 'teacher' and not exists (select 1 from public.instruction_admins a where a.user_id = p_user_id) then
    raise exception 'school_requires_teacher_role' using errcode = '42501';
  end if;

  insert into tlc_billing.billing_events (provider, event_id, event_type, payload)
  values (p_provider, p_event_id, p_event_type, coalesce(p_payload, '{}'::jsonb))
  on conflict (provider, event_id) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return jsonb_build_object('duplicate', true);
  end if;

  if p_plan = 'solo' then
    v_subject_type := 'user';
    v_subject_id := p_user_id;
  elsif p_plan in ('school_mini', 'school_pro') then
    v_subject_type := 'org';
    v_teacher_limit := case when p_plan = 'school_mini' then 1 else 25 end;
    v_student_limit := case when p_plan = 'school_mini' then 30 else 300 end;

    select o.id into v_org_id
    from tlc_billing.organizations o
    where o.owner_id = p_user_id
    order by o.created_at asc
    limit 1;

    if v_org_id is null then
      insert into tlc_billing.organizations (name, plan, owner_id, teacher_limit, student_limit)
      values (left(v_org_title, 120), p_plan, p_user_id, v_teacher_limit, v_student_limit)
      returning id into v_org_id;

      insert into tlc_billing.org_groups (org_id, name, teacher_id, is_default)
      values (v_org_id, 'Основная группа', p_user_id, true);

      insert into tlc_billing.org_members (org_id, user_id, org_role, status)
      values (v_org_id, p_user_id, 'school_admin', 'active')
      on conflict (org_id, user_id) do update
        set org_role = 'school_admin', status = 'active', updated_at = now();
    else
      update tlc_billing.organizations
      set plan = p_plan,
          teacher_limit = v_teacher_limit,
          student_limit = v_student_limit,
          name = case when nullif(trim(coalesce(p_org_name, '')), '') is not null then left(v_org_title, 120) else name end,
          updated_at = now()
      where id = v_org_id;
    end if;

    v_subject_id := v_org_id;
  else
    raise exception 'invalid plan' using errcode = '22023';
  end if;

  insert into tlc_billing.subscriptions (
    subject_type, subject_id, plan, status, provider, external_id, amount_kzt, current_period_end, updated_at
  ) values (
    v_subject_type, v_subject_id, p_plan, p_status, p_provider, p_external_id, p_amount_kzt, p_period_end, now()
  )
  on conflict (subject_type, subject_id) do update set
    plan = excluded.plan,
    status = excluded.status,
    provider = excluded.provider,
    external_id = coalesce(excluded.external_id, tlc_billing.subscriptions.external_id),
    amount_kzt = coalesce(excluded.amount_kzt, tlc_billing.subscriptions.amount_kzt),
    current_period_end = coalesce(excluded.current_period_end, tlc_billing.subscriptions.current_period_end),
    updated_at = now()
  returning id into v_sub_id;

  return jsonb_build_object(
    'duplicate', false,
    'subscription_id', v_sub_id,
    'subject_type', v_subject_type,
    'subject_id', v_subject_id,
    'org_id', v_org_id,
    'plan', p_plan,
    'status', p_status
  );
end;
$$;

revoke all on all functions in schema tlc_billing from public, anon, authenticated;
grant execute on function tlc_billing.apply_billing_event(text, text, text, jsonb, uuid, text, text, text, integer, timestamptz, text) to service_role;

revoke all on function public.get_effective_entitlements() from public, anon;
grant execute on function public.get_effective_entitlements() to authenticated;

revoke all on function public.complete_solo_card(uuid, text) from public, anon;
grant execute on function public.complete_solo_card(uuid, text) to authenticated;

revoke all on function public.tlc_school_workspace() from public, anon;
grant execute on function public.tlc_school_workspace() to authenticated;

revoke all on function public.create_org_group(uuid, text, uuid) from public, anon;
grant execute on function public.create_org_group(uuid, text, uuid) to authenticated;

revoke all on function public.create_org_invite(uuid, uuid, text, integer, integer) from public, anon;
grant execute on function public.create_org_invite(uuid, uuid, text, integer, integer) to authenticated;

revoke all on function public.revoke_org_invite(uuid) from public, anon;
grant execute on function public.revoke_org_invite(uuid) to authenticated;

revoke all on function public.remove_org_member(uuid, uuid) from public, anon;
grant execute on function public.remove_org_member(uuid, uuid) to authenticated;

revoke all on function public.redeem_org_invite(text) from public, anon;
grant execute on function public.redeem_org_invite(text) to authenticated;

-- Public PostgREST-callable service_role wrapper for billing webhook/test activation.
create or replace function public.tlc_billing_apply_event(
  p_provider text,
  p_event_id text,
  p_event_type text,
  p_payload jsonb,
  p_user_id uuid,
  p_plan text,
  p_status text,
  p_external_id text,
  p_amount_kzt integer,
  p_period_end timestamptz,
  p_org_name text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  return tlc_billing.apply_billing_event(
    p_provider, p_event_id, p_event_type, p_payload,
    p_user_id, p_plan, p_status, p_external_id,
    p_amount_kzt, p_period_end, p_org_name
  );
end;
$$;

create or replace function public.leave_org()
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_member record;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select m.org_id, o.owner_id
  into v_member
  from tlc_billing.org_members m
  join tlc_billing.organizations o on o.id = m.org_id
  where m.user_id = v_user_id and m.status = 'active'
  limit 1;

  if not found then
    return false;
  end if;
  if v_member.owner_id = v_user_id then
    raise exception 'cannot_remove_owner' using errcode = '42501';
  end if;

  update tlc_billing.org_members
  set status = 'removed', updated_at = now()
  where org_id = v_member.org_id and user_id = v_user_id;
  return true;
end;
$$;

revoke all on function public.tlc_billing_apply_event(text, text, text, jsonb, uuid, text, text, text, integer, timestamptz, text) from public, anon, authenticated;
grant execute on function public.tlc_billing_apply_event(text, text, text, jsonb, uuid, text, text, text, integer, timestamptz, text) to service_role;

revoke all on function public.leave_org() from public, anon;
grant execute on function public.leave_org() to authenticated;
