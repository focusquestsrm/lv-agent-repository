-- Product as a first-class Hub resource and a governed product-architecture graph.
-- Additive and idempotent; run after migration 020.

alter table public.agents drop constraint if exists agents_entry_type_check;
alter table public.agents add constraint agents_entry_type_check check(entry_type in ('agent','skillset','platform','product'));
alter table public.agents drop constraint if exists agents_commercial_status_check;
alter table public.agents add constraint agents_commercial_status_check check(commercial_status in ('internal_only','potentially_sellable','commercial','evaluating_commercial_potential','planned_commercial_product','pilot','commercially_available','retired'));
alter table public.agents drop constraint if exists agents_access_scope_check;
alter table public.agents add constraint agents_access_scope_check check(access_scope in ('owner_only','specific_people','admins_only','selected_companies','entire_team','entire_company','selected_departments','selected_individuals'));
alter table public.agents
  add column if not exists product_family text,
  add column if not exists target_market text,
  add column if not exists target_industries text[] not null default '{}'::text[],
  add column if not exists demo_url text,
  add column if not exists development_stage text,
  add column if not exists pricing_model text,
  add column if not exists documentation_links text[] not null default '{}'::text[],
  add column if not exists product_notes text,
  add column if not exists lifecycle_relationship text not null default 'not_yet_evaluated';
alter table public.resource_classification_assessments drop constraint if exists resource_classification_assessments_recommended_classification_check;
alter table public.resource_classification_assessments drop constraint if exists resource_classification_assessments_accepted_classification_check;
alter table public.resource_classification_assessments add constraint resource_classification_assessments_recommended_classification_check check(recommended_classification in ('citizen_development','shared_internal','platform','product'));
alter table public.resource_classification_assessments add constraint resource_classification_assessments_accepted_classification_check check(accepted_classification is null or accepted_classification in ('citizen_development','shared_internal','platform','product'));
do $$ begin
 if not exists(select 1 from pg_constraint where conname='agents_development_stage_check') then alter table public.agents add constraint agents_development_stage_check check(development_stage is null or development_stage in ('concept','discovery','mvp','pilot','production','scaling','retired')); end if;
 if not exists(select 1 from pg_constraint where conname='agents_lifecycle_relationship_check') then alter table public.agents add constraint agents_lifecycle_relationship_check check(lifecycle_relationship in ('mapped_to_stage','supports_multiple_stages','supports_company_generally','standalone_lead_ventures_product','not_applicable','not_yet_evaluated')); end if;
end $$;

create table if not exists public.product_relationships (
 id uuid primary key default gen_random_uuid(), product_id uuid not null references public.agents(id) on delete cascade,
 related_resource_id uuid references public.agents(id) on delete cascade, company_id uuid references public.companies(id) on delete cascade,
 lifecycle_id uuid references public.operational_lifecycles(id) on delete cascade,
 relationship_type text not null check(relationship_type in ('contains_platform','contains_agent','uses_skillset','integrates_with_product','supports_company','supports_lifecycle','powers_product','shared_component')),
 notes text, created_by uuid not null references public.profiles(id), updated_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(num_nonnulls(related_resource_id,company_id,lifecycle_id)=1)
);
create unique index if not exists product_relationship_resource_unique on public.product_relationships(product_id,related_resource_id,relationship_type) where related_resource_id is not null;
create unique index if not exists product_relationship_company_unique on public.product_relationships(product_id,company_id,relationship_type) where company_id is not null;
create unique index if not exists product_relationship_lifecycle_unique on public.product_relationships(product_id,lifecycle_id,relationship_type) where lifecycle_id is not null;
create index if not exists product_relationship_target_idx on public.product_relationships(related_resource_id,product_id);
create index if not exists agents_product_filters_idx on public.agents(entry_type,product_family,commercial_status,development_stage,company_id) where entry_type='product';

create or replace function public.validate_product_relationship()
returns trigger language plpgsql security definer set search_path=public as $$
declare creates_cycle boolean;
begin
 if not exists(select 1 from public.agents where id=new.product_id and entry_type='product') then raise exception 'The relationship source must be a Product.'; end if;
 if new.related_resource_id=new.product_id then raise exception 'A Product cannot relate to itself.'; end if;
 if new.related_resource_id is not null and new.relationship_type in ('contains_platform','contains_agent','uses_skillset','integrates_with_product','powers_product','shared_component') then
   with recursive graph(source_id,target_id) as (
     select product_id,related_resource_id from public.product_relationships where related_resource_id is not null and id<>coalesce(new.id,gen_random_uuid())
     union select g.source_id,r.related_resource_id from graph g join public.product_relationships r on r.product_id=g.target_id where r.related_resource_id is not null
   ) select exists(select 1 from graph where source_id=new.related_resource_id and target_id=new.product_id) into creates_cycle;
   if creates_cycle then raise exception 'This relationship would create a circular Product architecture.'; end if;
 end if;
 return new;
end $$;
drop trigger if exists validate_product_relationship on public.product_relationships;
create trigger validate_product_relationship before insert or update on public.product_relationships for each row execute function public.validate_product_relationship();
drop trigger if exists product_relationships_updated on public.product_relationships;
create trigger product_relationships_updated before update on public.product_relationships for each row execute function public.touch_updated_at();

alter table public.product_relationships enable row level security;
grant select,insert,update,delete on public.product_relationships to authenticated;
drop policy if exists "authorized read product relationships" on public.product_relationships;
create policy "authorized read product relationships" on public.product_relationships for select to authenticated using(public.can_access_agent(product_id) and (related_resource_id is null or public.can_access_agent(related_resource_id)) and (lifecycle_id is null or public.can_access_lifecycle(lifecycle_id)));
drop policy if exists "product managers manage relationships" on public.product_relationships;
create policy "product managers manage relationships" on public.product_relationships for all to authenticated using(public.can_manage_agent(product_id)) with check(public.can_manage_agent(product_id) and created_by=auth.uid());

-- Department-level access uses the same assignment table with a department target.
alter table public.agent_user_access add column if not exists department text;
create index if not exists agent_user_access_department_idx on public.agent_user_access(department,agent_id);
create or replace function public.can_access_agent(target_agent uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.agents agent join public.profiles viewer on viewer.id=auth.uid() and viewer.status='active' where agent.id=target_agent and (
  viewer.role='admin' or (agent.status<>'retired' and (agent.access_effective_at is null or agent.access_effective_at<=now()) and (agent.access_expires_at is null or agent.access_expires_at>=now()) and (
   agent.accountable_owner_id=auth.uid() or (agent.governance_status='cleared' and (
    agent.access_scope='entire_team' or (agent.access_scope='entire_company' and agent.company_id=viewer.company_id)
    or exists(select 1 from public.agent_user_access x where x.agent_id=agent.id and ((x.user_id=auth.uid()) or (agent.access_scope='selected_departments' and lower(x.department)=lower(viewer.department))) and (x.effective_at is null or x.effective_at<=now()) and (x.expires_at is null or x.expires_at>=now()))
    or exists(select 1 from public.agent_company_access x where x.agent_id=agent.id and x.company_id=viewer.company_id and (x.effective_at is null or x.effective_at<=now()) and (x.expires_at is null or x.expires_at>=now()))
   ))
  ))
 ));
$$;
grant execute on function public.can_access_agent(uuid) to authenticated;
notify pgrst, 'reload schema';
