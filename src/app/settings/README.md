# Workspace settings page

## Overview

Exposes workspace appearance settings and minimal account controls (nickname editing, sign-out, or sign-in).

## Interface

- `SettingsPage` at `/settings` uses `useWorkspaceSettings` for appearance changes and defaults, `WallpaperPicker` for custom backgrounds, `useAccess` for session/profile state, and `validateNickname` for display name updates. `page.tsx:SettingsPage`

## Invariants

- Appearance inputs wait for settings readiness and wallpaper work to finish.
- Back-link to `/dashboard` is hidden for `parent` and anonymous users.
- Signed-in users can update `profiles.nickname` (trimmed, 1–60 characters) and sign out; anonymous users see only the `/login` link. `page.tsx:SettingsPage`

## Side Effects

- Updates workspace appearance through `useWorkspaceSettings`.
- Updates `profiles.nickname` in Supabase for the signed-in user and refreshes `AccessProvider` state via `updateProfile`.
- Sign-out invokes `signOutFromSupabase`, replaces the route with `/login`, and refreshes the router. `page.tsx:SettingsPage`

## Verification

Run `npm test` from the repository root.
