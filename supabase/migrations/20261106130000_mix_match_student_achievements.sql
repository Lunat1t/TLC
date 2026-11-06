create table if not exists public.student_achievement_awards (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  achievement_key text not null check (achievement_key = 'mix_and_match_2025_2026'),
  awarded_by uuid not null references auth.users(id),
  awarded_at timestamptz not null default now(),
  unique(student_id, achievement_key)
);

alter table public.student_achievement_awards enable row level security;
drop policy if exists "Ученики читают свои достижения" on public.student_achievement_awards;
create policy "Ученики читают свои достижения"
  on public.student_achievement_awards for select to authenticated
  using (auth.uid() = student_id);

create table if not exists public.student_equipped_accessories (
  student_id uuid not null references public.profiles(id) on delete cascade,
  accessory_key text not null check (accessory_key = 'mix_and_match_shaker'),
  equipped_at timestamptz not null default now(),
  primary key(student_id, accessory_key)
);

alter table public.student_equipped_accessories enable row level security;
drop policy if exists "Ученики читают надетые аксессуары" on public.student_equipped_accessories;
create policy "Ученики читают надетые аксессуары"
  on public.student_equipped_accessories for select to authenticated
  using (auth.uid() = student_id);

create or replace function public.search_students_for_mix_match_award(p_query text)
returns table(student_id uuid, nickname text, login text, achievement_awarded boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_query text := trim(coalesce(p_query, ''));
begin
  if auth.uid() is null or not (
    public.is_instruction_admin()
    or exists (
      select 1 from public.profiles t
      where t.id = auth.uid() and t.role = 'teacher' and t.onboarding_complete
    )
  ) then
    raise exception 'teacher required' using errcode = '42501';
  end if;
  if length(v_query) < 2 then
    return;
  end if;

  return query
    select p.id, p.nickname, p.login,
      exists (
        select 1 from public.student_achievement_awards a
        where a.student_id = p.id and a.achievement_key = 'mix_and_match_2025_2026'
      )
    from public.profiles p
    where p.role = 'student' and p.onboarding_complete
      and (p.login ilike v_query || '%' or p.nickname ilike '%' || v_query || '%')
    order by (p.login ilike v_query || '%') desc, p.nickname
    limit 20;
end;
$$;

create or replace function public.award_mix_match_achievement(
  p_student_id uuid,
  p_confirmed_participant boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer;
begin
  if auth.uid() is null or not (
    public.is_instruction_admin()
    or exists (
      select 1 from public.profiles t
      where t.id = auth.uid() and t.role = 'teacher' and t.onboarding_complete
    )
  ) then
    raise exception 'teacher required' using errcode = '42501';
  end if;
  if p_confirmed_participant is distinct from true then
    raise exception 'participant confirmation required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles s
    where s.id = p_student_id and s.role = 'student' and s.onboarding_complete
  ) then
    raise exception 'student not found' using errcode = '22023';
  end if;

  insert into public.student_achievement_awards(student_id, achievement_key, awarded_by)
  values (p_student_id, 'mix_and_match_2025_2026', auth.uid())
  on conflict (student_id, achievement_key) do nothing;
  get diagnostics v_inserted = row_count;

  return jsonb_build_object(
    'awarded', v_inserted = 1,
    'achievement_key', 'mix_and_match_2025_2026'
  );
end;
$$;

create or replace function public.get_my_mix_match_wardrobe()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_awarded_at timestamptz;
  v_equipped boolean := false;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles s
    where s.id = auth.uid() and s.role = 'student' and s.onboarding_complete
  ) then
    raise exception 'student required' using errcode = '42501';
  end if;

  select a.awarded_at into v_awarded_at
  from public.student_achievement_awards a
  where a.student_id = auth.uid() and a.achievement_key = 'mix_and_match_2025_2026';

  select exists (
    select 1 from public.student_equipped_accessories e
    where e.student_id = auth.uid() and e.accessory_key = 'mix_and_match_shaker'
  ) into v_equipped;

  return jsonb_build_object(
    'achievement_awarded', v_awarded_at is not null,
    'awarded_at', v_awarded_at,
    'accessory_unlocked', v_awarded_at is not null,
    'accessory_equipped', v_equipped
  );
end;
$$;

create or replace function public.set_my_mix_match_accessory(p_equipped boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles s
    where s.id = auth.uid() and s.role = 'student' and s.onboarding_complete
  ) then
    raise exception 'student required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.student_achievement_awards a
    where a.student_id = auth.uid() and a.achievement_key = 'mix_and_match_2025_2026'
  ) then
    raise exception 'achievement required' using errcode = '42501';
  end if;

  if p_equipped then
    insert into public.student_equipped_accessories(student_id, accessory_key)
    values (auth.uid(), 'mix_and_match_shaker')
    on conflict (student_id, accessory_key) do nothing;
  else
    delete from public.student_equipped_accessories
    where student_id = auth.uid() and accessory_key = 'mix_and_match_shaker';
  end if;
  return p_equipped;
end;
$$;

revoke all on function public.search_students_for_mix_match_award(text) from public, anon;
revoke all on function public.award_mix_match_achievement(uuid, boolean) from public, anon;
revoke all on function public.get_my_mix_match_wardrobe() from public, anon;
revoke all on function public.set_my_mix_match_accessory(boolean) from public, anon;
grant execute on function public.search_students_for_mix_match_award(text) to authenticated;
grant execute on function public.award_mix_match_achievement(uuid, boolean) to authenticated;
grant execute on function public.get_my_mix_match_wardrobe() to authenticated;
grant execute on function public.set_my_mix_match_accessory(boolean) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'student_achievement_awards'
    ) then
    alter publication supabase_realtime add table public.student_achievement_awards;
  end if;
end;
$$;
