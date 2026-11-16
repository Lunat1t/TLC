# Controller layout API

## Overview

Stores a user's controller layout in Supabase Auth metadata.

## Interface

- `GET /api/controller-layout` returns `{ config, updatedAt }`. A stored layout that fails validation returns a null config. `route.ts:GET`
- `PUT /api/controller-layout` validates the JSON body’s `config` and returns the saved config and timestamp. `route.ts:PUT`

## Invariants

- Both methods use cookie-backed `auth.getUser()` through `currentUser`, return 401 without a user and use `private, no-store`. Invalid JSON or invalid config returns 400 on PUT. `route.ts:currentUser`, `route.ts:GET`, `route.ts:PUT`

## Side Effects

- Reads user metadata and writes `controller_layout` and `controller_layout_updated_at` through `auth.updateUser`, spreading existing metadata into the update. `route.ts:GET`, `route.ts:PUT`

## Verification

Run `npm test` from the repository root.
