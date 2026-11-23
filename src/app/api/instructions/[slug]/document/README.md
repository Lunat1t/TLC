# Instruction PDF for the reader

## Overview

Supplies the same-origin PDF response used by the instruction reader with HTTP Range (`206 Partial Content`) support.

## Interface

- `GET /api/instructions/[slug]/document` and `HEAD /api/instructions/[slug]/document` verify `requireInstructionGate(slug)`, resolve `published_instruction_drive_file`, and serve `application/pdf` bytes with `Accept-Ranges: bytes`. `route.ts:GET`, `route.ts:HEAD`

## Invariants

- Checks slug syntax, roadmap rank access via `requireInstructionGate(slug)`, and a `%PDF-` signature.
- Strictly validates single `Range: bytes=...` headers via `pdf-range.ts`, returning `416 Range Not Satisfiable` on malformed or out-of-bounds ranges.
- Enforces the 100,000,000-byte `MAX_PDF_BYTES` limit against headers and streamed bytes (`413` if exceeded). All responses use `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`.

## Verification

Run `npm test` from the repository root.
