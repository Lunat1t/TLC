# Instruction catalog API

## Overview

Exposes filtered, paginated instruction catalog reads.

## Interface

- `GET /api/instructions` passes query parameters `kit`, `q` and `cursor` to `listCatalog` and returns its result. `route.ts:GET`
- [Instruction detail API](./[slug]/README.md) — Serves one published instruction card by slug.
- [Instruction publishing status](./admin-status/README.md) — Reports the verified user's instruction administration and publishing capabilities.

## Invariants

- Successful catalog responses use a 60-second shared-cache lifetime and a 300-second stale-while-revalidate window. `route.ts:GET`

## Side Effects

- Delegates catalog reads to `listCatalog`. `route.ts:GET`, `src/lib/instructions/catalog.ts:listCatalog`

## Verification

Run `npm test` from the repository root.
