-- Keep Drive PDFs external while recording whether the selected binary revision
-- was explicitly pinned and can be used by a launch snapshot.
alter table public.instruction_assets
  add column if not exists source_revision_verified boolean not null default false;

alter table public.instruction_assets
  drop constraint if exists instruction_assets_source_contract_check;
alter table public.instruction_assets
  add constraint instruction_assets_source_contract_check check (
    byte_size <= 100000000 and (
      (source_provider is null
        and source_file_id is null
        and source_revision is null
        and source_revision_verified = false
        and object_key is not null)
      or
      (source_provider = 'google_drive'
        and kind = 'document'
        and mime_type = 'application/pdf'
        and object_key is null
        and source_file_id is not null
        and source_revision is not null)
    )
  );

comment on column public.instruction_assets.source_revision_verified is
  'True only after the server confirms Google Drive keepForever for this exact binary revision.';
