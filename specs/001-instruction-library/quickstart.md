# Quickstart validation: библиотека инструкций

This is the run guide for the implementation phase. The feature is planned; its routes and migrations do not exist yet. See [data-model.md](data-model.md) and [contracts/web-and-api.md](contracts/web-and-api.md) for the states and API responses.

## Prerequisites

- TLC checkout on `001-instruction-library` with the implementation and migrations from [plan.md](plan.md).
- A non-production Supabase project with Auth, Postgres, private Storage and Realtime enabled; one admin and five student test accounts. Use four student accounts simultaneously for roster checks and five distinct students for the usability check.
- Rights-cleared test instructions for SPIKE Prime and EV3: at least 10 published cards for navigation, at least 20 for catalog timing, one 10-step instruction and one PDF instruction. Never copy assets from the reference site.
- Two devices/browsers for one student account, four student devices/browsers for the class scenario and one admin device. Configure the same repeatable mobile network throttling profile for performance runs and record its settings.
- Local environment variables configured as in the existing TLC setup; keep secrets server-side.

## Setup and baseline checks

1. Apply the feature migrations to the test Supabase project, create the private instruction bucket and provision the admin account by the trusted operator procedure.
2. From the repository root run `npm install`, `npm test`, `npx tsc --noEmit`, and `npm run build`; record the result of each command.
3. Start TLC with `npm run dev`. Open the admin and student devices. Sign in to the public `/login` page; the teacher entry must reach the guarded admin area after sign-in and remain reachable before sign-in.

## End-to-end scenarios

1. As admin, create and publish the test instructions with rights confirmation. Verify the public catalog and cards contain the title, description, kit, topics and permitted cover only. Before launch, test direct API/media links as guest and student: ordered steps, step images and PDF must be denied, including for a published card. Admin editorial preview remains available.
2. As guest, enter the catalog using either the «Инструкции» bottom button or one left swipe from «Проекты». These are two ways to enter the catalog and are not added together. From the visible catalog, filter by kit, search by title/topic, open a card and use keyboard controls at narrow widths. Drafts and archived cards return no public result. With 10 cards, record the number of user actions after the catalog first appears to reach a named card; the target remains at most three actions (SC-001).
3. Sign in as four students, each on a separate tablet, and choose an instruction. Verify one row per student in `/admin/students`, with current selection, connection freshness and current device. Check that student A cannot read B's selection, launch, progress or roster, both through pages and direct API/database requests.
4. Launch one student's choice from admin. Verify only the targeted current tablet opens `/assembly/[launchId]` and receives the steps/PDF; the other three remain unchanged. Confirm the admin sees `pending`, then `opened`. Save progress, refresh and check the same step returns. Check `completed` after completion and `closed` after ordinary exit.
5. Attempt a launch without selection, with an outdated selection version, from a student account and after a tablet replacement. Verify the documented `409`/`403` responses and no unintended opening. Repeat the same admin idempotency key and verify only one launch exists.
6. Interrupt the selected tablet's network immediately after admin launch; reconnect and verify the durable pending launch opens once. Test with unsaved robot-editor work and verify it is saved or navigation waits for the student's safe choice.
7. While a build is open, sign in as the same student on a second tablet. Verify the old tablet stops receiving protected updates and cannot read steps/files or write progress, while the new tablet resumes the same launch at the last saved step. Repeat with a pending launch. An old token/heartbeat must not reclaim the active device. Verify the admin roster still has one row for that student and points to the new tablet.
8. While a build is open, select a different instruction. Verify the old progress is saved, the old launch becomes `closed`, the new selection appears in the admin roster as awaiting launch, and the new steps remain inaccessible until a new admin command. Also change a choice before launch and verify the old pending launch becomes `superseded`.
9. Archive an instruction. Verify its card, direct preview and cover disappear for guests/students and no new launch can be created. An already opened build continues its pinned steps/files until completed/closed, including after a tablet change. A merely pending launch cannot newly open after archive. When the build closes, its protected media is denied.
10. Sign out or close a student's active tablet. After the activity lease expires, verify the admin roster marks that student offline or removes them from the active list. A later verified sign-in restores the appropriate pending/opened launch without resetting progress.

## Measured acceptance results

Record device/browser, network profile, catalog size, timestamps, pass/fail and any limitation in the implementation test report. Use the same start/end points for every repeat.

| Criterion | Run | Pass condition |
| --- | --- | --- |
| SC-001 | With 10 published cards across both kits, reach a named card from the home/catalog path and count actions after entering the catalog. | No more than 3 actions. |
| SC-002 | Ask five distinct students to reach the first step after admin launch on a tablet, without coaching. | At least 4 of 5 succeed. |
| SC-003 | Try draft/archived cards and direct links as guest/student; try prelaunch step/PDF URLs and another student's active launch. | Every forbidden request denied; opened owner snapshot remains accessible until closure. |
| SC-004 | Publish a prepared 10-step instruction through admin UI. | No source-code edit required. |
| SC-005 | With 20 cards, use the recorded mobile throttling profile and time from catalog navigation to visible titles and actions. | Within 3 seconds. |
| SC-006 | Keep four students online, verify all four selections, then perform 10 addressed launches across the tablets; time from admin command acceptance to correct workspace visible. | At least 9 of 10 within 5 seconds, and no wrong tablet opens. |
| SC-007 | Repeat a launch during a short network break, with an unsaved editor state; verify stored command after reconnect and protected navigation. | Every stored launch opens once after reconnection, without losing unsaved work. |

## Expected outcomes

All [spec.md](spec.md) success criteria SC-001 through SC-007 are met and the measured results above are recorded. Failed uploads leave a recoverable draft. No action executes a robot program or controls motors.
