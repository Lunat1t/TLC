create table public.account_workspace (
 user_id uuid not null references auth.users(id) on delete cascade,
 section text not null check (section in ('settings','layout','board')),
 value jsonb not null,
 revision integer not null default 1,
 primary key(user_id,section),
 check (octet_length(value::text) <= 3500000),
 check (jsonb_typeof(value) = case when section='board' then 'array' else 'object' end)
);
alter table public.account_workspace enable row level security;
create policy workspace_owner on public.account_workspace for select to authenticated using (user_id=(select auth.uid()));
revoke all on public.account_workspace from anon, authenticated;
grant select on public.account_workspace to authenticated;
create function public.save_workspace_section(p_section text,p_value jsonb,p_revision integer)
returns integer language plpgsql security definer set search_path=public as $$
declare v_revision integer;
begin
 if auth.uid() is null then raise exception 'unauthenticated'; end if;
 if p_revision=0 then
  insert into account_workspace(user_id,section,value) values(auth.uid(),p_section,p_value) on conflict do nothing returning revision into v_revision;
 else
  update account_workspace set value=p_value,revision=revision+1 where user_id=auth.uid() and section=p_section and revision=p_revision returning revision into v_revision;
 end if;
 if v_revision is null then return -1; end if;
 return v_revision;
end; $$;
revoke all on function public.save_workspace_section(text,jsonb,integer) from public,anon;
grant execute on function public.save_workspace_section(text,jsonb,integer) to authenticated;
