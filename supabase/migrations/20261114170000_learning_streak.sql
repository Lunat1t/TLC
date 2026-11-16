alter table tlc_learning.completions
  add column work_xp integer check (work_xp >= 0);

-- A study day is the date of a confirmed completion in the studio's time zone.
create function tlc_learning.study_day(p_at timestamptz)
returns date
language sql immutable strict set search_path = ''
as $$
  select (p_at at time zone 'Asia/Aqtobe')::date;
$$;

create function tlc_learning.streak_days(p_student_id uuid, p_day date)
returns integer
language sql stable set search_path = ''
as $$
  with days as (
    select distinct tlc_learning.study_day(c.confirmed_at) as day
    from tlc_learning.completions c
    where c.student_id = p_student_id
      and c.confirmed_at < ((p_day + 1)::timestamp at time zone 'Asia/Aqtobe')
  ),
  ordered as (
    select day, row_number() over (order by day desc)::integer as rank
    from days
  )
  select count(*)::integer from ordered where day = p_day - (rank - 1);
$$;

create function tlc_learning.my_study_week()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_student_id uuid := auth.uid();
  v_today date := tlc_learning.study_day(statement_timestamp());
  v_monday date := v_today - (extract(isodow from v_today)::integer - 1);
  v_streak integer;
  v_done_today boolean;
  v_days jsonb;
begin
  perform tlc_learning.require_student(v_student_id);

  v_streak := tlc_learning.streak_days(v_student_id, v_today);
  v_done_today := v_streak > 0;
  if not v_done_today then
    v_streak := tlc_learning.streak_days(v_student_id, v_today - 1);
  end if;

  select coalesce(jsonb_object_agg(day, total), '{}'::jsonb) into v_days
  from (
    select tlc_learning.study_day(c.confirmed_at) as day, count(*) as total
    from tlc_learning.completions c
    where c.student_id = v_student_id
      and c.confirmed_at >= (v_monday::timestamp at time zone 'Asia/Aqtobe')
      and c.confirmed_at < ((v_today + 1)::timestamp at time zone 'Asia/Aqtobe')
    group by 1
  ) as completion_days;

  return jsonb_build_object(
    'today', v_today,
    'monday', v_monday,
    'days', v_days,
    'streak', v_streak,
    'multiplier', (10 + v_streak) / 10.0,
    'next_multiplier', (10 + v_streak + (case when v_done_today then 0 else 1 end)) / 10.0,
    'total_xp', (
      select coalesce(sum(coalesce(c.work_xp, c.xp)), 0)
      from tlc_learning.completions c
      where c.student_id = v_student_id
    )
  );
end;
$$;

revoke all on function tlc_learning.study_day(timestamptz),
  tlc_learning.streak_days(uuid, date), tlc_learning.my_study_week()
  from public, anon, authenticated;
grant execute on function tlc_learning.my_study_week() to authenticated;

create function public.tlc_learning_my_study_week()
returns jsonb
language sql stable security invoker set search_path = ''
as $$ select tlc_learning.my_study_week(); $$;
revoke all on function public.tlc_learning_my_study_week() from public, anon;
grant execute on function public.tlc_learning_my_study_week() to authenticated;

create or replace function tlc_learning.confirm(p_student_id uuid, p_instruction_id uuid, p_kind text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_lesson tlc_learning.lessons;
  v_season_id uuid;
  v_at timestamptz;
  v_xp integer;
  v_configured boolean;
  v_day date;
  v_streak integer;
begin
  perform tlc_learning.require_admin();
  perform tlc_learning.lock_student(p_student_id);
  if p_kind is null or p_kind not in ('build', 'program') then
    raise exception 'invalid work kind' using errcode = '22023';
  end if;

  select coalesce(c.work_xp, c.xp) into v_xp from tlc_learning.completions c
  where c.student_id = p_student_id and c.instruction_id = p_instruction_id and c.kind = p_kind;
  if found then
    return jsonb_build_object('xp', v_xp, 'applied', false);
  end if;

  perform 1 from public.instructions i
  where i.id = p_instruction_id and i.status = 'published'
  for share;
  if not found then
    raise exception 'lesson task unavailable' using errcode = '22023';
  end if;

  select l.* into v_lesson from tlc_learning.lessons l
  where l.instruction_id = p_instruction_id
  for share;
  v_configured := found;
  if v_configured and ((p_kind = 'build' and v_lesson.build_difficulty is null)
    or (p_kind = 'program' and not v_lesson.program_enabled)) then
    raise exception 'lesson task unavailable' using errcode = '22023';
  end if;

  v_at := clock_timestamp();
  v_season_id := (tlc_learning.active_season(v_at)).id;
  v_day := tlc_learning.study_day(v_at);
  v_streak := 1 + tlc_learning.streak_days(p_student_id, v_day - 1);
  v_xp := round(tlc_learning.work_xp(p_kind, coalesce(v_lesson.build_difficulty, 1))
    * (10 + v_streak) / 10.0)::integer;

  insert into tlc_learning.completions(
    student_id, instruction_id, kind, season_id, xp, work_xp, confirmed_by, confirmed_at
  ) values (
    p_student_id, p_instruction_id, p_kind, v_season_id,
    case when v_season_id is null then 0 else v_xp end, v_xp, auth.uid(), v_at
  );
  return jsonb_build_object('xp', v_xp, 'applied', true);
end;
$$;
