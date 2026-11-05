-- Resolve a login to an email only after checking the PIN. Never expose a Google email by login alone.
create table public.tlc_pin_attempts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 window_started timestamptz not null default now(), attempts integer not null default 0
);
alter table public.tlc_pin_attempts enable row level security;
revoke all on public.tlc_pin_attempts from public,anon,authenticated;
create function public.resolve_tlc_pin_login(p_login text,p_pin text) returns text
language plpgsql security definer set search_path=public,extensions as $$
declare v_id uuid; v_email text; v_hash text; v_attempts integer;
begin
 if p_login is null or p_pin is null or p_login !~ '^[A-Za-z][A-Za-z0-9_-]{0,31}$' or p_pin !~ '^[0-9]{4}$' then return null; end if;
 select u.id,u.email,u.encrypted_password into v_id,v_email,v_hash from auth.users u join public.profiles p on p.id=u.id where lower(p.login)=lower(p_login) and p.onboarding_complete;
 if v_id is null then return null; end if;
 insert into public.tlc_pin_attempts(user_id,attempts) values(v_id,1)
 on conflict(user_id) do update set
 attempts=case when tlc_pin_attempts.window_started < now()-interval '15 minutes' then 1 else tlc_pin_attempts.attempts+1 end,
 window_started=case when tlc_pin_attempts.window_started < now()-interval '15 minutes' then now() else tlc_pin_attempts.window_started end
 returning attempts into v_attempts;
 if v_attempts>5 then return null; end if;
 if v_hash is null or v_hash='' or extensions.crypt('tlc-pin-v1-'||p_pin,v_hash)<>v_hash then return null; end if;
 update public.tlc_pin_attempts set attempts=0 where user_id=v_id;
 return v_email;
end $$;
revoke all on function public.resolve_tlc_pin_login(text,text) from public;
grant execute on function public.resolve_tlc_pin_login(text,text) to anon,authenticated;
