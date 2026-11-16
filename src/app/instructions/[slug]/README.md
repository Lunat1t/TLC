# Instruction detail page

## Overview

Displays a published catalog card with its cover and available PDF actions.

## Interface

- `InstructionCardPage` at `/instructions/[slug]` displays kit, title, summary and topics and links to the reader and PDF download when available. `page.tsx:InstructionCardPage`
- [Instruction PDF reader route](./read/README.md) — Opens the instruction reader for published cards with PDFs.

## Invariants

- A missing card returns `notFound()`. The cover uses stored asset media when present, then the preview URL if the card has a PDF. `page.tsx:InstructionCardPage`

## Side Effects

- Looks up the card through `publishedCard`. Rendering the image requests the cover or preview API if a URL is available. `page.tsx:InstructionCardPage`, `src/lib/instructions/detail.ts:publishedCard`

## Verification

Run `npm test` from the repository root.
