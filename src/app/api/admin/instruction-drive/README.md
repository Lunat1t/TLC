# Configured Drive import

## Overview

Administrator endpoint for discovering PDFs in the configured Drive folder and attaching one to a draft.

## Interface

- `GET /api/admin/instruction-drive` lists Drive PDFs and TLC drafts, marking oversized or previously imported PDFs. `route.ts:GET`
- `POST /api/admin/instruction-drive` creates a draft when `action` is `create`. Otherwise it imports the given `fileId` into `instructionId`. `route.ts:POST`

## Invariants

- Both methods call `requireAdmin`. Draft creation validates the slug and kit. Import requires a draft and a PDF found through `configuredPdf`, with a valid signature. An existing asset for that Drive file blocks the import. `route.ts:GET`, `route.ts:POST`

## Side Effects

- Reads Drive and the `instructions` and `instruction_assets` tables. The import sets public Drive read access before inserting an asset reference. The create branch inserts a draft. `route.ts:GET`, `route.ts:POST`

## Verification

Run `npm test` from the repository root.
