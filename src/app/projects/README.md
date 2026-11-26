# Projects page

## Overview

`/projects` is the full list of the account's programs. The desktop keeps only pinned items; this page scales to many projects.

## Interface

- `ProjectsPage` shows project cards with search by name, a robot filter (SPIKE Prime or EV3) and sorting by update date, creation date or name. Each card opens `/editor?id=...` and has rename, download and delete actions. `page.tsx:ProjectsPage`
- New projects are created from the robot picker and file import. `page.tsx:create`, `page.tsx:importFile`
- Filtering and plural forms live in `src/lib/project-list.ts` (`filterProjects`, `countLabel`) and are covered by `tests/project-list.test.ts`.

## Invariants

- Reads and writes through `useAccountProjects`; `commit` passes the previous raw storage value so stale writes are refused. File imports are capped at 1,000,000 bytes.

## Verification

Run `npm test` from the repository root.
