# Workspace dashboard

## Overview

Hosts the lab board and browser-local EV3 and SPIKE project management.

## Interface

- `HomePage` at `/dashboard` renders `LabBoard` and project creation, rename, delete, import and export actions. Opening or creating a project routes to `/editor?id=...`. `page.tsx:HomePage`, `page.tsx:handleCreateProject`

## Invariants

- Reads the same project storage as the editor. `commit` passes the previous raw storage value and `navigator.locks` to `saveEditorProjects`. File imports are capped at 1,000,000 bytes. `page.tsx:commit`, `page.tsx:handleFileImport`

## Side Effects

- Reads and writes browser project storage, imports selected files and downloads `.robotproj.json` exports. The install control can register `/sw.js` in a secure context and trigger the browser's install prompt. `page.tsx:HomePage`, `page.tsx:handleExportProject`, `page.tsx:InstallAppButton`

## Verification

Run `npm test` from the repository root.
