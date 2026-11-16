# Workspace settings page

## Overview

Exposes workspace appearance, panel, clock and account controls.

## Interface

- `SettingsPage` at `/settings` uses `useWorkspaceSettings` for changes and defaults, and `WallpaperPicker` for custom backgrounds. `page.tsx:SettingsPage`

## Invariants

- Appearance, panel and clock inputs wait for settings readiness and wallpaper work to finish. The account section shows sign-out for a signed-in user and the achievement link for teachers. `page.tsx:SettingsPage`

## Side Effects

- Updates settings through the workspace settings hook. Sign-out invokes `signOutFromSupabase`, replaces the route with `/login` and refreshes the router. `page.tsx:SettingsPage`

## Verification

Run `npm test` from the repository root.
