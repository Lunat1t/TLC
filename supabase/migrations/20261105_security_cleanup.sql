-- Keep the profile trigger callable only through its trigger, not the Data API.
revoke all on function public.handle_new_tlc_user() from public, anon, authenticated;

-- The initial self-only policy is replaced by the self-or-admin policy.
drop policy if exists "Пользователь читает свой профиль" on public.profiles;
