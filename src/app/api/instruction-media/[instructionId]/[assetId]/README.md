# Catalog cover media

## Overview

Retrieves a catalog cover from instruction storage.

## Interface

- `GET /api/instruction-media/[instructionId]/[assetId]` resolves the requested pair via `catalog_cover_object` and returns the downloaded image bytes. `route.ts:GET`

## Invariants

- Uses the public Supabase client. A missing object key yields 404, and lookup or download failures yield 503. A successful response is publicly cacheable and includes `nosniff`. `route.ts:GET`

## Side Effects

- Reads the cover key via Supabase RPC and downloads the object from `instructionBucket`. `route.ts:GET`

## Verification

Run `npm test` from the repository root.
