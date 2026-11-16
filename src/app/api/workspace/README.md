# Account workspace API

## Overview

Loads and saves account-scoped workspace sections with revision checks.

## Interface

- `GET /api/workspace` returns `{ userId, sections }` with each section's value and revision. `route.ts:GET`
- `PUT /api/workspace` accepts JSON `userId`, `section`, `value` and `revision`. Returns `{ userId, revision }`. `route.ts:PUT`

## Invariants

- Both methods verify the user. PUT rejects a supplied foreign `Origin`, a mismatched account, oversized payloads and invalid section shapes. `settings` and `layout` require objects, `board` requires an array, and revisions are non-negative integers. A stale revision returns 409. `route.ts:GET`, `route.ts:PUT`

## Side Effects

- Reads `account_workspace` for the current user and calls `save_workspace_section` to update the supplied section. `route.ts:GET`, `route.ts:PUT`

## Verification

Run `npm test` from the repository root.
