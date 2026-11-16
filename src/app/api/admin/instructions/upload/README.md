# Start a Drive upload

## Overview

Creates the resumable upload session for an instruction PDF.

## Interface

- `POST /api/admin/instructions/upload` accepts JSON `title`, `kit` and `size`. Returns the session from `createPdfUploadSession` with HTTP 201. `route.ts:POST`
- [Complete a Drive upload](./complete/README.md) — Attaches a completed resumable Drive upload to a newly created draft.

## Invariants

- Requires `requireAdmin` and applies `asText` and `asKit` before requesting a session. The response is private and non-cacheable with a no-referrer policy. `route.ts:POST`

## Side Effects

- Creates a resumable Google Drive upload session for the validated title with a `.pdf` suffix. `route.ts:POST`

## Verification

Run `npm test` from the repository root.
