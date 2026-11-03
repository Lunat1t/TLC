---
description: "Dependency-ordered implementation tasks for the TLC instruction library"
---

# Tasks: Библиотека инструкций TLC

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/web-and-api.md](contracts/web-and-api.md), [quickstart.md](quickstart.md).

**Organization**: One phase per user story. The catalog uses owned fixtures until the US4 publication UI exists. `[P]` means different files and no dependency on an unfinished task in the same phase. Acceptance checks are included because the plan requires contract/RLS and device validation; this is not a TDD sequence.

## Format: `[ID] [P?] [Story] Description`

All paths below are relative to the TLC repository root. `[US1]`–`[US4]` map to the four stories in [spec.md](spec.md).

## Phase 1: Setup

**Purpose**: Make the existing Next.js/Supabase project reproducible in a non-production environment.

- [X] T001 Document the existing `supabase/schema.sql` application order, migration order and fresh non-production project setup in `supabase/migrations/README.md`.
- [X] T002 [P] Create rights-cleared synthetic SPIKE Prime 10-step and EV3 PDF fixtures plus manifests for 10-card and 20-card checks in `tests/fixtures/instructions/manifest.json`, `tests/fixtures/instructions/spike-step-01.svg`, `tests/fixtures/instructions/ev3-demo.pdf` and `tests/fixtures/instructions/README.md`; record provenance and avoid copying the reference site.
- [X] T003 [P] Document required public/server environment variable names, private bucket name, upload size/type limits and local commands in `docs/instruction-library-setup.md`; include no secrets.

**Checkpoint**: The test project and owned fixtures can be prepared without production content.

---

## Phase 2: Foundation

**Purpose**: Establish shared catalog schema, roles and private storage before exposing feature routes.

- [X] T004 Create trusted `instruction_admins` and an admin-check function in `supabase/migrations/20261030_instruction_admins.sql`; students cannot grant their own role, and editable `profiles` fields cannot confer admin access.
- [X] T005 Create `instructions` (`status` only `draft|published|archived`, `kit` only SPIKE Prime/EV3, stable unique `slug`, title/summary and rights fields), `instruction_steps` (unique `position` per instruction) and `instruction_assets` (private `object_key`, MIME and byte size) with indexes and RLS in `supabase/migrations/20261030_instruction_catalog.sql`; public reads return published card metadata only and never steps/documents.
- [X] T006 Create a private image/PDF bucket with admin-only upload/delete and no public object URLs in `supabase/migrations/20261030_instruction_storage.sql`; cover delivery and launch-scoped delivery must remain server-checked.
- [X] T007 [P] Define `Instruction`, `InstructionStep`, `InstructionAsset`, `StudentSession`, `StudentSelection`, `AssemblyLaunch` and `AssemblyProgress` types with the enum/field rules from `data-model.md` in `src/lib/instructions/types.ts`.
- [X] T008 Implement verified Supabase identity, trusted-admin guard and common error responses in `src/lib/instructions/access.ts`; never trust localStorage, nickname or editable metadata for authorization.
- [X] T009 [P] Audit and remove local password-cache fallback for authenticated feature flows in `src/lib/auth.ts`, preserving normal Supabase student sign-in and existing project access.
- [X] T010 [P] Implement validation for kit, required publication fields, topics, stable slug, rights attestation, upload MIME/size and contract error codes in `src/lib/instructions/validation.ts`.

**Checkpoint**: Schema and guards allow public cards, admin edits and private content while preserving current TLC sign-in.

---

## Phase 3: User Story 1 — Найти инструкцию (Priority: P1) 🎯 Catalog MVP

**Goal**: Guests and students find an owned published card inside TLC; full steps/PDF remain hidden before launch.

**Independent Test**: With owned fixtures loaded, filter and search the published cards on desktop/tablet, open a card from the home screen, and verify draft/archived cards and step/document links are inaccessible to guests and students.

- [X] T011 [P] [US1] Implement published-card pagination, kit filter, case-insensitive title/topic search and empty-result handling in `src/lib/instructions/catalog.ts`; do not select private step/document fields.
- [X] T012 [P] [US1] Implement published lookup by immutable `slug` returning title, summary, kit, topics and cover ID only in `src/lib/instructions/detail.ts`; draft/archived return no public card and no steps/document references.
- [X] T013 [US1] Expose `GET /api/instructions` and `GET /api/instructions/:slug` with the contract response/error shape in `src/app/api/instructions/route.ts` and `src/app/api/instructions/[slug]/route.ts` using T011–T012.
- [X] T014 [US1] Stream only a cover belonging to a currently published card, or an admin-authorized editorial asset, from `src/app/api/instruction-media/[instructionId]/[assetId]/route.ts`; reject direct step/PDF requests, check asset association and avoid stale public caching.
- [X] T015 [P] [US1] Build responsive catalog search/filter state in URL, keyboard focus and loading/empty/error states in `src/app/instructions/page.tsx` and `src/app/instructions/instructions.css`.
- [X] T016 [US1] Build a stable published-card preview with cover fallback, title, summary, kit and topics but no step/document preview in `src/app/instructions/[slug]/page.tsx`; leave the authenticated selection action to US2.
- [X] T017 [US1] Replace the two external instruction links on the home screen with `/instructions?kit=spike|ev3` routes in `src/app/page.tsx`, preserving existing project and robot-editor entry points.
- [ ] T018 [US1] Seed the owned test fixtures reproducibly in `tests/fixtures/instructions/seed.mjs` and document the command in `tests/fixtures/instructions/README.md`; check the US1 journey and SC-001 action count against `specs/001-instruction-library/quickstart.md`.

**Checkpoint**: An internal catalog with public cards works independently of admin launch and authoring UI.

---

## Phase 4: User Story 2 — Запустить среду сборки ученику (Priority: P1)

**Goal**: A student chooses a card; the admin sees one current tablet per student and opens the chosen workspace only there.

**Independent Test**: Sign in as one admin and four students, launch one selection, verify only the current tablet opens and another tablet for the same account replaces the old lease while preserving a pending/opened launch.

- [ ] T019 [US2] Define `student_sessions` (`student_id`, `auth_session_id`, server-controlled `generation`, `last_seen_at`, `started_at`, `ended_at`) with **не более одного активного сеанса планшета на ученика** via a partial unique index, plus own/current/admin RLS and Realtime publication in `supabase/migrations/20261030_instruction_sessions.sql`.
- [ ] T020 [US2] Define `student_selections` (one current row per student, `selection_version`, `selected_at`, `awaiting_launch|launched`), `assembly_launches` (`pending|opened|completed|closed|superseded`, immutable ordered step/document/asset snapshot, unique `(admin_id, idempotency_key)`, `created_for_session_id` for audit) and versioned `assembly_progress` in `supabase/migrations/20261030_instruction_launches.sql`; enforce own-student/admin RLS and retain snapshots across tablet replacement.
- [ ] T021 [US2] Implement transactional current-tablet activation and fencing in `src/lib/instructions/device-session.ts` and `supabase/migrations/20261030_instruction_sessions.sql`: verify the newly signed-in Auth session is the latest trusted session, retire the old lease, increment `generation`, and reject old JWT/heartbeat attempts to reclaim it.
- [ ] T022 [US2] Expose `POST /api/student/session/activate`, `POST /api/student/session/heartbeat` and best-effort close in `src/app/api/student/session/activate/route.ts`, `src/app/api/student/session/heartbeat/route.ts` and `src/app/api/student/session/close/route.ts`; protected requests require current `sessionId` and `generation`, and stale devices return `409 stale_device`.
- [ ] T023 [P] [US2] Enable the teacher sign-in entry on the public `src/app/login/page.tsx` and guard `src/app/admin/layout.tsx` server-side; keep the sign-in page outside the protected `/admin` layout and keep administrator provisioning outside public registration.
- [ ] T024 [US2] Implement atomic student selection in `src/lib/instructions/selection.ts` and `src/app/api/student/selection/route.ts`: require current lease and published card, increment `selection_version`, supersede a pending launch, and when a build is open save progress, mark it `closed` and return `awaiting_launch` for the new choice.
- [ ] T025 [US2] Implement atomic admin launch creation and idempotency in `src/lib/instructions/launch.ts` and `supabase/migrations/20261030_instruction_launches.sql`; check admin role, current session/generation, selected instruction/version and published status, then pin the immutable snapshot; return documented `409` conflicts for missing/stale/offline selection.
- [ ] T026 [US2] Return one active row per student with current `sessionId`, `generation`, nickname, connection freshness, selection/version and `pending|opened|completed|closed|superseded` status in `src/app/api/admin/students/active/route.ts`; deny roster access to students/guests.
- [ ] T027 [US2] Expose `POST /api/admin/launches` in `src/app/api/admin/launches/route.ts` using T025; accept `studentId`, `sessionId`, `expectedGeneration`, `expectedSelectionVersion` and `idempotencyKey`, returning the same launch on retry.
- [ ] T028 [US2] Implement own pending/opened launch fetch and idempotent open/close/complete acknowledgements in `src/app/api/student/launches/current/route.ts`, `src/app/api/student/launches/[id]/open/route.ts` and `src/app/api/student/launches/[id]/close/route.ts`; verify current lease on every call and prevent archived pending launches from opening.
- [ ] T029 [US2] Expose launch-scoped ordered steps/document metadata and checked image/PDF streaming in `src/app/api/student/launches/[id]/materials/route.ts` and `src/app/api/student/launches/[id]/media/[assetId]/route.ts`; require an `opened` launch owned by the student on the current tablet, match asset IDs to the snapshot, support PDF range/fallback and set `Cache-Control: private, no-store`.
- [ ] T030 [US2] Add authenticated “Выбрать для занятия” and “Ожидаем запуска” states in `src/app/instructions/[slug]/page.tsx` using T024; choosing another card updates the student's single current selection, never exposes steps before launch.
- [ ] T031 [US2] Build the admin list and launch action in `src/app/admin/students/page.tsx`: one row per student/current tablet, disable launch without selection, refresh on conflict and display all five launch states.
- [ ] T032 [US2] Subscribe only the current tablet to its own launches and the admin to authorized roster changes in `src/components/instructions/student-launch-listener.tsx` and `src/components/instructions/admin-roster-listener.tsx`; refetch durable state on first load, reconnect and foreground, and clean up subscriptions.
- [ ] T033 [US2] Mount the student listener in `src/app/layout.tsx`; before opening `/assembly/[launchId]`, save unsaved robot-editor work or ask for a safe choice, and acknowledge opening only after navigation succeeds.
- [ ] T034 [US2] Create a minimal protected `/assembly/[launchId]` route in `src/app/assembly/[launchId]/page.tsx` that opens the addressed pending launch, displays its first saved step/document and resumes the same launch on a newly active tablet; US3 expands the guided UI.
- [ ] T035 [US2] Run the four-student, stale-selection, duplicate-click, disconnect, old-token and two-tablet handoff scenarios from `specs/001-instruction-library/quickstart.md`; record failures/timings in `docs/instruction-library-validation.md` before marking US2 complete.

**Checkpoint**: The admin launches one selected student; only that student's current tablet opens and the launch survives reconnection and replacement.

---

## Phase 5: User Story 3 — Собирать по инструкции (Priority: P2)

**Goal**: The addressed student navigates steps or a PDF, saves progress and can resume on another tablet.

**Independent Test**: After admin launch, traverse the SPIKE steps and EV3 PDF, save a step, refresh/change tablet, confirm the same launch and step, then close/complete and verify media access ends.

- [ ] T036 [US3] Implement version-checked progress read/update and snapshot step-ID validation in `src/lib/instructions/progress.ts` and `src/app/api/student/launches/[id]/progress/route.ts`; reject stale `generation` or progress `version` without overwriting a newer step.
- [ ] T037 [US3] Expand `src/app/assembly/[launchId]/page.tsx` and `src/app/assembly/assembly.css` with ordered step navigation, image enlargement, PDF view/open/download fallback, progress, complete and close controls, tablet touch and keyboard support.
- [ ] T038 [US3] Preserve catalog `kit`/`q` state on return and keep unfinished robot-editor work safe during launch navigation in `src/app/instructions/page.tsx`, `src/app/assembly/[launchId]/page.tsx` and `src/components/instructions/student-launch-listener.tsx`.
- [ ] T039 [US3] Verify narrow-tablet keyboard/touch use, file failure fallback, refresh resume, new-tablet progress transfer, old-tablet write denial, `completed|closed` admin feedback and post-close media denial using `specs/001-instruction-library/quickstart.md`; record results in `docs/instruction-library-validation.md`.

**Checkpoint**: An addressed student can complete a build and resume saved progress without exposing the material to other devices.

---

## Phase 6: User Story 4 — Публиковать материалы (Priority: P3)

**Goal**: A trusted editor creates, revises, publishes and archives owned instructions without source edits.

**Independent Test**: Create an owned 10-step draft, publish it, reorder/replace files, archive it, verify public removal and new-launch denial while an already opened build retains its original snapshot.

- [ ] T040 [P] [US4] Implement admin-only draft/list/detail/update endpoints and `draft|published|archived` validation in `src/app/api/admin/instructions/route.ts` and `src/app/api/admin/instructions/[id]/route.ts`; keep `slug` unchanged on rename.
- [ ] T041 [P] [US4] Implement validated private image/PDF upload with safe object keys in `src/app/api/admin/instructions/[id]/assets/route.ts`; preserve draft and clean orphaned uploads after failure, never overwrite an asset referenced by an open snapshot.
- [ ] T042 [US4] Implement atomic publish/archive in `src/app/api/admin/instructions/[id]/publish/route.ts` and `src/lib/instructions/publication.ts`; require title, summary, kit, rights attestation and at least one ordered step or document, preserve `slug`, supersede pending launches on archive and retain assets used by opened launches.
- [ ] T043 [US4] Build admin list/editor, rights confirmation, media upload, step reordering, preview and publish/archive controls in `src/app/admin/instructions/page.tsx` and `src/app/admin/instructions/[id]/page.tsx`; show upload/publish errors without losing a draft.
- [ ] T044 [P] [US4] Document the trusted operator grant/revoke procedure for `instruction_admins`, rights-cleared content intake and media export/migration in `docs/instruction-library-setup.md`; do not expose role assignment in student signup.
- [ ] T045 [US4] Verify draft invisibility, unauthorized edits, incomplete/rights rejection, upload recovery, stable address, archive removal, pending-launch supersession and active-launch material continuity against `specs/001-instruction-library/quickstart.md`; record results in `docs/instruction-library-validation.md`.

**Checkpoint**: The administrator maintains the library through TLC and active learners retain their pinned materials until they close.

---

## Phase 7: Polish and cross-cutting validation

- [ ] T046 [P] Review RLS and server guards as anonymous, student A, student B, retired tablet and admin across `supabase/schema.sql`, `supabase/migrations/20261030_instruction_admins.sql`, `supabase/migrations/20261030_instruction_catalog.sql`, `supabase/migrations/20261030_instruction_storage.sql`, `supabase/migrations/20261030_instruction_sessions.sql` and `supabase/migrations/20261030_instruction_launches.sql`; remove public profile-roster exposure and verify private step/Storage access.
- [ ] T047 Implement repeatable contract/RLS checks for prelaunch step/PDF denial, cross-student isolation, old-token fencing, archive continuation and post-close revocation in `tests/instructions/authorization.test.js` and register them in `tests/run.js`; use isolated test Supabase identities and the states in `specs/001-instruction-library/contracts/web-and-api.md`.
- [ ] T048 Implement repeatable two-device launch/reconnect/selection-change checks with four student identities and an admin in `tests/instructions/launch-flow.test.js` and register them in `tests/run.js`; verify one targeted tablet and durable pending/opened state.
- [ ] T049 [P] Check focus order, labels, image alternatives, contrast and reduced motion in `src/app/instructions/instructions.css`, `src/app/admin/students/page.tsx` and `src/app/assembly/assembly.css`.
- [ ] T050 Run `npm test`, `npx tsc --noEmit`, `npm run build` and the scenarios in `specs/001-instruction-library/quickstart.md`; record pass/fail and remaining limitations in `docs/instruction-library-validation.md`.
- [ ] T051 Record the SC-001–SC-007 measurements from `specs/001-instruction-library/quickstart.md`: 10-card/3-action navigation, five-student 4/5 usability, 20-card/3-second catalog timing, ten launches with at least 9/10 within five seconds and all reconnect attempts; use `docs/instruction-library-validation.md` for devices, network profile, timings and results.
- [ ] T052 Verify test Supabase bucket size/egress limits and document actual limits, asset retention/cleanup and export procedure in `docs/instruction-library-setup.md`; upload real content only after rights review.

## Dependencies and execution order

```text
Setup T001–T003
  → Foundation T004–T010
    → US1 T011–T018 (public catalog MVP)
      → US2 T019–T035 (choice, one active tablet, addressed launch)
        → US3 T036–T039 (full guided assembly and progress)
          → US4 T040–T045 (admin publication and archive)
            → Cross-cutting T046–T052
```

- **US1** needs foundation and owned fixtures; it has no dependency on an admin page. This is the smallest demonstrable MVP.
- **US2** uses US1's published card and adds selection, current-device fencing, roster, launch and a basic assembly view. Its migration includes minimal progress persistence so changing a choice or tablet is safe before US3 expands the UI.
- **US3** requires US2's launch/material routes; its independent check uses seeded fixtures without an editor.
- **US4** can start after foundation and the catalog contract, but its full archive check requires an opened US2 launch. Keep the main delivery order above for a single implementer.
- The final phase checks all stories together. `[P]` applies only after stated prerequisites and only to tasks touching independent files.

## Parallel opportunities

- **Setup**: T002 fixtures and T003 environment guide can proceed while T001 documents migrations.
- **Foundation**: After T004–T006 establish schema/role conventions, T007 types, T009 auth cleanup and T010 validation can proceed in separate files.
- **US1**: T011 catalog query and T012 card lookup can proceed together; T015 catalog UI can follow the API contract while T014 handles covers.
- **US2**: T023 public login/admin layout can proceed while session/launch migrations are built; T030 student selection UI can follow the selection contract while admin routes are implemented.
- **US4**: T040 editorial metadata and T041 asset upload are separate routes; T042 publication depends on both. T044 operator documentation can proceed separately.

## Implementation strategy

1. **MVP**: Complete setup, foundation and US1; demonstrate an owned, searchable catalog with cards and no prelaunch access to steps/PDF.
2. **Classroom control**: Complete US2; demonstrate four students, one admin, one current tablet per student and an addressed launch that survives connection loss and tablet replacement.
3. **Guided learning**: Complete US3; verify full step/PDF flow and progress handoff.
4. **Self-service publication**: Complete US4; add owned materials through the admin UI and validate archive rules.
5. Complete security, accessibility, measured outcomes and build checks before release. This task-generation phase does not implement or deploy the feature.
