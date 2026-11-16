# Instruction catalog page

## Overview

Renders the published instruction catalog with kit, text and cursor filters.

## Interface

- `InstructionsPage` renders `/instructions`, calls `listCatalog` with search parameters and displays the result with `InstructionCatalogCards`. `page.tsx:InstructionsPage`
- `Loading` renders the route's pending catalog view. `loading.tsx:Loading`
- [Instruction detail page](./[slug]/README.md) — Displays a published catalog card with its cover and available PDF actions.

## Invariants

- The filter form exposes SPIKE Prime and EV3 plus all kits. The next-page link carries the current valid kit and displayed query with `nextCursor`. Failed catalog reads show an alert. `page.tsx:InstructionsPage`

## Side Effects

- Requests catalog data from `listCatalog` on the server. `page.tsx:InstructionsPage`, `src/lib/instructions/catalog.ts:listCatalog`

## Verification

Run `npm test` from the repository root.
