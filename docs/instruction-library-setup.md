# TLC instruction library setup

## Environment

Use the existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for browser and server clients. Both values are public identifiers; never place a service-role key in client code. Use a separate non-production Supabase project for migration and device checks.

## Google Drive PDF links

The teacher page `/admin/instructions/drive` accepts the title, LEGO kit and a Google Drive PDF share URL. Teachers first upload the PDF to their own Drive and set general access to **Anyone with the link — Viewer**. TLC anonymously checks the PDF signature and size (up to 100 MB), requires a publication-rights checkbox and a verified instruction administrator, then saves a cover in Supabase Storage and atomically publishes the catalog metadata plus asset references. For PDFs up to 30 MB, TLC renders page 1 to a JPEG cover automatically; larger PDFs need an optional manual JPG, PNG or WebP cover up to 3 MB. Published legacy records with no saved cover use a cached-on-demand preview route that renders page 1 from their public Drive PDF. PDF bytes remain in Google Drive and download directly from there.

Downloads redirect to `https://drive.google.com/uc?export=download&id=FILE_ID`. PDF bytes are served by Google; downloading and publishing links need no Google service-account private key. Google may show a confirmation or quota page for large or heavily downloaded files. The source file must remain accessible by link.

For an empty database apply the ordered base/catalog migrations in `supabase/migrations/README.md`, followed by `20261105_instruction_drive_link_publish.sql` and `20261105_existing_profile_backfill.sql`. Existing Auth accounts receive profiles through the backfill. Grant teacher rights only to an explicitly identified TLC account through `instruction_admins`; a student signup never grants this role.

Legacy resumable-upload/import API endpoints remain optional. They require server-only `GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_DRIVE_PRIVATE_KEY` and `GOOGLE_DRIVE_FOLDER_ID`. They are not used by the default teacher form. Keep private keys out of source code and chat.

## Local setup

1. Install dependencies with `npm install`.
2. Apply `supabase/schema.sql` and the feature migrations as described in `supabase/migrations/README.md` to the test Supabase project.
3. Configure `.env.local` for the test project; do not commit it.
4. Run `npm test` and `npx tsc --noEmit`. Stop `npm run dev` before running `npm run build` or `npm start`: all three commands share `.next` in this checkout and must run one at a time. `npm run start` serves the completed build on port 8080.
5. Run `npm run dev`. Next.js normally uses port 3000; if it is occupied, read the actual address printed at startup and open that port. Confirm the server responds on that address instead of assuming it stayed on 3000.
6. Use `specs/001-instruction-library/quickstart.md` for acceptance runs and record outcomes in `docs/instruction-library-validation.md`.

## Content and roles

The LEGO example pages are layout references only. Add images and PDFs made by TLC or licensed for publication, and record provenance before an administrator confirms rights. Grant or revoke `instruction_admins` only through a trusted operator SQL/admin process in the test project; no public signup or editable profile field grants this role. Export metadata and Storage object keys with the underlying files before changing providers. Never delete a file still referenced by an open assembly launch.

Before uploading real image assets, inspect the actual project's Storage size and egress limits. PDF source files remain in Drive; inspect Drive capacity separately. Record limits and retention/cleanup procedure here after the test project is available.

## Logs, availability and recovery

- Application errors returned to users should contain the stable error `code` and a short message only. Server diagnostics may record timestamp, request/correlation ID, route, dependency (`supabase` or `google_drive`), HTTP status and stable error code. Never log service-role keys, OAuth/JWT tokens, Drive private URLs, private keys, PDF contents or student passwords.
- A safe catalog availability check is `GET /api/instructions`; expect HTTP 200 and a valid `{ items, nextCursor }` response. An empty list can be a valid result. It does not verify Auth, admin privileges, Storage or Drive.
- Drive availability must be checked through the admin-only list endpoint using the server service account and configured folder. Confirm a successful listing and expected permission behavior; do not expose the service-account email, private key, Drive download URL or file contents in browser responses or logs. The Drive probe is not considered verified until service-account access is configured and checked in `TLC-test`.
- Before using real class data, confirm which Supabase backup/retention features are enabled for the actual plan. Export database schema and metadata through an approved Postgres backup path, keep private image objects with their object keys, and retain source PDFs in Google Drive. A database dump alone does not back up Storage or Drive files/permissions.
- Recovery rehearsal: restore a test backup into a separate non-production Supabase project, apply/compare migrations, restore image objects, verify catalog rows and RLS, then verify the recorded Drive file IDs and public-reader permissions still work. Record the date, source/target test project names, row/object counts and route outcomes in `docs/instruction-library-validation.md`; never copy credentials into the report.

These checks and recovery steps are documented but are not automated. No backup/restore rehearsal has been completed yet.
