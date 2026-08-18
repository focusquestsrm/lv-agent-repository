-- The Hub resource metadata, deterministic classification, stewardship, and duplicate review.
-- Additive and idempotent; run after migration 017. Never rerun schema.sql.

alter table public.profiles add column if not exists department text;
alter table public.agents
  add column if not exists logo_url text,
  add column if not exists purpose text,
  add column if not exists original_creator text,
  add column if not exists contribution_notes text,
  add column if not exists use_audience text not null default 'internal',
  add column if not exists commercial_status text not null default 'internal_only',
  add column if not exists intended_users text,
  add column if not exists hosted_url text,
  add column if not exists alternate_urls text[] not null default '{}'::text[],
  add column if not exists hosting_environment text,
  add column if not exists company_controlled_hosting boolean,
  add column if not exists admin_control_confirmed boolean,
  add column if not exists integrations text[] not null default '{}'::text[],
  add column if not exists related_resource_ids uuid[] not null default '{}'::uuid[],
  add column if not exists review_date date,
  add column if not exists stewardship_status text not null default 'ownership_needs_verification',
  add column if not exists normalized_url text,
  add column if not exists classification_path text,
  add column if not exists classification_override_reason text,
  add column if not exists updated_by uuid references public.profiles(id);

do $$ begin
  if not exists(select 1 from pg_constraint where conname='agents_use_audience_check') then
    alter table public.agents add constraint agents_use_audience_check check(use_audience in ('internal','external','both'));
  end if;
  if not exists(select 1 from pg_constraint where conname='agents_commercial_status_check') then
    alter table public.agents add constraint agents_commercial_status_check check(commercial_status in ('internal_only','potentially_sellable','commercial'));
  end if;
  if not exists(select 1 from pg_constraint where conname='agents_stewardship_status_check') then
    alter table public.agents add constraint agents_stewardship_status_check check(stewardship_status in ('verified_company_controlled','migration_needed','ownership_needs_verification','hosting_needs_verification'));
  end if;
end $$;

create or replace function public.normalize_resource_url(value text)
returns text language plpgsql immutable as $$
declare cleaned text;
begin
  if value is null or trim(value)='' then return null; end if;
  cleaned:=lower(trim(value));
  cleaned:=regexp_replace(cleaned,'^https?://','');
  cleaned:=regexp_replace(cleaned,'^www\.','');
  cleaned:=regexp_replace(cleaned,'[?#](utm_[^&]+|gclid=[^&]+|fbclid=[^&]+|ref=[^&]+).*$','','i');
  cleaned:=regexp_replace(cleaned,'/+$','');
  return cleaned;
end $$;

create or replace function public.set_resource_normalized_url()
returns trigger language plpgsql as $$ begin
  new.normalized_url:=public.normalize_resource_url(coalesce(new.hosted_url,new.url));
  new.updated_by:=coalesce(auth.uid(),new.updated_by,new.created_by);
  return new;
end $$;
drop trigger if exists set_resource_normalized_url on public.agents;
create trigger set_resource_normalized_url before insert or update of hosted_url,url on public.agents for each row execute function public.set_resource_normalized_url();
update public.agents set normalized_url=public.normalize_resource_url(coalesce(hosted_url,url)) where normalized_url is null;

create table if not exists public.resource_companies (
  resource_id uuid not null references public.agents(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  relationship text not null default 'shared_with' check(relationship in ('owner','shared_with','used_by')),
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
  primary key(resource_id,company_id)
);
create table if not exists public.resource_classification_assessments (
  id uuid primary key default gen_random_uuid(), resource_id uuid references public.agents(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  recommended_classification text not null check(recommended_classification in ('citizen_development','shared_internal','platform')),
  accepted_classification text check(accepted_classification in ('citizen_development','shared_internal','platform')),
  override_explanation text, technical_support_recommended boolean not null default false,
  explanation text, next_steps jsonb not null default '[]'::jsonb, governance_considerations jsonb not null default '[]'::jsonb,
  created_by uuid not null references public.profiles(id), updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.resource_duplicate_matches (
  id uuid primary key default gen_random_uuid(), resource_id uuid not null references public.agents(id) on delete cascade,
  matching_resource_id uuid not null references public.agents(id) on delete cascade,
  match_type text not null check(match_type in ('exact_url','same_host','related_subdomain','description','capability','lifecycle')),
  similarity_score integer not null check(similarity_score between 0 and 100), reasons jsonb not null default '[]'::jsonb,
  normalized_url text, status text not null default 'pending' check(status in ('pending','confirmed_distinct','consolidation_requested','dismissed','merged')),
  creator_resolution text, creator_justification text, admin_notes text,
  created_by uuid not null references public.profiles(id), reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(resource_id,matching_resource_id,match_type)
);
create table if not exists public.resource_stewardship_reviews (
  id uuid primary key default gen_random_uuid(), resource_id uuid not null references public.agents(id) on delete cascade,
  status text not null check(status in ('verified_company_controlled','migration_needed','ownership_needs_verification','hosting_needs_verification')),
  company_controlled_hosting boolean, administrative_control boolean, notes text, review_date date,
  created_by uuid not null references public.profiles(id), updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create index if not exists agents_normalized_url_idx on public.agents(normalized_url);
create index if not exists agents_stewardship_idx on public.agents(stewardship_status,company_id);
create index if not exists resource_companies_company_idx on public.resource_companies(company_id,resource_id);
create index if not exists resource_duplicates_queue_idx on public.resource_duplicate_matches(status,similarity_score desc,created_at desc);
create index if not exists resource_duplicates_resource_idx on public.resource_duplicate_matches(resource_id,matching_resource_id);
create index if not exists resource_classification_resource_idx on public.resource_classification_assessments(resource_id,created_at desc);
create index if not exists resource_stewardship_resource_idx on public.resource_stewardship_reviews(resource_id,created_at desc);

alter table public.resource_companies enable row level security;
alter table public.resource_classification_assessments enable row level security;
alter table public.resource_duplicate_matches enable row level security;
alter table public.resource_stewardship_reviews enable row level security;
grant select,insert,update,delete on public.resource_companies,public.resource_classification_assessments,public.resource_duplicate_matches,public.resource_stewardship_reviews to authenticated;

drop policy if exists "authorized read resource companies" on public.resource_companies;
create policy "authorized read resource companies" on public.resource_companies for select to authenticated using(public.can_access_agent(resource_id));
drop policy if exists "managers manage resource companies" on public.resource_companies;
create policy "managers manage resource companies" on public.resource_companies for all to authenticated using(public.can_manage_agent(resource_id)) with check(public.can_manage_agent(resource_id) and created_by=auth.uid());
drop policy if exists "managers manage classifications" on public.resource_classification_assessments;
create policy "managers manage classifications" on public.resource_classification_assessments for all to authenticated using(resource_id is null or public.can_manage_agent(resource_id)) with check(created_by=auth.uid() and (resource_id is null or public.can_manage_agent(resource_id)));
drop policy if exists "authorized read duplicate matches" on public.resource_duplicate_matches;
create policy "authorized read duplicate matches" on public.resource_duplicate_matches for select to authenticated using(public.is_active_admin() or public.can_manage_agent(resource_id));
drop policy if exists "managers create duplicate matches" on public.resource_duplicate_matches;
create policy "managers create duplicate matches" on public.resource_duplicate_matches for insert to authenticated with check(created_by=auth.uid() and public.can_manage_agent(resource_id));
drop policy if exists "admins update duplicate matches" on public.resource_duplicate_matches;
create policy "admins update duplicate matches" on public.resource_duplicate_matches for update to authenticated using(public.is_active_admin() or public.can_manage_agent(resource_id)) with check(public.is_active_admin() or public.can_manage_agent(resource_id));
drop policy if exists "authorized read stewardship" on public.resource_stewardship_reviews;
create policy "authorized read stewardship" on public.resource_stewardship_reviews for select to authenticated using(public.can_access_agent(resource_id));
drop policy if exists "managers manage stewardship" on public.resource_stewardship_reviews;
create policy "managers manage stewardship" on public.resource_stewardship_reviews for all to authenticated using(public.can_manage_agent(resource_id)) with check(public.can_manage_agent(resource_id));

drop trigger if exists resource_classification_updated on public.resource_classification_assessments;
create trigger resource_classification_updated before update on public.resource_classification_assessments for each row execute function public.touch_updated_at();
drop trigger if exists resource_duplicate_updated on public.resource_duplicate_matches;
create trigger resource_duplicate_updated before update on public.resource_duplicate_matches for each row execute function public.touch_updated_at();
drop trigger if exists resource_stewardship_updated on public.resource_stewardship_reviews;
create trigger resource_stewardship_updated before update on public.resource_stewardship_reviews for each row execute function public.touch_updated_at();
notify pgrst, 'reload schema';
