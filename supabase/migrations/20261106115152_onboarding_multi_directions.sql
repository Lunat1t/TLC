-- The same learning directions are selected by students and teachers.
-- Retain VEX for profiles registered through the previous teacher form.
alter table public.profiles drop constraint disciplines_valid;
alter table public.profiles add constraint disciplines_valid check (
 disciplines <@ array['LEGO WeDo','LEGO SPIKE','LEGO EV3','VEX','Arduino','Программирование']::text[]
);
create or replace function public.handle_new_tlc_user()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_login text := new.raw_user_meta_data->>'login';
  v_age integer;
  v_role text := new.raw_user_meta_data->>'role';
  v_complete boolean := false;
begin
  if new.raw_user_meta_data->>'onboarding_complete' = 'true' then
    v_age := case when v_role='parent' then null else (new.raw_user_meta_data->>'age')::integer end;
    if v_login is null or v_login !~ '^[A-Za-z][A-Za-z0-9_-]{0,31}$' or (v_role <> 'parent' and (v_age is null or v_age not between 1 and 120)) or v_role is null or v_role not in ('student','teacher','parent') then
      raise exception 'Invalid onboarding profile';
    end if;
    v_complete := true;
    -- Login-based accounts have no mailbox: confirm only this app's synthetic addresses.
    if new.email !~ '^tlc[.]student[.][a-z0-9_-]+@gmail[.]com$' then raise exception 'Invalid login account'; end if;
    update auth.users set email_confirmed_at=coalesce(email_confirmed_at,now()) where id=new.id;
  else
    v_login := 'google_' || replace(new.id::text,'-','');
    v_role := null;
  end if;
  insert into public.profiles(id,login,nickname,avatar,age,role,onboarding_complete,disciplines)
  values(new.id,v_login,coalesce(new.raw_user_meta_data->>'nickname',new.raw_user_meta_data->>'full_name',v_login),'{}',v_age,v_role,v_complete,case when v_role in ('teacher','student') then array(select jsonb_array_elements_text(coalesce(new.raw_user_meta_data->'disciplines','[]'))) else '{}' end);
  return new;
end $$;
revoke all on function public.handle_new_tlc_user() from public,anon,authenticated;

create or replace function public.complete_tlc_onboarding(p_login text,p_age integer,p_role text,p_disciplines text[] default '{}')
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_login is null or p_login !~ '^[A-Za-z][A-Za-z0-9_-]{0,31}$' or (p_role <> 'parent' and (p_age is null or p_age not between 1 and 120)) or p_role is null or p_role not in ('student','teacher','parent') then raise exception 'Invalid onboarding profile'; end if;
  update public.profiles set login=p_login,nickname=coalesce(nullif((select concat_ws(' ',raw_user_meta_data->>'first_name',raw_user_meta_data->>'last_name') from auth.users where id=auth.uid()),''),p_login),age=case when p_role='parent' then null else p_age end,role=p_role,disciplines=case when p_role in ('teacher','student') then p_disciplines else '{}' end,onboarding_complete=true,updated_at=now() where id=auth.uid();
end $$;
revoke all on function public.complete_tlc_onboarding(text,integer,text,text[]) from public,anon;
grant execute on function public.complete_tlc_onboarding(text,integer,text,text[]) to authenticated;


