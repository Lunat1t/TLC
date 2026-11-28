# Browser PDF worker

## Overview

This directory contains the bundled PDF.js worker used by the instruction reader.

## Interface

- [`pdfjs-wasm/`](./pdfjs-wasm) holds the PDF.js WebAssembly decoders (JPEG 2000, JBIG2, ICC). It is passed to PDF.js as `wasmUrl` (`PDFJS_WASM_URL`) in `src/components/instructions/pdf-reader.tsx`; without it JPX-based pages such as the LEGO EV3 instructions render blank.
- [`pdf.worker.min.mjs`](./pdf.worker.min.mjs) is served as `/vendor/pdf.worker.min.mjs` and assigned to PDF.js `GlobalWorkerOptions.workerSrc` in `src/components/instructions/pdf-reader.tsx`.

## Invariants

- `scripts/sync-pdf-worker.mjs` copies the worker and the `wasm/` folder from the installed version of `pdfjs-dist`.

## Side Effects

- The worker processes PDF data when the browser reader loads a document through PDF.js.

## Verification

- Run `npm test` from the repository root for the shared suite.
