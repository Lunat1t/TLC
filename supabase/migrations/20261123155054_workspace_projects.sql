begin;

-- Preserve existing settings/layout/board rows and their revisions. Programs use
-- the same authenticated owner-only RPC and optimistic revision guard.
alter table public.account_workspace
  drop constraint account_workspace_section_check,
  drop constraint account_workspace_check,
  add constraint account_workspace_section_check
    check (section in ('settings', 'layout', 'board', 'projects')),
  add constraint account_workspace_check
    check (jsonb_typeof(value) = case
      when section in ('board', 'projects') then 'array'
      else 'object'
    end);

-- account_workspace_value_check (3.5 MB), RLS, grants and save_workspace_section
-- remain unchanged. Apply this migration before deploying the new client/API.

commit;
