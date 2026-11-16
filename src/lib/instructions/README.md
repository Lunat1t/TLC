# Instruction services

## Overview

This package provides catalog reads, access checks, upload validation, Drive operations and PDF previews for TLC assembly instructions. Published reads use the shared public Supabase client. Access checks use the caller's session.

## Interface

- `InstructionError`, `errorResponse` and `noStoreHeaders` provide status and error codes, a JSON error envelope and private no-store headers. `serverClient` uses the request cookies. `verifiedUser`, `requireAdmin`, `requireCurrentDevice` and `requireInstructionPublisher` verify identity and check the named permission or current device. [access.ts](./access.ts)
- `listCatalog` returns `{ items, nextCursor }` for an optional kit, search query and cursor. `publishedCard` reads a published item by slug and reports whether the published Drive file lookup returned a string. `driveDownloadPath` returns the download API path for a valid slug with a PDF. [catalog.ts](./catalog.ts) · [detail.ts](./detail.ts) · [drive-links.ts](./drive-links.ts)
- `listConfiguredPdfs`, `configuredPdf` and `ownedUploadPdf` discover or check files in the configured Drive tree. `verifyPdfSignature` checks the first five bytes. `createPdfUploadSession` returns a resumable session URL, upload ID and expected size. `publicDriveDownloadUrl` builds the public download URL. `ensurePublicDriveRead` and `deleteDriveFile` manage access and deletion. [google-drive.ts](./google-drive.ts)
- `normalizeCoverImage` and `renderFirstPagePreview` return 720 × 480 JPEGs. `publishedPreview` resolves the published PDF and returns its first-page JPEG as a buffer. [pdf-preview.ts](./pdf-preview.ts) · [public-preview.ts](./public-preview.ts)
- `asKit`, `asText`, `asTopics`, `asSlug`, `validateUpload` and `validatePublish` validate input. `instructionBucket` names the `instruction-assets` bucket. The data contracts cover instructions, steps, assets, catalog cards, student sessions and selections, launch snapshots and assembly progress. [validation.ts](./validation.ts) · [types.ts](./types.ts)

## Invariants

- `requireAdmin`, `requireCurrentDevice` and `requireInstructionPublisher` require the corresponding RPC to return `true`. A rejected device generation returns `409 stale_device`. An RPC error returns `503 dependency_unavailable`. [access.ts](./access.ts)
- `listCatalog` trims search to 100 characters and emits up to 20 cards per page. Its base64url cursor carries a publication timestamp and a UUID. `asKit` accepts `spike` or `ev3`. [catalog.ts](./catalog.ts) · [validation.ts](./validation.ts)
- `validateUpload` accepts nonempty PNG, JPEG, WebP and SVG images up to 8 MiB and PDFs up to 100,000,000 bytes. `validatePublish` requires title, summary, kit, explicit rights attestation and material. [validation.ts](./validation.ts)
- `listConfiguredPdfs` reports depth and count truncation, with a maximum depth of four below the configured folder and a maximum of 500 returned PDFs. `configuredPdf` accepts a listed PDF with a positive declared size up to 100,000,000 bytes. `ownedUploadPdf` also requires the matching `tlcUploadId` property. `verifyPdfSignature` requires a five-byte partial response beginning with `%PDF-`. [google-drive.ts](./google-drive.ts)
- `publishedPreview` enforces the 30 MiB limit on both the declared length and streamed body, checks `%PDF-` and shares one pending render per slug in the process. [public-preview.ts](./public-preview.ts) · [pdf-preview.ts](./pdf-preview.ts)

## Side Effects

- Access helpers read request cookies and call Supabase Auth and the `is_instruction_admin`, `is_current_student_device` and `can_publish_instruction` RPCs. [access.ts](./access.ts)
- `listCatalog` queries `search_instruction_cards`. `publishedCard` reads `instructions` and calls `published_instruction_drive_file`. These shared cache entries revalidate after 60 seconds. `publishedPreview` also calls `published_instruction_drive_file`, fetches the PDF from Drive and caches the preview for 86,400 seconds. All three use the `instruction-catalog` cache tag. [catalog.ts](./catalog.ts) · [detail.ts](./detail.ts) · [public-preview.ts](./public-preview.ts)
- Drive operations obtain and cache service-account tokens by scope. `createPdfUploadSession` requests a Drive upload session in the `черновики` subfolder when found, falling back to the configured folder. `ensurePublicDriveRead` can create or update a link-reader permission. `deleteDriveFile` sends a Drive deletion request. [google-drive.ts](./google-drive.ts)
- `renderFirstPagePreview` sets PDF.js's worker path to the installed legacy worker under `node_modules` and destroys the loading task after rendering. [pdf-preview.ts](./pdf-preview.ts)

## Verification

Run `npm test` from the repository root. Live Supabase and Drive behavior requires an environment configured for those services.
