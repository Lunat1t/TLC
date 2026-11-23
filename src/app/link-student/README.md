# Student linking handoff

## Overview

Receives a student QR link and passes its token to `/settings`.

## Interface

- `LinkStudentPage` handles `/link-student?token=...` and replaces the route with `/settings`. `page.tsx:LinkStudentPage`

## Invariants

- Only tokens matching the route's 36-character hexadecimal-or-hyphen pattern are stored. Navigation to settings happens for every input. `page.tsx:LinkStudentPage`

## Side Effects

- Stores a valid token under `tlc.pending-student` in session storage and redirects to `/settings`. `page.tsx:LinkStudentPage`

## Verification

Run `npm test` from the repository root.
