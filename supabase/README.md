# Supabase schema

## Overview

The base schema creates TLC profiles. The migrations extend profiles and add the instruction catalog, account links, achievement awards, and workspace data.

## Interface

- [`profiles`, `handle_new_tlc_user()`, and `on_auth_user_created`](./schema.sql) define the base profile record and the Auth insert trigger.
- [Migration contracts](./migrations/README.md) describe changes beyond the base schema.

## Invariants

- In the base schema, `profiles.id` references `auth.users.id` and `profiles.login` is unique. The base profile policies check ownership. Consult the migration that last changes an object for its later behavior.

## Side Effects

- The Auth insert trigger inserts or updates the user's profile. The foreign key removes the profile when its Auth user is deleted.

## Verification

- Follow the test project instructions in [migrations](./migrations/README.md).
