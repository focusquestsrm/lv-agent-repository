-- Keep creator-owned workflow records visible without publishing them, and
-- apply the same tenant boundary used by operational lifecycles.
alter table public.agents add column if not exists tenant_key text not null default 'lead-ventures';
create index if not exists agents_tenant_creator_status_idx on public.agents(tenant_key,created_by,status,updated_at desc);

create or replace function public.enforce_resource_tenant()
returns trigger language plpgsql security definer set search_path=public as $$
declare viewer_tenant text;
begin
  if auth.uid() is null then
    if tg_op='UPDATE' then
      new.tenant_key := coalesce(new.tenant_key, old.tenant_key, 'lead-ventures');
    else
      new.tenant_key := coalesce(new.tenant_key, 'lead-ventures');
    end if;
    return new;
  end if;
  select tenant_key into viewer_tenant from public.profiles where id=auth.uid() and status='active';
  if viewer_tenant is null then raise exception 'An active tenant profile is required.'; end if;
  new.tenant_key := viewer_tenant;
  return new;
end $$;

drop trigger if exists agents_enforce_tenant on public.agents;
create trigger agents_enforce_tenant before insert or update on public.agents
for each row execute function public.enforce_resource_tenant();

create or replace function public.can_access_agent(target_agent uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(
  select 1 from public.agents agent
  join public.profiles viewer on viewer.id=auth.uid() and viewer.status='active' and viewer.tenant_key=agent.tenant_key
  where agent.id=target_agent and (
   viewer.role='admin'
   or (
    agent.status <> 'retired'
    and (agent.created_by=auth.uid() or agent.accountable_owner_id=auth.uid()
      or (
       agent.status='approved' and agent.governance_status='cleared'
       and (agent.access_effective_at is null or agent.access_effective_at<=now())
       and (agent.access_expires_at is null or agent.access_expires_at>=now())
       and (
        agent.access_scope='entire_team'
        or (agent.access_scope='entire_company' and agent.company_id=viewer.company_id)
        or exists(select 1 from public.agent_user_access x where x.agent_id=agent.id and x.user_id=auth.uid() and (x.effective_at is null or x.effective_at<=now()) and (x.expires_at is null or x.expires_at>=now()))
        or exists(select 1 from public.agent_company_access x where x.agent_id=agent.id and x.company_id=viewer.company_id and (x.effective_at is null or x.effective_at<=now()) and (x.expires_at is null or x.expires_at>=now()))
        or exists(select 1 from public.resource_department_access x where x.resource_id=agent.id and lower(x.department)=lower(viewer.department) and (x.effective_at is null or x.effective_at<=now()) and (x.expires_at is null or x.expires_at>=now()))
       )
      )
    )
   )
  )
 );
$$;

create or replace function public.can_manage_agent(target_agent uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(
  select 1 from public.agents agent
  join public.profiles viewer on viewer.id=auth.uid() and viewer.status='active' and viewer.tenant_key=agent.tenant_key
  where agent.id=target_agent and (
   viewer.role='admin'
   or (
    agent.status <> 'retired'
    and (agent.created_by=auth.uid() or agent.accountable_owner_id=auth.uid()
      or (agent.status='approved' and agent.governance_status='cleared' and (
       (agent.access_scope='entire_team' and agent.access_permission='manage')
       or exists(select 1 from public.agent_user_access x where x.agent_id=agent.id and x.user_id=auth.uid() and x.permission_level='manage')
       or exists(select 1 from public.agent_company_access x where x.agent_id=agent.id and x.company_id=viewer.company_id and x.permission_level='manage')
       or exists(select 1 from public.resource_department_access x where x.resource_id=agent.id and lower(x.department)=lower(viewer.department) and x.permission_level='manage')
      ))
    )
   )
  )
 );
$$;

grant execute on function public.can_access_agent(uuid) to authenticated;
grant execute on function public.can_manage_agent(uuid) to authenticated;

drop policy if exists "authorized create agents and skillsets" on public.agents;
create policy "authorized create agents and skillsets" on public.agents for insert to authenticated
with check (
 created_by=auth.uid()
 and tenant_key=(select tenant_key from public.profiles where id=auth.uid() and status='active')
 and public.current_role() in ('admin','editor')
 and (public.current_role()='admin' or (accountable_owner_id=auth.uid() and access_scope='owner_only'))
);

notify pgrst, 'reload schema';
