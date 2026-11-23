# Instruction PDF reader route

## Overview

Opens the instruction reader for published cards with PDFs after verifying the roadmap rank gate.

## Interface

- `ReaderPage` renders `/instructions/[slug]/read` using `PdfReader` with `slug`, `title`, `kit`, and `initialUserId`. `page.tsx:ReaderPage`

## Invariants

- A missing card or a card without a PDF returns `notFound()`. Locked cards render the rank gate message instead of mounting the reader. `page.tsx:ReaderPage`

## Side Effects

- Looks up the card through `publishedCard` and checks `checkInstructionGate(slug)`. `page.tsx:ReaderPage`, `src/lib/instructions/detail.ts:publishedCard`
- The mounted reader fetches the same-origin PDF document (with HTTP Range 206 + user-scoped IndexedDB cache), renders pages to canvas and stores page + rotation per `userId` in browser storage. `src/components/instructions/pdf-reader.tsx:PdfReader`

## Verification

Run `npm test` from the repository root.
