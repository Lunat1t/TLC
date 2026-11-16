# Browser PDF worker

## Overview

This directory contains the bundled PDF.js worker used by the instruction reader.

## Interface

- [`pdf.worker.min.mjs`](./pdf.worker.min.mjs) is served as `/vendor/pdf.worker.min.mjs` and assigned to PDF.js `GlobalWorkerOptions.workerSrc` in `src/components/instructions/pdf-reader.tsx`.

## Invariants

- `scripts/sync-pdf-worker.mjs` copies the worker from the installed version of `pdfjs-dist`.

## Side Effects

- The worker processes PDF data when the browser reader loads a document through PDF.js.

## Verification

- Run `npm test` from the repository root for the shared suite.
