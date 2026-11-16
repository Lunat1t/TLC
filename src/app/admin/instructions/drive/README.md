# Drive instruction submission

## Overview

Provides the teacher-facing form for publishing a public Drive PDF to the instruction catalog.

## Interface

- `InstructionDrivePage` renders `/admin/instructions/drive` and submits multipart form data to `/api/admin/instructions/link`. `page.tsx:InstructionDrivePage`, `page.tsx:submit`

## Invariants

- Requires a title, kit, URL and rights confirmation in the form. A custom JPG, PNG or WebP cover is optional in the form. The publication endpoint enforces access and file validation. `page.tsx:InstructionDrivePage`, `src/app/api/admin/instructions/link/route.ts:POST`

## Side Effects

- POSTs the form to the publication endpoint and resets it after a successful response. `page.tsx:submit`

## Verification

Run `npm test` from the repository root.
