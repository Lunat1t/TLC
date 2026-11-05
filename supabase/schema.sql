-- Схема базы данных TLC для Supabase (выполните в Supabase Dashboard -> SQL Editor)

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  login text unique not null,
  nickname text not null,
  avatar jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Пользователь читает свой профиль"
  on public.profiles for select to authenticated
  using (auth.uid() = id);

create policy "Пользователь может обновлять свой профиль"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Пользователь может создавать свой профиль"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Автоматическое создание профиля в public.profiles и автоподтверждение email при регистрации ученика
create or replace function public.handle_new_tlc_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, login, nickname, avatar)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'login', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'nickname', new.raw_user_meta_data->>'login', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->'avatar', '{}'::jsonb)
  )
  on conflict (id) do update
  set
    nickname = excluded.nickname,
    avatar = excluded.avatar,
    updated_at = now();

  return new;
end;
$$;

revoke all on function public.handle_new_tlc_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_tlc_user();
