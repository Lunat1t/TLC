# Instruction PDF for the reader

## Overview

Supplies the same-origin PDF response used by the instruction reader.

## Interface

- `GET /api/instructions/[slug]/document` resolves `published_instruction_drive_file` and returns verified `application/pdf` bytes. `route.ts:GET`

## Invariants

- Checks slug syntax and a `%PDF-` signature. Enforces a 25,000,000-byte limit against both the header and bytes read, returning 413 if exceeded. Successful responses use `private, no-store` and `nosniff`. `route.ts:GET`

## Side Effects

- Reads the Drive file ID via a Supabase RPC, fetches the PDF with a 45-second timeout, buffers up to the endpoint limit, and cancels the stream reader. `route.ts:GET`

## Verification

Run `npm test` from the repository root.
