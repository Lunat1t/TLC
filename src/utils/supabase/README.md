# Supabase clients

## Overview

This package supplies the Supabase clients used in the browser, Next.js server code, request middleware and shared public catalog caches.

## Interface

- `getSupabaseConfig` returns the URL and publishable key. [config.ts](./config.ts)
- `createClient()` creates the browser client. `createClient(cookieStore)` adapts a Next.js cookie store for server code. [client.ts](./client.ts) · [server.ts](./server.ts)
- `createClient(request)` verifies session claims and returns a Next.js continuation or redirect response. [middleware.ts](./middleware.ts)
- `createPublicClient()` creates the client for published catalog reads. It disables auth session persistence, token refresh and URL-based session detection. [public.ts](./public.ts)

## Invariants

- `getSupabaseConfig` requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The URL must parse and use HTTPS outside `localhost`. [config.ts](./config.ts)
- `createClient(request)` derives the user ID from `getClaims()` and checks `profiles.onboarding_complete` and `role` on gated routes. Anonymous visitors can access `/dashboard` and `/editor` directly in guest mode, while `/map`, `/instructions` (and descendants), `/teacher/roadmap` (and descendants), and `/admin/instructions/drive` redirect anonymous visitors to `/login`. For authenticated users on any gated route, incomplete onboarding redirects to `/register` and completed parent profiles redirect to `/settings`. The Drive upload and teacher roadmap pages permit a completed teacher profile or an affirmative `is_instruction_admin` result after the parent check. On `/login` or a `/register` URL without a `student` query parameter, completed profiles go to `/settings` for parents and `/dashboard` for other roles. [middleware.ts](./middleware.ts)
- `createPublicClient` uses the publishable key without a request cookie adapter. Shared published-catalog caches use this client. [public.ts](./public.ts) · [catalog.ts](../../lib/instructions/catalog.ts)

## Side Effects

- The server `createClient` reads cookies and attempts writes through the supplied store, tolerating a write exception in a read-only Server Component context. [server.ts](./server.ts)
- The middleware `createClient` calls Supabase to verify claims and reads `profiles` for authenticated users on gated routes. It can call `is_instruction_admin` on the upload path. Its cookie adapter updates the request and response, and refreshed cookies are copied onto redirects. [middleware.ts](./middleware.ts)

## Verification

Run `npm test` from the repository root. Live auth and cookie refresh depend on the configured Supabase project.
