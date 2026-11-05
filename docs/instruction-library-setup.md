# TLC instruction library setup

## Environment

Use the existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for browser and server clients. Both values are public identifiers; never place a service-role key in client code. Use a separate non-production Supabase project for migration and device checks.

## Google Drive PDF import

The teacher page at `/admin/instructions/drive` accepts a PDF up to 100,000,000 bytes. The server creates a private resumable Drive upload session, then the browser sends the file directly to Google Drive so the PDF does not pass through a Vercel Function request body. TLC stores the Drive file ID, pinned revision ID and catalog metadata in Supabase; it does not copy PDF bytes to Supabase Storage. A successful upload creates a draft. Student delivery stays disabled until the session/launch authorization flow and revision-retention checks are complete.

Configure these server-only variables in the local environment (never prefix them with `NEXT_PUBLIC_`):

- `GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL` — service account email.
- `GOOGLE_DRIVE_PRIVATE_KEY` — private key from the service account JSON; preserve line breaks or encode them as `\\n`. This key stays server-side.
- `GOOGLE_DRIVE_FOLDER_ID` — ID of the TLC instruction folder.

Enable the Google Drive API in the Google Cloud project for that service account, then share only the instruction folder with its email as an Editor. The app uses server-side read access for listing/downloading and write access for resumable uploads and pinning a revision. Apply `supabase/migrations/20261104_instruction_drive_source.sql` and `20261105_instruction_drive_revisions.sql` after the instruction catalog/storage migrations. Never commit the service account key. The connection is not active until these steps are completed and tested in the non-production project.

To install a downloaded service-account JSON without copying its key into chat or source files, run `python3 scripts/import_google_drive_service_account.py /path/to/downloaded-key.json` from the repository root. The script validates the TLC uploader identity, writes the email and key into ignored `.env.local`, and sets file permissions to `600`; restart the local app afterward and delete the downloaded JSON key once setup is confirmed.

The recursive Drive list is bounded to 4 subfolder levels and 500 PDFs; responses report when those bounds truncate the list. Oversized PDFs remain visible in the list with a clear refusal. Do not silently raise these bounds without measuring folder listing time and API quota use.

The private Storage bucket is `instruction-assets` for images (covers and step illustrations). PDFs stay in Google Drive and are streamed through TLC after access checks, so PDF import does not consume Supabase Storage capacity. Optimize large images before uploading; no paid transform service is assumed.

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
- Before using real class data, confirm which Supabase backup/retention features are enabled for the actual plan. Export database schema and metadata through an approved Postgres backup path, keep private image objects with their object keys, and retain source PDFs in Google Drive under the agreed revision policy. A database dump alone does not back up Storage or prove a Drive revision remains available.
- Recovery rehearsal: restore a test backup into a separate non-production Supabase project, apply/compare migrations, restore image objects, verify catalog rows and RLS, then verify the recorded Drive source revisions remain readable. Record the date, source/target test project names, row/object counts and route outcomes in `docs/instruction-library-validation.md`; never copy credentials into the report.

These checks and recovery steps are documented but are not automated. No backup/restore rehearsal has been completed yet.
