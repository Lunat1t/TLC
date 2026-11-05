-- TLC instruction administrators and private student profile visibility.
create table if not exists public.instruction_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id)
);
alter table public.instruction_admins enable row level security;

create or replace function public.is_instruction_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists(select 1 from public.instruction_admins where user_id = auth.uid());
$$;
revoke all on function public.is_instruction_admin() from public;
revoke all on function public.is_instruction_admin() from anon;
grant execute on function public.is_instruction_admin() to authenticated;

-- Do this before exposing /admin/students. The base schema allowed anyone to list logins/nicknames.
drop policy if exists "Публичное чтение профилей" on public.profiles;
drop policy if exists "Пользователь читает свой профиль" on public.profiles;
drop policy if exists "Пользователь читает свой профиль или администратор" on public.profiles;
create policy "Пользователь читает свой профиль или администратор"
  on public.profiles for select to authenticated
  using (auth.uid() = id or public.is_instruction_admin());

-- No client-facing INSERT/UPDATE/DELETE policy is created for instruction_admins.
