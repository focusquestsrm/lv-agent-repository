-- Add tenant-safe, layered duplicate-review evidence without changing resource records.
alter table public.resource_duplicate_matches add column if not exists tenant_key text not null default 'lead-ventures';
alter table public.resource_duplicate_matches add column if not exists deterministic_details jsonb not null default '{}'::jsonb;
alter table public.resource_duplicate_matches add column if not exists reviewed_at timestamptz;
alter table public.resource_duplicate_matches add column if not exists ai_classification text;
alter table public.resource_duplicate_matches add column if not exists ai_confidence integer;
alter table public.resource_duplicate_matches add column if not exists ai_shared_purpose jsonb not null default '[]'::jsonb;
alter table public.resource_duplicate_matches add column if not exists ai_key_differences jsonb not null default '[]'::jsonb;
alter table public.resource_duplicate_matches add column if not exists ai_reasoning_summary text;
alter table public.resource_duplicate_matches add column if not exists ai_recommended_action text;
alter table public.resource_duplicate_matches add column if not exists ai_provider text;
alter table public.resource_duplicate_matches add column if not exists ai_model text;
alter table public.resource_duplicate_matches add column if not exists ai_reviewed_at timestamptz;

alter table public.resource_duplicate_matches drop constraint if exists resource_duplicate_matches_match_type_check;
alter table public.resource_duplicate_matches add constraint resource_duplicate_matches_match_type_check check(match_type in ('exact_url','same_host','related_subdomain','exact_name','acronym','exact_vendor','exact_platform','company_owner','description','capability','lifecycle'));
alter table public.resource_duplicate_matches drop constraint if exists resource_duplicate_matches_status_check;
alter table public.resource_duplicate_matches add constraint resource_duplicate_matches_status_check check(status in ('pending','confirmed_distinct','consolidation_requested','dismissed','merged','related','overlapping','complementary'));
alter table public.resource_duplicate_matches drop constraint if exists resource_duplicate_matches_ai_classification_check;
alter table public.resource_duplicate_matches add constraint resource_duplicate_matches_ai_classification_check check(ai_classification is null or ai_classification in ('probable_duplicate','similar','overlapping','complementary','distinct'));
alter table public.resource_duplicate_matches drop constraint if exists resource_duplicate_matches_ai_confidence_check;
alter table public.resource_duplicate_matches add constraint resource_duplicate_matches_ai_confidence_check check(ai_confidence is null or ai_confidence between 0 and 100);
alter table public.resource_duplicate_matches drop constraint if exists resource_duplicate_matches_ai_recommended_action_check;
alter table public.resource_duplicate_matches add constraint resource_duplicate_matches_ai_recommended_action_check check(ai_recommended_action is null or ai_recommended_action in ('review_for_merge','relate_resources','keep_separate','insufficient_information'));

update public.resource_duplicate_matches match set tenant_key=agent.tenant_key from public.agents agent where agent.id=match.resource_id and match.tenant_key is distinct from agent.tenant_key;

create or replace function public.enforce_duplicate_match_tenant()
returns trigger language plpgsql security definer set search_path=public as $$
declare source_tenant text; target_tenant text; viewer_tenant text;
begin
  select tenant_key into source_tenant from public.agents where id=new.resource_id;
  select tenant_key into target_tenant from public.agents where id=new.matching_resource_id;
  if source_tenant is null or target_tenant is null or source_tenant<>target_tenant then raise exception 'Duplicate candidates must belong to the same tenant.'; end if;
  if new.resource_id=new.matching_resource_id then raise exception 'A resource cannot be compared with itself.'; end if;
  if auth.uid() is not null then
    select tenant_key into viewer_tenant from public.profiles where id=auth.uid() and status='active';
    if viewer_tenant is null or viewer_tenant<>source_tenant then raise exception 'Active tenant access is required.'; end if;
  end if;
  new.tenant_key:=source_tenant;
  return new;
end $$;

drop trigger if exists duplicate_match_enforce_tenant on public.resource_duplicate_matches;
create trigger duplicate_match_enforce_tenant before insert or update on public.resource_duplicate_matches for each row execute function public.enforce_duplicate_match_tenant();
create index if not exists resource_duplicate_tenant_queue_idx on public.resource_duplicate_matches(tenant_key,status,similarity_score desc,created_at desc);

create table if not exists public.resource_similarity_relationships (
  id uuid primary key default gen_random_uuid(), tenant_key text not null default 'lead-ventures',
  source_resource_id uuid not null references public.agents(id) on delete cascade,
  target_resource_id uuid not null references public.agents(id) on delete cascade,
  relationship_type text not null check(relationship_type in ('related','overlapping','complementary')),
  notes text, created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
  check(source_resource_id<>target_resource_id)
);
create unique index if not exists resource_similarity_relationship_unique on public.resource_similarity_relationships(tenant_key,least(source_resource_id,target_resource_id),greatest(source_resource_id,target_resource_id),relationship_type);
create index if not exists resource_similarity_relationship_tenant_idx on public.resource_similarity_relationships(tenant_key,created_at desc);

create or replace function public.enforce_similarity_relationship_tenant()
returns trigger language plpgsql security definer set search_path=public as $$
declare source_tenant text; target_tenant text; viewer_tenant text;
begin
  select tenant_key into source_tenant from public.agents where id=new.source_resource_id;
  select tenant_key into target_tenant from public.agents where id=new.target_resource_id;
  select tenant_key into viewer_tenant from public.profiles where id=auth.uid() and status='active' and role='admin';
  if source_tenant is null or source_tenant<>target_tenant or viewer_tenant is null or viewer_tenant<>source_tenant then raise exception 'Active Admin access in the resource tenant is required.'; end if;
  new.tenant_key:=source_tenant;
  return new;
end $$;
drop trigger if exists similarity_relationship_enforce_tenant on public.resource_similarity_relationships;
create trigger similarity_relationship_enforce_tenant before insert or update on public.resource_similarity_relationships for each row execute function public.enforce_similarity_relationship_tenant();

alter table public.resource_similarity_relationships enable row level security;
grant select,insert,update,delete on public.resource_similarity_relationships to authenticated;

drop policy if exists "authorized read duplicate matches" on public.resource_duplicate_matches;
create policy "authorized read duplicate matches" on public.resource_duplicate_matches for select to authenticated using(exists(select 1 from public.profiles profile where profile.id=auth.uid() and profile.status='active' and profile.role='admin' and profile.tenant_key=resource_duplicate_matches.tenant_key));
drop policy if exists "managers create duplicate matches" on public.resource_duplicate_matches;
create policy "managers create duplicate matches" on public.resource_duplicate_matches for insert to authenticated with check(created_by=auth.uid() and public.can_manage_agent(resource_id) and public.can_access_agent(matching_resource_id));
drop policy if exists "admins update duplicate matches" on public.resource_duplicate_matches;
create policy "admins update duplicate matches" on public.resource_duplicate_matches for update to authenticated using(exists(select 1 from public.profiles profile where profile.id=auth.uid() and profile.status='active' and profile.role='admin' and profile.tenant_key=resource_duplicate_matches.tenant_key)) with check(exists(select 1 from public.profiles profile where profile.id=auth.uid() and profile.status='active' and profile.role='admin' and profile.tenant_key=resource_duplicate_matches.tenant_key));

create policy "tenant admins read similarity relationships" on public.resource_similarity_relationships for select to authenticated using(exists(select 1 from public.profiles profile where profile.id=auth.uid() and profile.status='active' and profile.role='admin' and profile.tenant_key=resource_similarity_relationships.tenant_key));
create policy "tenant admins create similarity relationships" on public.resource_similarity_relationships for insert to authenticated with check(created_by=auth.uid() and exists(select 1 from public.profiles profile where profile.id=auth.uid() and profile.status='active' and profile.role='admin' and profile.tenant_key=resource_similarity_relationships.tenant_key));
create policy "tenant admins update similarity relationships" on public.resource_similarity_relationships for update to authenticated using(exists(select 1 from public.profiles profile where profile.id=auth.uid() and profile.status='active' and profile.role='admin' and profile.tenant_key=resource_similarity_relationships.tenant_key)) with check(exists(select 1 from public.profiles profile where profile.id=auth.uid() and profile.status='active' and profile.role='admin' and profile.tenant_key=resource_similarity_relationships.tenant_key));
create policy "tenant admins delete similarity relationships" on public.resource_similarity_relationships for delete to authenticated using(exists(select 1 from public.profiles profile where profile.id=auth.uid() and profile.status='active' and profile.role='admin' and profile.tenant_key=resource_similarity_relationships.tenant_key));

notify pgrst, 'reload schema';
