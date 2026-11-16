# TLC route handlers

## Overview

Groups JSON APIs, publication endpoints, and instruction media and document responses.

## Subdirectories & Boundaries

- [Instruction administration APIs](./admin/README.md) — Groups configured Drive import and instruction publishing or editing endpoints.
- [Controller layout API](./controller-layout/README.md) — Stores a user's controller layout in Supabase Auth metadata.
- [Instruction media API](./instruction-media/README.md) — Groups stored catalog cover lookups.
- [Instruction catalog API](./instructions/README.md) — Exposes filtered, paginated instruction catalog reads.
- [Account workspace API](./workspace/README.md) — Loads and saves account-scoped workspace sections with revision checks.
