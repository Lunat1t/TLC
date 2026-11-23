# TLC database migrations

## Overview

Migrations extend the base profile schema and define the instruction library, account onboarding and family links, achievement awards, and workspace storage.

## Interface

- [`instructions`, `instruction_assets`, and `instruction_steps`](./20261030_instruction_catalog.sql) store published cards and their assets. [`search_instruction_cards()` and `published_instruction_drive_file()`](./20261107120000_admin_instruction_card_edit.sql) query published cards and their current Drive documents.
- [`complete_tlc_onboarding()`](./20261106115152_onboarding_multi_directions.sql) records account setup. [`link_student_by_qr()` and `my_family_links()`](./20261105_parent_student_links.sql) manage and read parent and student relationships.
- [`award_mix_match_achievement()` and `set_my_mix_match_accessory()`](./20261106130000_mix_match_student_achievements.sql) record competition awards and accessory equipment.
- [`account_workspace` and `save_workspace_section()`](./20261110160000_account_workspace.sql) store settings, layout, and board data by account.

## Invariants

- [`instruction_slug_guard`](./20261030_instruction_catalog.sql) preserves the slug of a published or archived card. [`instruction_assets_one_current_document`](./20261107120000_admin_instruction_card_edit.sql) permits at most one current document per card.
- [`workspace_owner` and `save_workspace_section()`](./20261110160000_account_workspace.sql) scope workspace data to the current account. The save function returns `-1` if the supplied revision no longer matches.

## Side Effects

- [`publish_drive_instruction()`](./20261107120000_admin_instruction_card_edit.sql) inserts a published instruction, attaches its cover, and records its Drive document.
- [`award_mix_match_achievement()`](./20261106130000_mix_match_student_achievements.sql) writes an award for the selected student. [`save_workspace_section()`](./20261110160000_account_workspace.sql) inserts or updates the user's workspace section.

## Verification

The instructions below cover the original library rollout. Use the SQL migrations and the test project's applied history to determine which later account and library migrations it needs. Run `npm test` for the repository suite.

## Retained learning records

The already-applied [learning migration](./20261111080518_tlc_learning.sql) remains in the database history. The student roadmap, seasonal Battle Pass, ticket shop, and related wardrobe controls have been removed from the website. Its private tables are retained to avoid deleting any stored records; do not apply a destructive rollback without a separate data-retention decision.

Use a separate, non-production Supabase project for first application and checks. Apply `supabase/schema.sql` first if the project does not already have the TLC `profiles` table and Auth trigger. On an existing project, inspect its `profiles` policies and table definitions before applying any feature migration.

For a fresh test project, apply `supabase/schema.sql`, then the available SQL files in this order: `20261030_instruction_admins.sql`, `20261030_instruction_catalog.sql`, `20261030_instruction_storage.sql`, `20261104_instruction_drive_source.sql`, `20261105_security_cleanup.sql`, `20261105_instruction_admin_acl.sql`, `20261105_instruction_drive_revisions.sql`, and `20261105_instruction_drive_download.sql`. The profile policy grants authenticated users access only to their own profile; the admin migration adds trusted admin reads before any roster is exposed. The cleanup migrations remove the duplicate self-read policy, prevent direct Data API execution of the profile trigger function, and restrict the admin-check function to authenticated/service roles. The final migration exposes only a `has_pdf` flag on published catalog entries; the download route resolves the Drive file ID server-side.

The `instruction-assets` bucket is private and accepts images only. Covers are stored in Supabase Storage. The public catalog reads covers attached to published instructions. PDFs stay in Google Drive, and Supabase stores their metadata and file IDs. TLC checks Drive access before publishing. The download route redirects to Drive, while the in-app reader requests the document through its own route. Apply each migration once and record the version.

Never place a service-role key in browser code. The web app uses the existing publishable key and verified user session. Trusted `security definer` functions must check `auth.uid()` and the active Auth session before reading or writing protected rows. See `specs/001-instruction-library/quickstart.md` for the validation sequence.

For public-link publication apply `20261105_instruction_drive_link_publish.sql`, then `20261105_existing_profile_backfill.sql` to restore profiles for pre-existing Auth users. The teacher link form and public download route require only the Supabase URL/publishable key, with no Google service-account credentials.

## Subscriptions, schools, and Solo checks

Apply [20261123190000_subscriptions_and_schools.sql](./20261123190000_subscriptions_and_schools.sql) to add the `tlc_billing` schema (`solo`, `school_mini`, `school_pro`), invite codes, org-scoped teacher roadmap permissions, `get_effective_entitlements`, `complete_solo_card`, and `public.tlc_billing_apply_event` (`service_role` only).
