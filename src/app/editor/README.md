# Robot block editor

## Overview

Loads one browser-local project, edits its sheets and control layouts, and exports or checks robot programs.

## Interface

- `EditorPage` renders `/editor`. `EditorWorkspace` reads the project from the `id` query parameter, prepares local projects and loads sheets via `readSheets`. `page.tsx:EditorPage`, `page.tsx:EditorWorkspace`
- `handleExportCode` generates Pybricks Python for the current sheet. `startProgram` and `stopProgram` manage the controller check mode through the robot session. `page.tsx:handleExportCode`, `page.tsx:startProgram`, `page.tsx:stopProgram`

## Invariants

- `persistSheets` rejects edits submitted during a pending save and updates React state after `saveEditorProjects` succeeds. `saveLayout` checks the layout against the sheet IDs. `addControlArea` limits each sheet to one area. `page.tsx:persistSheets`, `page.tsx:saveLayout`, `page.tsx:addControlArea`
- The check view opens only if the session reports `trial-running` or `live-running`. Keyboard dispatch in that view requires one matching control target and skips inputs with mapped errors. `page.tsx:startProgram`, `page.tsx:EditorWorkspace`

## Side Effects

- Saves project changes in browser storage, sets the document title and downloads `tlc_program.py` on request. The check path can start a connected hub and dispatch inputs. Session stop is requested on project change, blur, page hide and hidden visibility. `page.tsx:renameProgram`, `page.tsx:persistSheets`, `page.tsx:handleDownloadPy`, `page.tsx:startProgram`, `page.tsx:dispatchControl`, `page.tsx:EditorWorkspace`

## Verification

Run `npm test` from the repository root.
