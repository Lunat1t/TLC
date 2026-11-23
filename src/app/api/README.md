# TLC route handlers

## Overview

Groups JSON APIs, publication endpoints, and instruction media and document responses.

## Subdirectories & Boundaries

- [Instruction administration APIs](./admin/README.md) — Groups configured Drive import and instruction publishing or editing endpoints.
- [Controller layout API](./controller-layout/README.md) — Stores a user's controller layout in Supabase Auth metadata.
- [Instruction media API](./instruction-media/README.md) — Groups stored catalog cover lookups.
- [Instruction catalog API](./instructions/README.md) — Exposes filtered, paginated instruction catalog reads.
- [Account workspace API](./workspace/README.md) — Loads and saves account-scoped workspace sections with revision checks.

- Billing APIs (`billing/entitlements`, `billing/checkout`, `billing/test-activate`, `billing/webhook/cloudpayments`) — Handle entitlements, CloudPayments KZ `Content-HMAC` webhooks, and gated test activations.
- School APIs (`school`, `school/groups`, `school/invites`, `school/invites/[inviteId]/revoke`, `school/members/remove`, `school/join`) — Manage org groups, invites, and memberships.
- Solo roadmap check (`roadmap/solo-check`) — Server-verified Solo card completion.
