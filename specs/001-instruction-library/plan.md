# Implementation Plan: Библиотека инструкций TLC

**Branch**: `001-instruction-library` | **Date**: 2026-10-30 | **Spec**: [spec.md](spec.md)

**Input**: [spec.md](spec.md), including the five owner decisions recorded in its Clarifications section on 2026-10-30.

## Summary

Build an owned instruction catalog and a guided assembly workspace inside TLC. Guests and students see published cards; only an addressed student with an active launch receives its steps and files. An administrator sees one active tablet per student and starts the selected instruction there. A new login retires the old tablet while the existing assembly and saved progress move to the new one. Store catalog, active-device lease, launches and progress in Supabase Postgres, media in private Supabase Storage, and use durable launches plus Realtime notifications. No content is copied from the reference site.

## Technical Context

**Language/Version**: TypeScript 5.7, React 19, Next.js 15; SQL/Postgres in Supabase.  
**Primary Dependencies**: Existing `@supabase/ssr`, `@supabase/supabase-js`, Next.js App Router. No additional service required for v1.  
**Storage**: Supabase Postgres for public card metadata, private steps, one active-device lease per student, selection, immutable launch snapshot and progress; private Supabase Storage for images/PDF.  
**Testing**: Existing `npm test`, `npx tsc --noEmit`, `npm run build`; add contract/RLS checks for prelaunch media denial, active-device fencing, archive continuation and two-device handoff, plus measurable four-tablet validation.  
**Target Platform**: Vercel-hosted TLC web app on desktop admin device and student tablets.  
**Project Type**: Web application with server routes and Supabase data layer.  
**Performance Goals**: Catalog visible within 3 seconds with 20 items; 9/10 online launches visible on target tablet within 5 seconds; four simultaneous students in MVP verification.  
**Constraints**: Existing student projects remain local to browser. Admin/roster/launch state must use verified Supabase identity, never localStorage as authority. A stale Auth token cannot reactivate the old tablet or read protected material. Steps/documents stay closed before launch; an already open snapshot survives archive. No automatic robot execution.  
**Scale/Scope**: First version covers SPIKE Prime and EV3, one administrator and a small class; no classes/groups, external catalog import, 3D model editor or program execution.

## Constitution Check

The generated `.specify/memory/constitution.md` is an unratified template with placeholders, so it defines no enforceable project-specific gates. No violation can be evaluated against it. Until a constitution is ratified, the plan applies the repository's existing build/test checks and these explicit feature gates:

- Only an authenticated administrator can see the roster or write/publish instructions and create launches; students see only their own selection/launch.
- The catalog and preview return only published card metadata. Steps/documents require an admin or an addressed active launch on the student's current tablet; private object keys never become permanent public URLs.
- A launch is tied to the selected instruction and version at the moment of the admin action; a stale selection cannot open a different instruction.
- There is one active tablet lease per student. A verified new login fences the previous tablet; launches and progress follow the student. Archiving blocks new launches but preserves an already open snapshot.
- The existing editor, projects and robot control paths remain intact; this feature opens an assembly workspace only.
- Initial content must be owned or licensed for publication. The external EV3 page is UX reference only.

**Pre-research gate**: PASS. [research.md](research.md) resolves storage, active-device fencing, protected media and durable delivery. The existing constitution is only an unratified template and provides no further enforceable gate.

## Project Structure

### Documentation (this feature)

```text
specs/001-instruction-library/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── web-and-api.md
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
src/app/
├── page.tsx                         # Replace external catalog links with internal entry
├── instructions/
│   ├── page.tsx                    # Filtered catalog
│   └── [slug]/page.tsx             # Published preview and student selection
├── assembly/[launchId]/page.tsx    # Student-only guided workspace
├── admin/
│   ├── instructions/page.tsx       # Editorial list/form
│   └── students/page.tsx           # Active roster and launch action
├── login/page.tsx                  # Student and administrator sign-in; public entry
└── api/
    ├── instructions/              # Public catalog and preview read
    ├── instruction-media/         # Checked media access
    ├── student/                   # Session, selection, launch acknowledgement
    └── admin/                     # Editorial writes, roster, launch creation
src/lib/instructions/                # Types, validation, queries and access checks
src/components/instructions/         # Roster and current-tablet launch listeners
src/utils/supabase/                 # Existing SSR/browser client integration
supabase/
├── schema.sql                      # Existing base schema, review profile policy
└── migrations/                     # New catalog, role, storage, device, launch RLS migrations
tests/                              # Contract, access and state-transition coverage
```

**Structure Decision**: Extend the existing Next.js App Router and Supabase integration. Keep migrations for new schema changes and document any required update to the existing base schema so fresh environments reproduce the same policies. Do not add a second app or media provider.

## Phase 0: Research outcome

[research.md](research.md) resolves storage, active-tablet replacement, cross-device delivery, protected steps/media and admin auth. Key decisions: private object storage; only published card metadata is public; one server-checked tablet lease per student; a launch snapshot and progress owned by the student; durable launch rows plus Realtime notification; trusted administrator role outside editable profiles. Storage costs/limits and licensed instruction files remain operational checks before publication.

## Phase 1: Design

### Catalog and assembly flow

1. Home links route to TLC's own `/instructions` filtered by kit. Public catalog and preview show published card metadata, search, kit filter and loading/empty/error states. They never return ordered steps or document contents.
2. After verified sign-in, the student claims the single active tablet lease. The server accepts only the latest verified Auth session for takeover and increments a fencing generation; an old tablet may still hold an Auth token but protected calls fail. A student chooses a published instruction; the choice and version belong to the student and current lease. The tablet shows “Ожидаем запуска”.
3. The admin roster shows one entry per online student, with the current tablet, nickname, selection and connection freshness. Launch compares the displayed student, current lease and selection version atomically, then saves a pending launch with an immutable material snapshot. A stale choice/lease returns a conflict and refreshes the roster.
4. Realtime prompts only the active tablet to fetch its own pending or opened launch; first load, reconnect and foreground always refetch durable state. Safe navigation protects unsaved editor work. The assembly route fetches private steps/documents through launch-scoped checks and saves progress. Admin sees pending, opened, completed, closed or superseded states.
5. When the student signs in on a new tablet, the prior lease is retired and its protected reads/writes stop. The new tablet retrieves the same pending/opened launch and last saved step. Choosing another instruction during assembly atomically saves progress, closes that launch and sets a new awaiting-launch choice. Archiving removes the card and blocks fresh launches while the already opened snapshot remains usable until closure.

### Data, access and media

- Use the entities and transitions in [data-model.md](data-model.md). Make tablet takeover, launch creation/selection comparison and choice-change/close atomic. Use an idempotency key per admin click. Progress writes must check the current lease generation and reject stale versions.
- Provision admin identity through a trusted operator path; implement server-side admin guard and RLS. The existing disabled teacher control in `src/app/login/page.tsx` becomes a working public sign-in entry; authenticated admin pages live beneath the guarded `/admin` layout, so the login page stays outside it. Do not grant admin status from `profiles`, user-editable metadata or localStorage. Audit the existing local password cache before relying on student auth.
- Restrict public access to `profiles`; expose only the minimum student nickname/online/selection data through admin-authorized code. Test database policies with admin, student and anonymous identities, including direct record and media URLs.
- Keep all assets in a private bucket and step/document rows unavailable to anonymous or ordinary direct queries. Stream protected files through a launch-scoped route that checks the current student/tablet, active launch and asset membership on every request; serve published cover images separately. Use private no-store caching and PDF range handling; do not rely on long-lived signed links. Archive revokes catalog/new-launch access promptly, while files in an active snapshot remain retained until the launch ends. Validate upload MIME/type, size and association.
- Use Postgres Changes for small-scale updates to the authorized roster and targeted launches; the stored row is authoritative. If class size grows, switch notifications to private Broadcast without changing launch persistence. Client subscription cleanup and reconnect refetch are required.

### Contract and validation

[contracts/web-and-api.md](contracts/web-and-api.md) defines pages, endpoints, authorization, handoff and error states. [quickstart.md](quickstart.md) defines runnable acceptance checks, including prelaunch access denial, four simultaneous students, an old/new tablet handoff, archiving during assembly and the measurable SC-001–SC-007 results.

## Post-design Constitution Check

PASS under the same explicit gates: [data-model.md](data-model.md) and [contracts/web-and-api.md](contracts/web-and-api.md) define private prelaunch material, one active tablet, student-owned transferable progress, archive-safe snapshots, role isolation and stale-choice rejection. The generated constitution still needs a separate owner decision before it can impose additional rules; no placeholder was treated as policy.

## Risks and implementation boundaries

- Current checkout has a disabled teacher login and no admin route, despite the intended admin/student versions being in one repository. Implementation must locate any unpublished admin code before adding a duplicate; if none exists, build the planned admin entry here.
- Current `profiles` policy allows public reading, and `src/lib/auth.ts` contains a local credential cache. Both need review before exposing a roster or treating student identity as verified. Admin privilege must never derive from those client-controlled values.
- Supabase Auth sign-out/single-session alone cannot immediately fence an old JWT. The active-device lease must be checked server-side for every protected operation; an old Auth session cannot reclaim it through heartbeat. Already downloaded files cannot be erased from a browser's memory.
- File quotas and transfer costs depend on the Supabase plan. Verify limits before uploading real instruction sets; pre-optimized images avoid relying on paid image transforms.
- The reference site's catalog structure can inspire navigation, but no text, images or PDFs are copied without authorization.

## Complexity Tracking

No ratified constitution violations. The private media route, single active-device lease and durable student-owned launch are required to enforce prelaunch privacy, identify the current tablet and survive connection loss; the public-bucket/event-only alternatives fail those requirements, as documented in [research.md](research.md).
