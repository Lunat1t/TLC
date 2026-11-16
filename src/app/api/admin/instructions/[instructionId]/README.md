# Published instruction editing

## Overview

Publisher endpoint for reading and updating an existing published instruction.

## Interface

- `GET /api/admin/instructions/[instructionId]` returns card data, the current Drive file ID and an optional cover URL. `route.ts:GET`
- `PATCH /api/admin/instructions/[instructionId]` accepts multipart card fields, a Drive URL and an optional cover image. `route.ts:PATCH`

## Invariants

- Both methods require `requireInstructionPublisher`, a matching UUID and a published card. Updates require publication rights and valid metadata. Replacing the PDF requires a readable Drive PDF. A manual cover must be JPG, PNG or WebP up to 3 MiB. Changing the PDF without a manual cover requires the PDF to fit the automatic preview limit. `route.ts:GET`, `route.ts:PATCH`, `route.ts:parsedTopics`

## Side Effects

- Fetches Drive data for a changed PDF, can upload a JPEG cover, and calls `update_instruction_card_admin`. Invalidates `instruction-catalog` on success and attempts to remove the new cover on failure. `route.ts:PATCH`

## Verification

Run `npm test` from the repository root.
