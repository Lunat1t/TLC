# Publish a Drive link

## Overview

Publishes an instruction from a publicly readable Google Drive PDF.

## Interface

- `POST /api/admin/instructions/link` receives multipart `title`, `kit`, `summary`, `topics`, `rights`, `url` and optional `cover`. Returns the published instruction with HTTP 201. `route.ts:POST`

## Invariants

- Requires `requireInstructionPublisher`, confirmed rights, an accepted kit and metadata, a valid HTTPS Drive URL and verified PDF signature and size. A custom image is required above the automatic preview size limit. `route.ts:POST`

## Side Effects

- Fetches the PDF from Drive, generates or normalizes a JPEG cover, uploads it to the instruction bucket and calls `publish_drive_instruction`. Revalidates `instruction-catalog` and attempts cover removal on publication failure. `route.ts:POST`

## Verification

Run `npm test` from the repository root.
