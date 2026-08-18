-- Flexible company lifecycle graph model and stage/resource alignment.
-- Additive and idempotent; run after migration 018.

create table if not exists public.operational_lifecycles (
  id uuid primary key default gen_random_uuid(), lineage_id uuid not null default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade, name text not null, description text,
  lifecycle_type text not null default 'linear' check(lifecycle_type in ('linear','circular','phased','nested','hybrid')),
  version integer not null default 1 check(version>0), status text not null default 'draft' check(status in ('draft','active','archived')),
  access_scope text not null default 'admins_only' check(access_scope in ('admins_only','entire_tenant','entire_company','selected_departments','selected_individuals')),
  template_key text, tier_ladder jsonb not null default '[]'::jsonb, published_at timestamptz,
  created_by uuid not null references public.profiles(id), updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(lineage_id,version)
);
create table if not exists public.lifecycle_phases (
  id uuid primary key default gen_random_uuid(), lifecycle_id uuid not null references public.operational_lifecycles(id) on delete cascade,
  name text not null, description text, sequence integer not null default 1, created_by uuid not null references public.profiles(id),
  updated_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.lifecycle_stages (
  id uuid primary key default gen_random_uuid(), lifecycle_id uuid not null references public.operational_lifecycles(id) on delete cascade,
  phase_id uuid references public.lifecycle_phases(id) on delete set null, parent_stage_id uuid references public.lifecycle_stages(id) on delete restrict,
  name text not null, stage_number text, sequence integer not null default 1, purpose text, activities jsonb not null default '[]'::jsonb,
  entry_criteria text, exit_criteria text, accountable_owner_id uuid references public.profiles(id) on delete set null,
  accountable_owner_name text, system_of_record text, success_metric text, known_gaps text, metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id), updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.lifecycle_connections (
  id uuid primary key default gen_random_uuid(), lifecycle_id uuid not null references public.operational_lifecycles(id) on delete cascade,
  from_stage_id uuid not null references public.lifecycle_stages(id) on delete cascade, to_stage_id uuid not null references public.lifecycle_stages(id) on delete cascade,
  connection_type text not null default 'next' check(connection_type in ('next','feedback','loop','conditional','nested')),
  label text, metadata jsonb not null default '{}'::jsonb, created_by uuid not null references public.profiles(id),
  updated_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(lifecycle_id,from_stage_id,to_stage_id,connection_type)
);
create table if not exists public.lifecycle_viewers (
  id uuid primary key default gen_random_uuid(), lifecycle_id uuid not null references public.operational_lifecycles(id) on delete cascade,
  viewer_type text not null check(viewer_type in ('user','department')), user_id uuid references public.profiles(id) on delete cascade,
  department text, created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
  check((viewer_type='user' and user_id is not null and department is null) or (viewer_type='department' and department is not null and user_id is null))
);
create table if not exists public.resource_lifecycle_mappings (
  id uuid primary key default gen_random_uuid(), resource_id uuid not null references public.agents(id) on delete cascade,
  lifecycle_id uuid not null references public.operational_lifecycles(id) on delete cascade, stage_id uuid not null references public.lifecycle_stages(id) on delete restrict,
  mapping_source text not null default 'creator' check(mapping_source in ('creator','deterministic_suggestion','admin')),
  alignment_status text not null default 'alignment_needs_clarification' check(alignment_status in ('aligned','partially_aligned','alignment_needs_clarification','not_currently_aligned','not_applicable')),
  confidence integer check(confidence between 0 and 100), explanation text, admin_notes text, approved_by uuid references public.profiles(id), approved_at timestamptz,
  created_by uuid not null references public.profiles(id), updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(resource_id,lifecycle_id,stage_id,mapping_source)
);

create index if not exists lifecycle_company_status_idx on public.operational_lifecycles(company_id,status,updated_at desc);
create index if not exists lifecycle_lineage_version_idx on public.operational_lifecycles(lineage_id,version desc);
create index if not exists lifecycle_access_idx on public.operational_lifecycles(access_scope,company_id,status);
create index if not exists lifecycle_phases_order_idx on public.lifecycle_phases(lifecycle_id,sequence);
create index if not exists lifecycle_stages_order_idx on public.lifecycle_stages(lifecycle_id,phase_id,sequence);
create index if not exists lifecycle_stages_parent_idx on public.lifecycle_stages(parent_stage_id);
create index if not exists lifecycle_connections_lookup_idx on public.lifecycle_connections(lifecycle_id,from_stage_id,to_stage_id);
create index if not exists lifecycle_viewers_user_idx on public.lifecycle_viewers(user_id,lifecycle_id);
create index if not exists lifecycle_viewers_department_idx on public.lifecycle_viewers(department,lifecycle_id);
create index if not exists resource_lifecycle_resource_idx on public.resource_lifecycle_mappings(resource_id,lifecycle_id);
create index if not exists resource_lifecycle_stage_idx on public.resource_lifecycle_mappings(stage_id,alignment_status);

create or replace function public.can_access_lifecycle(target_lifecycle uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.operational_lifecycles l join public.profiles p on p.id=auth.uid() and p.status='active'
    where l.id=target_lifecycle and (p.role='admin' or (l.status<>'archived' and (
      l.access_scope='entire_tenant' or (l.access_scope='entire_company' and p.company_id=l.company_id)
      or (l.access_scope='selected_individuals' and exists(select 1 from public.lifecycle_viewers v where v.lifecycle_id=l.id and v.viewer_type='user' and v.user_id=auth.uid()))
      or (l.access_scope='selected_departments' and exists(select 1 from public.lifecycle_viewers v where v.lifecycle_id=l.id and v.viewer_type='department' and lower(v.department)=lower(p.department)))
    ))));
$$;
grant execute on function public.can_access_lifecycle(uuid) to authenticated;

alter table public.operational_lifecycles enable row level security;
alter table public.lifecycle_phases enable row level security;
alter table public.lifecycle_stages enable row level security;
alter table public.lifecycle_connections enable row level security;
alter table public.lifecycle_viewers enable row level security;
alter table public.resource_lifecycle_mappings enable row level security;
grant select,insert,update,delete on public.operational_lifecycles,public.lifecycle_phases,public.lifecycle_stages,public.lifecycle_connections,public.lifecycle_viewers,public.resource_lifecycle_mappings to authenticated;

drop policy if exists "authorized read lifecycles" on public.operational_lifecycles;
create policy "authorized read lifecycles" on public.operational_lifecycles for select to authenticated using(public.can_access_lifecycle(id));
drop policy if exists "admins manage lifecycles" on public.operational_lifecycles;
create policy "admins manage lifecycles" on public.operational_lifecycles for all to authenticated using(public.is_active_admin()) with check(public.is_active_admin() and created_by is not null);
drop policy if exists "authorized read phases" on public.lifecycle_phases;
create policy "authorized read phases" on public.lifecycle_phases for select to authenticated using(public.can_access_lifecycle(lifecycle_id));
drop policy if exists "admins manage phases" on public.lifecycle_phases;
create policy "admins manage phases" on public.lifecycle_phases for all to authenticated using(public.is_active_admin()) with check(public.is_active_admin());
drop policy if exists "authorized read stages" on public.lifecycle_stages;
create policy "authorized read stages" on public.lifecycle_stages for select to authenticated using(public.can_access_lifecycle(lifecycle_id));
drop policy if exists "admins manage stages" on public.lifecycle_stages;
create policy "admins manage stages" on public.lifecycle_stages for all to authenticated using(public.is_active_admin()) with check(public.is_active_admin());
drop policy if exists "authorized read connections" on public.lifecycle_connections;
create policy "authorized read connections" on public.lifecycle_connections for select to authenticated using(public.can_access_lifecycle(lifecycle_id));
drop policy if exists "admins manage connections" on public.lifecycle_connections;
create policy "admins manage connections" on public.lifecycle_connections for all to authenticated using(public.is_active_admin()) with check(public.is_active_admin());
drop policy if exists "admins read lifecycle viewers" on public.lifecycle_viewers;
create policy "admins read lifecycle viewers" on public.lifecycle_viewers for select to authenticated using(public.is_active_admin() or user_id=auth.uid());
drop policy if exists "admins manage lifecycle viewers" on public.lifecycle_viewers;
create policy "admins manage lifecycle viewers" on public.lifecycle_viewers for all to authenticated using(public.is_active_admin()) with check(public.is_active_admin());
drop policy if exists "authorized read lifecycle mappings" on public.resource_lifecycle_mappings;
create policy "authorized read lifecycle mappings" on public.resource_lifecycle_mappings for select to authenticated using(public.can_access_agent(resource_id) and public.can_access_lifecycle(lifecycle_id));
drop policy if exists "resource managers create lifecycle mappings" on public.resource_lifecycle_mappings;
create policy "resource managers create lifecycle mappings" on public.resource_lifecycle_mappings for insert to authenticated with check(public.can_manage_agent(resource_id) and public.can_access_lifecycle(lifecycle_id) and created_by=auth.uid());
drop policy if exists "admins or resource managers update lifecycle mappings" on public.resource_lifecycle_mappings;
create policy "admins or resource managers update lifecycle mappings" on public.resource_lifecycle_mappings for update to authenticated using(public.is_active_admin() or public.can_manage_agent(resource_id)) with check(public.is_active_admin() or public.can_manage_agent(resource_id));
drop policy if exists "admins or resource managers delete lifecycle mappings" on public.resource_lifecycle_mappings;
create policy "admins or resource managers delete lifecycle mappings" on public.resource_lifecycle_mappings for delete to authenticated using(public.is_active_admin() or public.can_manage_agent(resource_id));

do $$ declare t text; begin foreach t in array array['operational_lifecycles','lifecycle_phases','lifecycle_stages','lifecycle_connections','resource_lifecycle_mappings'] loop
  execute format('drop trigger if exists %I_updated on public.%I',t,t);
  execute format('create trigger %I_updated before update on public.%I for each row execute function public.touch_updated_at()',t,t);
end loop; end $$;
notify pgrst, 'reload schema';
