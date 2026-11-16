# Avatar route

## Overview

Opens the full-page avatar editor using the current profile.

## Interface

- `AvatarPage` at `/avatar` supplies `profile.avatar` to `AvatarEditor` as `initialAvatar` and offers a retry on profile load failure. `page.tsx:AvatarPage`

## Invariants

- The editor renders for students or teachers whose onboarding is complete. Once access resolves without error, missing users, incomplete onboarding and other roles go to login, registration and profile respectively. `page.tsx:AvatarPage`

## Side Effects

- Reads state from `useAccess`, invokes `refreshProfile` on retry, and uses `router.replace` for access redirects. `page.tsx:AvatarPage`

## Verification

Run `npm test` from the repository root.
