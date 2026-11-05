# TLC instruction library validation

## 2026-11-05 — test project inventory and catalog schema

Target: Supabase project `TLC-test` (`bjegtxrgsdderxacadtx`) in organization `TLC`, region `eu-west-1`. Project status was healthy. No secrets are recorded here.

### Before applying the catalog schema

- Supabase migration history was empty.
- `public` had no tables, policies, grants to `anon`/`authenticated`, or routines.
- The Supabase table listing confirmed no application tables. An earlier Data API probe returned `PGRST205` for `instructions`, consistent with the absent schema rather than a wrong project.
- Security and performance advisors returned no findings before DDL.

### Applied, in order

| Migration | Result |
|---|---|
| `tlc_base_schema` (`supabase/schema.sql`) | Applied; profile reads require an authenticated owner. |
| `20261030_instruction_admins` | Applied; trusted admin table/function and self-or-admin profile reads. |
| `20261030_instruction_catalog` | Applied; catalog, steps, assets, RLS and published-card RPC. |
| `20261030_instruction_storage` | Applied after narrowing the bucket to image MIME types only. |
| `20261104_instruction_drive_source` | Applied; Drive file/revision metadata. |
| `20261105_security_cleanup` | Applied; removes duplicate profile policy and revokes direct execution of the profile trigger. |
| `20261105_instruction_admin_acl` | Applied; removes anonymous execution of the admin-check function. |

### After applying

- Public tables: `profiles`, `instruction_admins`, `instructions`, `instruction_steps`, `instruction_assets`; RLS is enabled on all five.
- All five have zero rows. No student identities, admin grants, or instruction content have been created.
- `instruction_admins` deliberately has no direct row policies, so the Data API cannot read or write the roster table directly.
- `profiles` has one authenticated self-or-admin SELECT policy; user INSERT/UPDATE policies are constrained by `auth.uid() = id`.
- The `instruction-assets` bucket is private, limited to 25 MiB, and allows PNG, JPEG, WebP and SVG only. PDF copies are not stored in Supabase Storage.
- The Data API call to `search_instruction_cards` returned HTTP 200 with `[]`, confirming the RPC is visible after migration and the schema cache is current.
- `handle_new_tlc_user()` is not executable by `anon` or `authenticated`; `is_instruction_admin()` is not executable by `anon` and remains available to authenticated RLS checks.
- Supabase security advisors report the intended `SECURITY DEFINER` warnings for the published-card, cover-lookup and search helpers callable by anon/authenticated roles. These return published card/cover data only. The admin-check function also appears in the authenticated warning group because RLS uses it; anonymous execution is denied. `instruction_admins` has no direct RLS policy by design. Review advisors again after adding session/launch functions.
- Local TLC `/api/instructions` returned HTTP 200 with `{"items":[],"nextCursor":null}`. The home HTML and referenced CSS/JS assets returned HTTP 200. No visual tablet interaction was performed.

### Public catalog route smoke check

Inserted 20 temporary synthetic published cards (10 SPIKE Prime, 10 EV3) plus one draft using Supabase SQL, then removed all 21 rows after the check. No test data remains in the project. Through the local TLC app against `TLC-test`:

- `GET /api/instructions`: 200, 20 cards, no private step/document/source fields.
- `GET /api/instructions?kit=spike`: 200, 10 SPIKE cards.
- `GET /api/instructions?q=Модель%20для%20проверки%2007`: 200, one matching card.
- `GET /api/instructions/tlc-smoke-01`: 200, public card only.
- `GET /api/instructions/tlc-smoke-draft`: 404.

The repeatable fixture seed command's 10-card and 20-card dry runs pass. Applying it remains unverified: `.env.local` has no test service-role key or test admin ID. The script records a synthetic Drive source for the PDF and never uploads PDF bytes to Storage.

### Home-to-library navigation check

- Rendered the local home screen at 1280×900 and 390×844. Emulated portrait tablet at 834×1194; the floating navigation stays inside the viewport and above the safe-area inset.
- In mobile Chrome emulation, the «Инструкции» button and Enter key opened `/instructions`; the «Проекты» button and Space key returned to `/`.
- A left swipe opened the library, a right swipe returned to projects, and a vertical swipe left the route unchanged. Buttons have Russian accessible names, are keyboard-focusable, and the reduced-motion CSS removes their transitions.
- Tablet behavior was emulated in Chrome; no physical classroom tablet usability or performance run has been completed.

### Code and local server checks

- `npx tsc --noEmit`: passed.
- `npm run build`: passed; Next.js generated the production bundle and all pages/routes.
- `npm test`: 60/67 Node tests passed. Seven failures remain in existing editor/control-workspace expectations (`tests/workspace.test.js` and `tests/control-workspace.test.js`); the Python test command did not run because the Node command failed first.
- Production server on `http://127.0.0.1:8080`: home HTML 200, both CSS files and all referenced JavaScript chunks 200, bottom navigation labels present, and `GET /api/instructions` 200 with an empty catalog.
- Development/build/production commands share `.next`; setup instructions require stopping one before starting another. No port conflict was present during the local check.

### Scope not yet verified

This migration set does not create student sessions, selections, launches or progress. There are no corresponding migration files in the repository yet. Auth sign-in/refresh, admin provisioning, live catalog routes, Drive service-account access, immutable Drive revision retention, student launch, PDF streaming/range, tablet reconnection and device-level performance remain unverified. Keep the Drive revision gate closed until a real test folder and suitable Drive permissions prove retention across source edits/deletion.

### 2026-11-05 — Drive upload foundation

- Added a server-only endpoint that creates a private resumable Drive session; the browser transfers PDF bytes directly to Drive (not through the Next/Vercel request body), then TLC checks the `%PDF-` signature and 100,000,000-byte limit, pins the binary revision, and writes the draft plus Drive metadata to Supabase. PDFs are not copied to Supabase Storage.
- The `TLC-test` project received `20261105_instruction_drive_revisions`; `instruction_assets.source_revision_verified` now defaults to false. The test project remains empty and has no admin users.
- The existing Drive folder and its `Черновики`, `SPIKE Prime`, and `LEGO EV3` subfolders were found through the connected Drive integration. The parent folder ID was placed in ignored `.env.local`; no file was uploaded.
- `GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_DRIVE_PRIVATE_KEY` are not configured. The upload API also requires a verified TLC teacher/admin session. Therefore the UI opens publicly, but an actual upload has not been run; Drive permission, resumable transfer, revision retention after edits/deletion, and cleanup on failure remain unverified.
- Current-code checks after the direct-to-Drive resumable refactor: `npx tsc --noEmit`, `npm run build`, and `git diff --check` passed. The latest `npm test` run had 59/67 passing; eight failures are in pre-existing workspace/controller tests. Because the Node test command failed, the chained Python controller tests did not run. The upload itself remains unverified until service-account credentials and a teacher/admin role are configured.
