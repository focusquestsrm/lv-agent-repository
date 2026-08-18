-- Department-scoped resource access for Products and all other Hub resources.
-- Additive and idempotent; run after migration 021.
create table if not exists public.resource_department_access (
 id uuid primary key default gen_random_uuid(), resource_id uuid not null references public.agents(id) on delete cascade,
 department text not null, permission_level text not null default 'view' check(permission_level in ('view','use','manage')),
 effective_at timestamptz, expires_at timestamptz, granted_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(resource_id,department)
);
create index if not exists resource_department_access_lookup_idx on public.resource_department_access(department,resource_id);
alter table public.resource_department_access enable row level security;
grant select,insert,update,delete on public.resource_department_access to authenticated;
drop policy if exists "users read matching department access" on public.resource_department_access;
create policy "users read matching department access" on public.resource_department_access for select to authenticated using(public.is_active_admin() or lower(department)=lower((select p.department from public.profiles p where p.id=auth.uid())));
drop policy if exists "admins manage department access" on public.resource_department_access;
create policy "admins manage department access" on public.resource_department_access for all to authenticated using(public.is_active_admin()) with check(public.is_active_admin());
drop trigger if exists resource_department_access_updated on public.resource_department_access;
create trigger resource_department_access_updated before update on public.resource_department_access for each row execute function public.touch_updated_at();

create or replace function public.can_access_agent(target_agent uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.agents agent join public.profiles viewer on viewer.id=auth.uid() and viewer.status='active' where agent.id=target_agent and (
  viewer.role='admin' or (agent.status<>'retired' and (agent.access_effective_at is null or agent.access_effective_at<=now()) and (agent.access_expires_at is null or agent.access_expires_at>=now()) and (
   agent.accountable_owner_id=auth.uid() or (agent.governance_status='cleared' and (
    agent.access_scope='entire_team' or (agent.access_scope='entire_company' and agent.company_id=viewer.company_id)
    or exists(select 1 from public.agent_user_access x where x.agent_id=agent.id and x.user_id=auth.uid() and (x.effective_at is null or x.effective_at<=now()) and (x.expires_at is null or x.expires_at>=now()))
    or exists(select 1 from public.agent_company_access x where x.agent_id=agent.id and x.company_id=viewer.company_id and (x.effective_at is null or x.effective_at<=now()) and (x.expires_at is null or x.expires_at>=now()))
    or exists(select 1 from public.resource_department_access x where x.resource_id=agent.id and lower(x.department)=lower(viewer.department) and (x.effective_at is null or x.effective_at<=now()) and (x.expires_at is null or x.expires_at>=now()))
   ))
  ))
 ));
$$;
grant execute on function public.can_access_agent(uuid) to authenticated;
notify pgrst, 'reload schema';
