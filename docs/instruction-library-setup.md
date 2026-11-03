# TLC instruction library setup

## Environment

Use the existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for browser and server clients. Both values are public identifiers; never place a service-role key in client code. Use a separate non-production Supabase project for migration and device checks. No additional provider is needed in the first version.

The private Storage bucket is `instruction-assets`. It accepts images (`image/png`, `image/jpeg`, `image/webp`, `image/svg+xml`) up to 8 MiB and PDFs (`application/pdf`) up to 25 MiB. The application checks the MIME type and size again on upload. Optimize large images before uploading; no paid transform service is assumed.

## Local setup

1. Install dependencies with `npm install`.
2. Apply `supabase/schema.sql` and the feature migrations as described in `supabase/migrations/README.md` to the test Supabase project.
3. Configure `.env.local` for the test project; do not commit it.
4. Run `npm test`, `npx tsc --noEmit`, `npm run build`, then `npm run dev`.
5. Use `specs/001-instruction-library/quickstart.md` for acceptance runs and record outcomes in `docs/instruction-library-validation.md`.

## Content and roles

The LEGO example pages are layout references only. Add images and PDFs made by TLC or licensed for publication, and record provenance before an administrator confirms rights. Grant or revoke `instruction_admins` only through a trusted operator SQL/admin process in the test project; no public signup or editable profile field grants this role. Export metadata and Storage object keys with the underlying files before changing providers. Never delete a file still referenced by an open assembly launch.

Before uploading real instruction sets, inspect the actual project's Storage size and egress limits. Record limits and retention/cleanup procedure here after the test project is available.
