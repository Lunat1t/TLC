-- Supabase can add explicit default EXECUTE grants to anon. The admin predicate
-- belongs to authenticated RLS checks and must not be exposed to anonymous RPC.
revoke all on function public.is_instruction_admin() from public, anon;
grant execute on function public.is_instruction_admin() to authenticated;
