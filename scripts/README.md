# Maintenance scripts

## Overview

Scripts prepare the browser PDF worker and install optional Drive upload credentials.

## Interface

- [`sync-pdf-worker.mjs`](./sync-pdf-worker.mjs) runs from the `predev` and `prebuild` package hooks.
- [`main()` in the Drive credential importer](./import_google_drive_service_account.py) accepts a service-account JSON file path.

## Invariants

- The PDF worker is copied from the installed `pdfjs-dist` package.
- The credential importer requires an existing local environment file and validates the account before replacing it.

## Side Effects

- The sync script creates `public/vendor` if needed and writes the PDF worker.
- The importer replaces the local environment file atomically, keeps its other settings, and sets permissions to `0600`.

## Verification

- Run `npm test` from the repository root for the shared suite.
