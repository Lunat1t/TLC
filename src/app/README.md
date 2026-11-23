# TLC App Router

## Overview

Defines the Next.js pages and route handlers for the public site, robot workspace, accounts and instruction catalog.

## Interface

- `WelcomePage` renders `/` in Russian or Kazakh and links to the trial, login and registration flows. `page.tsx:WelcomePage`
- `RootLayout` provides shared metadata, viewport, access and workspace context, startup behavior, student navigation and achievement notifications. `layout.tsx:RootLayout`, `layout.tsx:metadata`, `layout.tsx:viewport`
- `Loading` renders the shared route loading status. `loading.tsx:Loading`
- [Instruction administration pages](./admin/README.md) — Contains the teacher-facing Drive PDF publication workflow.
- [TLC route handlers](./api/README.md) — Groups JSON APIs, publication endpoints, and instruction media and document responses.
- [Authentication routes](./auth/README.md) — Groups the authentication callback handler.
- [Workspace dashboard](./dashboard/README.md) — Hosts the lab board and browser-local EV3 and SPIKE project management.
- [Robot block editor](./editor/README.md) — Loads one browser-local project, edits its sheets and control layouts, and exports or checks robot programs.
- [Local Markdown and text reader](./files/README.md) — Reads Markdown and text from files or folders the user selects in the browser.
- [Instruction catalog page](./instructions/README.md) — Renders the published instruction catalog with kit, text and cursor filters.
- [Student linking handoff](./link-student/README.md) — Receives a student QR link and passes its token to the profile flow.
- [Sign-in page](./login/README.md) — Signs in with a TLC login and password.
- [Account onboarding](./register/README.md) — Runs the Russian or Kazakh registration and profile completion flow.
- [Workspace settings page](./settings/README.md) — Exposes workspace appearance, panel, clock and account controls.
- [Teacher pages](./teacher/README.md) — Groups pages for teacher actions on student accounts.
- [Trial lesson request](./trial/README.md) — Builds a WhatsApp message for a trial lesson request in Russian or Kazakh.

## Invariants

- The root provider order places `AccountWorkspaceProvider` inside `AccessProvider`, with `AppStartup` around navigation. `layout.tsx:RootLayout`
- The welcome page accepts only `ru` or `kk` as a saved locale. `page.tsx:WelcomePage`
- `middleware` bypasses API routes, `/`, `/trial` and the manifest. With Supabase configuration present, the session middleware redirects incomplete accounts from the dashboard, editor, instructions and Drive submission pages. Those pages also redirect parents with complete profiles to `/settings`. `src/middleware.ts:middleware`, `src/utils/supabase/middleware.ts:createClient`

## Side Effects

- The welcome page reads and updates `tlc.site-language` in browser storage. The root layout mounts the shared client providers. `page.tsx:changeLanguage`, `layout.tsx:RootLayout`

## Verification

Run `npm test` from the repository root.
