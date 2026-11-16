# Local Markdown and text reader

## Overview

Reads Markdown and text from files or folders the user selects in the browser.

## Interface

- `FilesPage` at `/files` lists and searches selected Markdown and text files. It renders Markdown or displays its source and follows links to selected local documents. `page.tsx:FilesPage`

## Invariants

- A selection may contain up to 2,000 files, and a displayed document may be up to 2,000,000 bytes. Relative Markdown image paths must resolve to selected local image files. `page.tsx:choose`, `page.tsx:relativePath`, `page.tsx:FilesPage`

## Side Effects

- Reads selected files with `File.text()` and creates and revokes object URLs for local images. External HTTP(S) links open separately when followed. `page.tsx:FilesPage`

## Verification

Run `npm test` from the repository root.
