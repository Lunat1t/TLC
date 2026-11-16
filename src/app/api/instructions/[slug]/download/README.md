# Instruction PDF download

## Overview

Resolves the original PDF download for a published instruction.

## Interface

- `GET /api/instructions/[slug]/download` responds with a 302 redirect to the URL returned by `publicDriveDownloadUrl`. `route.ts:GET`

## Invariants

- Validates slug syntax and requires `published_instruction_drive_file` to return a string. The redirect is private and non-cacheable with a no-referrer policy. `route.ts:GET`

## Side Effects

- Reads the published Drive file ID via Supabase RPC and resolves its download URL. `route.ts:GET`

## Verification

Run `npm test` from the repository root.
