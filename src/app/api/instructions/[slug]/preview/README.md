# Instruction cover preview

## Overview

Returns a published PDF's rendered preview or the fallback cover.

## Interface

- `GET /api/instructions/[slug]/preview` returns JPEG bytes from `publishedPreview`. `route.ts:GET`

## Invariants

- Malformed slugs and rendering failures use the fallback SVG. The SVG has a shorter public cache lifetime than the JPEG. `route.ts:GET`, `route.ts:fallbackResponse`

## Side Effects

- Calls `publishedPreview`. On a cache miss, `cachedPreview` resolves the published Drive ID, fetches the PDF and renders its first page. `route.ts:GET`, `src/lib/instructions/public-preview.ts:publishedPreview`, `src/lib/instructions/public-preview.ts:cachedPreview`

## Verification

Run `npm test` from the repository root.
