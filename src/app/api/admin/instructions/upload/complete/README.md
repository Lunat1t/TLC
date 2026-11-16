# Complete a Drive upload

## Overview

Attaches a completed resumable Drive upload to a newly created draft.

## Interface

- `POST /api/admin/instructions/upload/complete` accepts JSON `title`, `kit`, `fileId`, `uploadId` and `size`. Returns `{ draft, asset }` with HTTP 201. `route.ts:POST`

## Invariants

- Requires `requireAdmin`. Checks upload ownership through `ownedUploadPdf`, verifies PDF signature and expected size, and rejects an existing asset for the Drive file. `route.ts:POST`

## Side Effects

- Makes the Drive PDF publicly readable and creates draft and asset rows. If asset creation fails, attempts to delete the new draft. On errors after taking ownership of an unattached upload, attempts to delete the Drive file. `route.ts:POST`

## Verification

Run `npm test` from the repository root.
