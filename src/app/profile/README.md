# Profile and family linking

## Overview

Displays the current TLC profile, linked accounts and role-specific account actions.

## Interface

- `ProfilePage` at `/profile` uses `useAccess`, displays linked accounts and exposes student QR generation and parent QR linking. `page.tsx:ProfilePage`
- `acceptCode` validates a scanned URL. `link` submits the pending token and refreshes the family links on success. `page.tsx:acceptCode`, `page.tsx:link`

## Invariants

- After access resolves, unauthenticated users are sent to login and incomplete profiles to registration. QR scans must match the page origin, `/link-student` and the token pattern. `page.tsx:ProfilePage`, `page.tsx:acceptCode`

## Side Effects

- Reads `my_family_links`, invokes `link_student_by_qr`, and stores or clears `tlc.pending-student` in session storage. Starting the scanner requests camera access. The parent sign-out control ends the Supabase session. `page.tsx:ProfilePage`, `page.tsx:scan`, `page.tsx:link`

## Verification

Run `npm test` from the repository root.
