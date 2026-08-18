-- Auditable, resumable Start Here guidance and linked registration drafts.
create table if not exists public.start_here_assessments (
  id uuid primary key default gen_random_uuid(), tenant_key text not null default 'lead-ventures', user_id uuid not null references public.profiles(id), company_id uuid references public.companies(id),
  working_name text not null default '', business_problem text not null default '', capabilities text not null default '', intended_users text not null default '',
  individual_use_response text check (individual_use_response in ('no','unsure','yes')), multi_user_response text check (multi_user_response in ('no','unsure','yes')),
  shared_data_response text check (shared_data_response in ('no','unsure','yes')), technical_dependency_response text check (technical_dependency_response in ('no','unsure','yes')),
  external_user_response text check (external_user_response in ('no','unsure','yes')), commercial_intent_response text check (commercial_intent_response in ('no','unsure','yes')),
  business_impact_response text check (business_impact_response in ('no','unsure','yes')), support_response text check (support_response in ('no','unsure','yes')),
  recommended_development_path text, recommended_resource_type text, recommendation_explanation text, recommendation_factors text[] not null default '{}', rule_version text,
  override_classification text, override_explanation text, status text not null default 'in_progress' check (status in ('in_progress','completed','converted_to_registration_draft','registered','abandoned','archived')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.resource_registration_drafts (
  id uuid primary key default gen_random_uuid(), assessment_id uuid not null references public.start_here_assessments(id), user_id uuid not null references public.profiles(id),
  tenant_key text not null default 'lead-ventures', company_id uuid references public.companies(id), draft_form_data jsonb not null default '{}', populated_fields text[] not null default '{}',
  recommended_resource_type text, selected_resource_type text, status text not null default 'draft' check (status in ('draft','ready_for_submission','submitted','abandoned')),
  last_saved_at timestamptz not null default now(), submitted_resource_id uuid references public.agents(id), created_at timestamptz not null default now(), unique(assessment_id)
);

create table if not exists public.admin_awareness_notifications (
  id uuid primary key default gen_random_uuid(), tenant_key text not null default 'lead-ventures', user_id uuid not null references public.profiles(id),
  target_user_ids uuid[] not null default '{}', assessment_id uuid references public.start_here_assessments(id), draft_id uuid references public.resource_registration_drafts(id), resource_id uuid references public.agents(id),
  working_name text not null, company_id uuid references public.companies(id), recommended_classification text not null, primary_factors text[] not null default '{}', technical_support_expected boolean not null default false,
  status text not null default 'unread' check (status in ('unread','read','archived')), created_at timestamptz not null default now()
);

alter table public.agents add column if not exists start_here_assessment_id uuid references public.start_here_assessments(id);
alter table public.agents add column if not exists registration_draft_id uuid references public.resource_registration_drafts(id);
alter table public.agents add column if not exists development_path text;
alter table public.agents add column if not exists data_classification text;
alter table public.agents add column if not exists technical_dependencies text;
alter table public.agents add column if not exists business_criticality text;
alter table public.agents add column if not exists support_model text;
create index if not exists start_here_user_status_idx on public.start_here_assessments(user_id,status,updated_at desc);
create index if not exists registration_drafts_user_status_idx on public.resource_registration_drafts(user_id,status,last_saved_at desc);
create index if not exists awareness_targets_idx on public.admin_awareness_notifications using gin(target_user_ids);
create unique index if not exists awareness_one_per_assessment_idx on public.admin_awareness_notifications(assessment_id) where assessment_id is not null;

alter table public.start_here_assessments enable row level security;
alter table public.resource_registration_drafts enable row level security;
alter table public.admin_awareness_notifications enable row level security;

drop policy if exists "owners and tenant admins read assessments" on public.start_here_assessments;
create policy "owners and tenant admins read assessments" on public.start_here_assessments for select to authenticated using (tenant_key='lead-ventures' and (user_id=auth.uid() or public.is_active_admin()));
drop policy if exists "owners create assessments" on public.start_here_assessments;
create policy "owners create assessments" on public.start_here_assessments for insert to authenticated with check (tenant_key='lead-ventures' and user_id=auth.uid());
drop policy if exists "owners update active assessments" on public.start_here_assessments;
create policy "owners update active assessments" on public.start_here_assessments for update to authenticated using (tenant_key='lead-ventures' and (user_id=auth.uid() or public.is_active_admin())) with check (tenant_key='lead-ventures' and (user_id=auth.uid() or public.is_active_admin()));
drop policy if exists "owners delete abandoned assessments" on public.start_here_assessments;
create policy "owners delete abandoned assessments" on public.start_here_assessments for delete to authenticated using (tenant_key='lead-ventures' and user_id=auth.uid() and status in ('abandoned','archived'));

drop policy if exists "owners and tenant admins read registration drafts" on public.resource_registration_drafts;
create policy "owners and tenant admins read registration drafts" on public.resource_registration_drafts for select to authenticated using (tenant_key='lead-ventures' and (user_id=auth.uid() or public.is_active_admin()));
drop policy if exists "owners create registration drafts" on public.resource_registration_drafts;
create policy "owners create registration drafts" on public.resource_registration_drafts for insert to authenticated with check (tenant_key='lead-ventures' and user_id=auth.uid());
drop policy if exists "owners update registration drafts" on public.resource_registration_drafts;
create policy "owners update registration drafts" on public.resource_registration_drafts for update to authenticated using (tenant_key='lead-ventures' and (user_id=auth.uid() or public.is_active_admin())) with check (tenant_key='lead-ventures' and (user_id=auth.uid() or public.is_active_admin()));
drop policy if exists "owners delete abandoned registration drafts" on public.resource_registration_drafts;
create policy "owners delete abandoned registration drafts" on public.resource_registration_drafts for delete to authenticated using (tenant_key='lead-ventures' and user_id=auth.uid() and status='abandoned');

drop policy if exists "notification recipients read awareness" on public.admin_awareness_notifications;
create policy "notification recipients read awareness" on public.admin_awareness_notifications for select to authenticated using (tenant_key='lead-ventures' and (auth.uid()=any(target_user_ids) or user_id=auth.uid() or public.is_active_admin()));
drop policy if exists "notification recipients update awareness" on public.admin_awareness_notifications;
create policy "notification recipients update awareness" on public.admin_awareness_notifications for update to authenticated using (tenant_key='lead-ventures' and (user_id=auth.uid() or auth.uid()=any(target_user_ids) or public.is_active_admin())) with check (tenant_key='lead-ventures' and (user_id=auth.uid() or auth.uid()=any(target_user_ids) or public.is_active_admin()));

create or replace function public.convert_start_here_to_registration_draft(target_assessment uuid, target_form_data jsonb, target_selected_type text)
returns uuid language plpgsql security definer set search_path=public as $$
declare item public.start_here_assessments%rowtype; draft_id uuid; admin_ids uuid[];
begin
  select * into item from public.start_here_assessments where id=target_assessment and user_id=auth.uid() and tenant_key='lead-ventures' for update;
  if not found then raise exception 'Assessment was not found or is not owned by the signed-in user.'; end if;
  if item.status not in ('completed','converted_to_registration_draft') then raise exception 'Complete the assessment before creating a registration draft.'; end if;
  insert into public.resource_registration_drafts(assessment_id,user_id,tenant_key,company_id,draft_form_data,populated_fields,recommended_resource_type,selected_resource_type)
  values(item.id,item.user_id,item.tenant_key,item.company_id,target_form_data,coalesce(array(select jsonb_array_elements_text(target_form_data->'populated_from_start_here')),'{}'),item.recommended_resource_type,target_selected_type)
  on conflict(assessment_id) do update set draft_form_data=excluded.draft_form_data, populated_fields=excluded.populated_fields, selected_resource_type=excluded.selected_resource_type, last_saved_at=now()
  returning id into draft_id;
  update public.start_here_assessments set status='converted_to_registration_draft',updated_at=now() where id=item.id;
  if item.recommended_development_path='platform_product_initiative' then
    select coalesce(array_agg(id),'{}') into admin_ids from public.profiles where status='active' and role='admin' and (lower(coalesce(full_name,'')) like '%sean%' or lower(coalesce(full_name,'')) like '%danielle%' or lower(coalesce(email,'')) like 'sean%' or lower(coalesce(email,'')) like 'danielle%');
    insert into public.admin_awareness_notifications(tenant_key,user_id,target_user_ids,assessment_id,draft_id,working_name,company_id,recommended_classification,primary_factors,technical_support_expected)
    values(item.tenant_key,item.user_id,admin_ids,item.id,draft_id,item.working_name,item.company_id,item.recommended_development_path,item.recommendation_factors,true)
    on conflict do nothing;
  end if;
  return draft_id;
end $$;
grant execute on function public.convert_start_here_to_registration_draft(uuid,jsonb,text) to authenticated;
