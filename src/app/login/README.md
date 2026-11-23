# Sign-in page

## Overview

Signs in with a TLC login and password.

## Interface

- `LoginPage` at `/login` prefills a locally remembered login if available and submits credentials through `signInStudentWithSupabase`. `page.tsx:LoginPage`, `page.tsx:handleSubmit`

## Invariants

- Successful form sign-in goes to `/settings` when a student link is pending. With no pending link, the exact `/admin/instructions/drive` return path is honored and all other values lead to `/dashboard`. `page.tsx:handleSubmit`

## Side Effects

- Reads local auth state and calls Supabase sign-in through the auth helper. Schedules a route replacement after success. `page.tsx:LoginPage`, `page.tsx:handleSubmit`

## Verification

Run `npm test` from the repository root.
