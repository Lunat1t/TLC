-- Run in a test Supabase database after migrations, with a completed student account.
-- All changes to that account are rolled back.
begin;
do $$
declare
  student uuid;
  result jsonb;
  today date := (now() at time zone 'UTC')::date;
begin
  select id into student from public.profiles where role = 'student' and onboarding_complete limit 1;
  if student is null then raise exception 'Create a test student first'; end if;
  perform set_config('request.jwt.claim.sub', student::text, true);
  delete from public.student_activity where user_id = student;

  result := public.claim_daily_activity();
  assert (result->>'streak')::integer = 1, 'First day starts a streak';
  assert (result->>'balance')::numeric = 1.1, 'First reward uses x1.1';
  result := public.claim_daily_activity();
  assert (result->>'balance')::numeric = 1.1, 'Repeated requests cannot award twice';
  assert (result->>'reward')::numeric = 0, 'Repeated claim has no reward';

  update public.student_activity set last_active_on = today - 1 where user_id = student;
  result := public.claim_daily_activity();
  assert (result->>'streak')::integer = 2, 'Consecutive day extends streak';
  assert (result->>'multiplier')::numeric = 1.2, 'Second day uses x1.2';
  assert (result->>'balance')::numeric = 2.3, 'Fractional rewards remain exact';

  update public.student_activity set last_active_on = today - 3 where user_id = student;
  result := public.claim_daily_activity();
  assert (result->>'streak')::integer = 1, 'Missed day resets streak';
  assert (result->>'balance')::numeric = 3.4, 'Reset preserves earned balance';

  update public.student_activity set last_active_on = today - 1, streak = 9 where user_id = student;
  result := public.claim_daily_activity();
  assert (result->>'multiplier')::numeric = 2, 'Multiplier continues beyond x1.9';
end;
$$;
rollback;
