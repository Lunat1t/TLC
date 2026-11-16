# Instruction publishing status

## Overview

Reports the verified user's instruction administration and publishing capabilities.

## Interface

- `GET /api/instructions/admin-status` returns `{ isAdmin, role, canPublish }`. `route.ts:GET`

## Invariants

- Uses `verifiedUser`. The returned role is null until onboarding is complete. `canPublish` is true for an instruction administrator or a teacher who completed onboarding. `route.ts:GET`

## Side Effects

- Reads `is_instruction_admin` and the user's `profiles` row concurrently. `route.ts:GET`

## Verification

Run `npm test` from the repository root.
