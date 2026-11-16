# Authentication callback

## Overview

Exchanges the authentication code for a session.

## Interface

- `GET /auth/callback` uses the `code` query parameter. A successful exchange redirects to `/dashboard`. `route.ts:GET`

## Invariants

- Missing codes and failed exchanges redirect to `/login?error=google`. Both redirects use the request origin. `route.ts:GET`

## Side Effects

- Calls `auth.exchangeCodeForSession` through the cookie-backed Supabase server client. `route.ts:GET`

## Verification

Run `npm test` from the repository root.
