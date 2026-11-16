# Instruction detail API

## Overview

Serves one published instruction card by slug.

## Interface

- `GET /api/instructions/[slug]` returns the `publishedCard` result as JSON. `route.ts:GET`
- [Instruction PDF for the reader](./document/README.md) — Supplies the same-origin PDF response used by the instruction reader.
- [Instruction PDF download](./download/README.md) — Resolves the original PDF download for a published instruction.
- [Instruction cover preview](./preview/README.md) — Returns a published PDF's rendered preview or the fallback cover.

## Invariants

- A missing card returns a 404 `not_found` error. Successful JSON responses use `Cache-Control: no-store`. `route.ts:GET`

## Side Effects

- Delegates the catalog lookup to `publishedCard`. `route.ts:GET`, `src/lib/instructions/detail.ts:publishedCard`

## Verification

Run `npm test` from the repository root.
