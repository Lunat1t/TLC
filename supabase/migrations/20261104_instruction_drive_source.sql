-- Keep the Drive source reference for imported files so admins can spot duplicates.
alter table public.instruction_assets
  add column if not exists source_provider text,
  add column if not exists source_file_id text,
  add column if not exists source_revision text;

-- Google Drive remains the PDF origin; its assets have no Supabase Storage object.
alter table public.instruction_assets alter column object_key drop not null;

alter table public.instruction_assets
  drop constraint if exists instruction_assets_source_provider_check;
alter table public.instruction_assets
  add constraint instruction_assets_source_provider_check
  check (source_provider is null or source_provider in ('google_drive'));

create unique index if not exists instruction_assets_drive_source_unique
  on public.instruction_assets (source_provider, source_file_id)
  where source_provider is not null and source_file_id is not null;
