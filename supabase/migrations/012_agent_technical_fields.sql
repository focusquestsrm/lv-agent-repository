-- Restore technical assessment fields required by the current resource form.
-- These columns originally lived in retired migration 004, which existing
-- installations are intentionally instructed to skip. No records are changed.

alter table public.agents
  add column if not exists uses_database boolean not null default false,
  add column if not exists uses_api boolean not null default false,
  add column if not exists uses_sensitive_data boolean not null default false,
  add column if not exists crosses_departments boolean not null default false;

-- Ask PostgREST to recognize the new columns immediately.
notify pgrst, 'reload schema';
