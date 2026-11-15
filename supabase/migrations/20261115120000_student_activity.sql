-- Rewards are awarded once per UTC calendar day, under a row lock.
create table public.student_activity (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance numeric(14,1) not null default 0 check (balance >= 0),
  streak integer not null default 0 check (streak >= 0),
  last_active_on date
);
alter table public.student_activity enable row level security;
create policy activity_owner on public.student_activity for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.student_activity from anon, authenticated;
grant select on public.student_activity to authenticated;

create function public.claim_daily_activity()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_today date := (now() at time zone 'UTC')::date;
  v_activity public.student_activity%rowtype;
  v_reward numeric := 0;
begin
  if v_user is null then raise exception 'unauthenticated'; end if;
  if not exists (select 1 from public.profiles where id = v_user and role = 'student' and onboarding_complete) then
    raise exception 'student_required';
  end if;
  insert into public.student_activity(user_id) values (v_user) on conflict do nothing;
  select * into v_activity from public.student_activity where user_id = v_user for update;
  if v_activity.last_active_on is null or v_activity.last_active_on < v_today then
    v_activity.streak := case when v_activity.last_active_on = v_today - 1 then v_activity.streak + 1 else 1 end;
    v_reward := 1 + v_activity.streak::numeric / 10;
    update public.student_activity
      set streak = v_activity.streak, balance = balance + v_reward, last_active_on = v_today
      where user_id = v_user returning * into v_activity;
  end if;
  return jsonb_build_object('balance', v_activity.balance, 'streak', v_activity.streak,
    'multiplier', 1 + v_activity.streak::numeric / 10, 'lastActiveOn', v_activity.last_active_on, 'reward', v_reward);
end;
$$;
revoke all on function public.claim_daily_activity() from public, anon;
grant execute on function public.claim_daily_activity() to authenticated;
