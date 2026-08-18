-- Preserve Start Here audit records without blocking an Admin from deleting
-- an individual resource. Migration 023 introduced these nullable links with
-- the default NO ACTION behavior, which can reject deletion of a linked agent.

alter table public.resource_registration_drafts
  drop constraint if exists resource_registration_drafts_submitted_resource_id_fkey;
alter table public.resource_registration_drafts
  add constraint resource_registration_drafts_submitted_resource_id_fkey
  foreign key (submitted_resource_id) references public.agents(id) on delete set null;

alter table public.admin_awareness_notifications
  drop constraint if exists admin_awareness_notifications_resource_id_fkey;
alter table public.admin_awareness_notifications
  add constraint admin_awareness_notifications_resource_id_fkey
  foreign key (resource_id) references public.agents(id) on delete set null;

-- The constraints are replaced atomically by the migration transaction. No
-- resource, draft, assessment, or notification rows are changed during apply.

-- Rollback (only if the previous blocking behavior is intentionally restored):
-- alter table public.resource_registration_drafts drop constraint resource_registration_drafts_submitted_resource_id_fkey;
-- alter table public.resource_registration_drafts add constraint resource_registration_drafts_submitted_resource_id_fkey foreign key (submitted_resource_id) references public.agents(id);
-- alter table public.admin_awareness_notifications drop constraint admin_awareness_notifications_resource_id_fkey;
-- alter table public.admin_awareness_notifications add constraint admin_awareness_notifications_resource_id_fkey foreign key (resource_id) references public.agents(id);
