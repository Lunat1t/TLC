# TLC instruction library migrations

Use a separate, non-production Supabase project for first application and checks. Apply `supabase/schema.sql` first if the project does not already have the TLC `profiles` table and Auth trigger. On an existing project, inspect its `profiles` policies and table definitions before applying any feature migration.

Apply the numbered 20261030 instruction migrations in filename order through the Supabase SQL editor or migration runner. Apply each file once, record the version, and verify `instruction_admins`, catalog tables, private Storage bucket, student sessions, selections, launches, and progress. The first migration replaces public profile reading with self/admin access; do this before exposing the admin roster. Use a dedicated test project with one admin and five student test users. Do not apply this migration sequence directly to production before successful test-project checks.

Never place a service-role key in browser code. The web app uses the existing publishable key and verified user session. Trusted `security definer` functions must check `auth.uid()` and the active Auth session before reading or writing protected rows. See `specs/001-instruction-library/quickstart.md` for the validation sequence.
