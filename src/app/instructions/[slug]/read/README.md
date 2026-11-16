# Instruction PDF reader route

## Overview

Opens the instruction reader for published cards with PDFs.

## Interface

- `ReaderPage` renders `/instructions/[slug]/read` using `PdfReader` with the slug and card title. `page.tsx:ReaderPage`

## Invariants

- A missing card or a card without a PDF returns `notFound()`. `page.tsx:ReaderPage`

## Side Effects

- Looks up the card through `publishedCard`. `page.tsx:ReaderPage`, `src/lib/instructions/detail.ts:publishedCard`
- The mounted reader fetches the same-origin PDF document, renders pages to canvas and stores the last page per slug in browser storage. `src/components/instructions/pdf-reader.tsx:PdfReader`

## Verification

Run `npm test` from the repository root.
