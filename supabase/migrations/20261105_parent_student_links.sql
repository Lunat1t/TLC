alter table public.profiles add column student_link_token uuid not null default gen_random_uuid() unique;
create table public.parent_student_links (
 parent_id uuid not null references public.profiles(id) on delete cascade,
 student_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(parent_id,student_id),check(parent_id<>student_id)
);
alter table public.parent_student_links enable row level security;
create policy "Related accounts read links" on public.parent_student_links for select to authenticated using(auth.uid()=parent_id or auth.uid()=student_id);
create function public.link_student_by_qr(p_token uuid) returns text language plpgsql security definer set search_path=public as $$
declare v_student uuid; v_name text;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and role='parent' and onboarding_complete) then raise exception 'Войдите в аккаунт родителя.'; end if;
 select id,nickname into v_student,v_name from public.profiles where student_link_token=p_token and role='student' and onboarding_complete;
 if v_student is null then raise exception 'QR ученика не найден.'; end if;
 insert into public.parent_student_links(parent_id,student_id) values(auth.uid(),v_student) on conflict do nothing;
 return v_name;
end $$;
revoke all on function public.link_student_by_qr(uuid) from public,anon;
grant execute on function public.link_student_by_qr(uuid) to authenticated;
create function public.my_family_links() returns table(account_id uuid,name text,role text) language sql stable security definer set search_path=public as $$
 select p.id,p.nickname,p.role from public.parent_student_links l join public.profiles p on p.id=case when l.parent_id=auth.uid() then l.student_id else l.parent_id end where auth.uid() in (l.parent_id,l.student_id);
$$;
revoke all on function public.my_family_links() from public,anon;
grant execute on function public.my_family_links() to authenticated;
