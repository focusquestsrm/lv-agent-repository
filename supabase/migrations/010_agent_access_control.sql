-- Personalized registry access for agents and skillsets.
-- Existing resources default to Admins Only and no records are deleted.

alter table public.agents add column if not exists accountable_owner_id uuid references public.profiles(id) on delete set null;
alter table public.agents add column if not exists access_scope text not null default 'admins_only';
alter table public.agents add column if not exists access_permission text not null default 'view';
alter table public.agents add column if not exists access_effective_at timestamptz;
alter table public.agents add column if not exists access_expires_at timestamptz;
alter table public.agents add column if not exists access_notes text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'agents_access_scope_check') then
    alter table public.agents add constraint agents_access_scope_check
      check (access_scope in ('owner_only','specific_people','admins_only','selected_companies','entire_team'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'agents_access_permission_check') then
    alter table public.agents add constraint agents_access_permission_check
      check (access_permission in ('view','use','manage'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'agents_access_dates_check') then
    alter table public.agents add constraint agents_access_dates_check
      check (access_expires_at is null or access_effective_at is null or access_expires_at >= access_effective_at);
  end if;
end $$;

update public.agents agent
set accountable_owner_id = coalesce(
  (
    select profile.id
    from public.profiles profile
    where lower(profile.email) = lower(agent.owner_name)
       or lower(profile.full_name) = lower(agent.owner_name)
    order by case when lower(profile.email) = lower(agent.owner_name) then 0 else 1 end
    limit 1
  ),
  agent.created_by
)
where accountable_owner_id is null;

create table if not exists public.agent_user_access (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission_level text not null default 'view' check (permission_level in ('view','use','manage')),
  effective_at timestamptz,
  expires_at timestamptz,
  granted_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_id, user_id),
  check (expires_at is null or effective_at is null or expires_at >= effective_at)
);

create table if not exists public.agent_company_access (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  permission_level text not null default 'view' check (permission_level in ('view','use','manage')),
  effective_at timestamptz,
  expires_at timestamptz,
  granted_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_id, company_id),
  check (expires_at is null or effective_at is null or expires_at >= effective_at)
);

create index if not exists agents_accountable_owner_idx on public.agents(accountable_owner_id);
create index if not exists agents_access_scope_idx on public.agents(access_scope);
create index if not exists agents_access_dates_idx on public.agents(access_effective_at, access_expires_at);
create index if not exists agent_user_access_user_idx on public.agent_user_access(user_id, effective_at, expires_at);
create index if not exists agent_user_access_agent_idx on public.agent_user_access(agent_id);
create index if not exists agent_company_access_company_idx on public.agent_company_access(company_id, effective_at, expires_at);
create index if not exists agent_company_access_agent_idx on public.agent_company_access(agent_id);

alter table public.agent_user_access enable row level security;
alter table public.agent_company_access enable row level security;

create or replace function public.can_access_agent(target_agent uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.agents agent
    join public.profiles viewer on viewer.id = auth.uid() and viewer.status = 'active'
    where agent.id = target_agent
      and (
        viewer.role = 'admin'
        or (
          agent.status <> 'retired'
          and (agent.access_effective_at is null or agent.access_effective_at <= now())
          and (agent.access_expires_at is null or agent.access_expires_at >= now())
          and (
            agent.access_scope = 'entire_team'
            or agent.accountable_owner_id = auth.uid()
            or exists (
              select 1 from public.agent_user_access individual_access
              where individual_access.agent_id = agent.id
                and individual_access.user_id = auth.uid()
                and (individual_access.effective_at is null or individual_access.effective_at <= now())
                and (individual_access.expires_at is null or individual_access.expires_at >= now())
            )
            or exists (
              select 1 from public.agent_company_access company_access
              where company_access.agent_id = agent.id
                and company_access.company_id = viewer.company_id
                and (company_access.effective_at is null or company_access.effective_at <= now())
                and (company_access.expires_at is null or company_access.expires_at >= now())
            )
          )
        )
      )
  );
$$;

create or replace function public.can_manage_agent(target_agent uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.agents agent
    join public.profiles viewer on viewer.id = auth.uid() and viewer.status = 'active'
    where agent.id = target_agent
      and (
        viewer.role = 'admin'
        or (
          agent.status <> 'retired'
          and (agent.access_effective_at is null or agent.access_effective_at <= now())
          and (agent.access_expires_at is null or agent.access_expires_at >= now())
          and (
            agent.accountable_owner_id = auth.uid()
            or (agent.access_scope = 'entire_team' and agent.access_permission = 'manage')
            or exists (
              select 1 from public.agent_user_access individual_access
              where individual_access.agent_id = agent.id
                and individual_access.user_id = auth.uid()
                and individual_access.permission_level = 'manage'
                and (individual_access.effective_at is null or individual_access.effective_at <= now())
                and (individual_access.expires_at is null or individual_access.expires_at >= now())
            )
            or exists (
              select 1 from public.agent_company_access company_access
              where company_access.agent_id = agent.id
                and company_access.company_id = viewer.company_id
                and company_access.permission_level = 'manage'
                and (company_access.effective_at is null or company_access.effective_at <= now())
                and (company_access.expires_at is null or company_access.expires_at >= now())
            )
          )
        )
      )
  );
$$;

grant execute on function public.can_access_agent(uuid) to authenticated;
grant execute on function public.can_manage_agent(uuid) to authenticated;

drop policy if exists "authenticated read agents" on public.agents;
create policy "authorized read agents" on public.agents for select to authenticated
using (public.can_access_agent(id));
drop policy if exists "editors create agents" on public.agents;
drop policy if exists "editors create agents and skillsets" on public.agents;
create policy "authorized create agents and skillsets" on public.agents for insert to authenticated
with check (
  (public.current_role() = 'admin' and created_by = auth.uid())
  or (
    public.current_role() = 'editor'
    and created_by = auth.uid()
    and accountable_owner_id = auth.uid()
    and access_scope = 'owner_only'
  )
);
drop policy if exists "editors update agents" on public.agents;
create policy "managers update agents" on public.agents for update to authenticated
using (public.can_manage_agent(id)) with check (public.can_manage_agent(id));

drop policy if exists "authenticated read versions" on public.prompt_versions;
create policy "authorized read versions" on public.prompt_versions for select to authenticated
using (public.can_access_agent(agent_id));
drop policy if exists "editors create versions" on public.prompt_versions;
create policy "managers create versions" on public.prompt_versions for insert to authenticated
with check (public.can_manage_agent(agent_id) and created_by = auth.uid());

drop policy if exists "authenticated read governance" on public.governance_reviews;
create policy "authorized read governance" on public.governance_reviews for select to authenticated
using (public.can_access_agent(agent_id));
drop policy if exists "editors create governance" on public.governance_reviews;
create policy "managers create governance" on public.governance_reviews for insert to authenticated
with check (public.can_manage_agent(agent_id) and reviewer_id = auth.uid());

drop policy if exists "authenticated read approval assignments" on public.approval_assignments;
create policy "authorized read approval assignments" on public.approval_assignments for select to authenticated
using (public.can_access_agent(agent_id));

drop policy if exists "authenticated read audit" on public.audit_log;
create policy "authorized read audit" on public.audit_log for select to authenticated
using (public.current_role() = 'admin' or actor_id = auth.uid());

drop policy if exists "admins manage user access" on public.agent_user_access;
create policy "admins manage user access" on public.agent_user_access for all to authenticated
using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
drop policy if exists "users read own access" on public.agent_user_access;
create policy "users read own access" on public.agent_user_access for select to authenticated
using (user_id = auth.uid() or public.current_role() = 'admin');
drop policy if exists "admins manage company access" on public.agent_company_access;
create policy "admins manage company access" on public.agent_company_access for all to authenticated
using (public.current_role() = 'admin') with check (public.current_role() = 'admin');

grant select, insert, update, delete on public.agent_user_access to authenticated;
grant select, insert, update, delete on public.agent_company_access to authenticated;

create or replace function public.protect_agent_access_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_role() <> 'admin' then
    if tg_op = 'INSERT' then
      new.accountable_owner_id := auth.uid();
      new.access_scope := 'owner_only';
      new.access_permission := 'manage';
      new.access_effective_at := null;
      new.access_expires_at := null;
      new.access_notes := null;
    elsif new.accountable_owner_id is distinct from old.accountable_owner_id
       or new.access_scope is distinct from old.access_scope
       or new.access_permission is distinct from old.access_permission
       or new.access_effective_at is distinct from old.access_effective_at
       or new.access_expires_at is distinct from old.access_expires_at
       or new.access_notes is distinct from old.access_notes then
      raise exception 'Only administrators may change resource access.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_agent_access_fields on public.agents;
create trigger protect_agent_access_fields before insert or update on public.agents
for each row execute procedure public.protect_agent_access_fields();

drop trigger if exists agent_user_access_updated on public.agent_user_access;
create trigger agent_user_access_updated before update on public.agent_user_access
for each row execute procedure public.touch_updated_at();
drop trigger if exists agent_company_access_updated on public.agent_company_access;
create trigger agent_company_access_updated before update on public.agent_company_access
for each row execute procedure public.touch_updated_at();

create or replace function public.audit_agent_access_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data record;
begin
  row_data := coalesce(new, old);
  insert into public.audit_log(actor_id, action, entity_type, entity_id, details)
  values (
    auth.uid(),
    'access_' || lower(tg_op),
    tg_table_name,
    row_data.agent_id::text,
    jsonb_build_object(
      'affected_user_id', row_data.user_id,
      'permission_level', row_data.permission_level,
      'effective_at', row_data.effective_at,
      'expires_at', row_data.expires_at,
      'previous', case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
      'new', case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
    )
  );
  return coalesce(new, old);
end;
$$;

create or replace function public.audit_agent_company_access_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data record;
begin
  row_data := coalesce(new, old);
  insert into public.audit_log(actor_id, action, entity_type, entity_id, details)
  values (
    auth.uid(),
    'access_' || lower(tg_op),
    tg_table_name,
    row_data.agent_id::text,
    jsonb_build_object(
      'affected_company_id', row_data.company_id,
      'permission_level', row_data.permission_level,
      'effective_at', row_data.effective_at,
      'expires_at', row_data.expires_at,
      'previous', case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
      'new', case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
    )
  );
  return coalesce(new, old);
end;
$$;

create or replace function public.audit_agent_scope_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_access jsonb := null;
begin
  if tg_op = 'UPDATE' then
    previous_access := jsonb_build_object('scope', old.access_scope, 'owner_id', old.accountable_owner_id, 'permission', old.access_permission, 'effective_at', old.access_effective_at, 'expires_at', old.access_expires_at, 'notes', old.access_notes);
  end if;
  if tg_op = 'INSERT'
     or new.access_scope is distinct from old.access_scope
     or new.accountable_owner_id is distinct from old.accountable_owner_id
     or new.access_permission is distinct from old.access_permission
     or new.access_effective_at is distinct from old.access_effective_at
     or new.access_expires_at is distinct from old.access_expires_at
     or new.access_notes is distinct from old.access_notes then
    insert into public.audit_log(actor_id, action, entity_type, entity_id, details)
    values (
      auth.uid(), case when tg_op = 'INSERT' then 'access_scope_created' else 'access_scope_updated' end, 'agents', new.id::text,
      jsonb_build_object(
        'previous', previous_access,
        'new', jsonb_build_object('scope', new.access_scope, 'owner_id', new.accountable_owner_id, 'permission', new.access_permission, 'effective_at', new.access_effective_at, 'expires_at', new.access_expires_at, 'notes', new.access_notes)
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists audit_agent_user_access on public.agent_user_access;
create trigger audit_agent_user_access after insert or update or delete on public.agent_user_access
for each row execute procedure public.audit_agent_access_change();
drop trigger if exists audit_agent_company_access on public.agent_company_access;
create trigger audit_agent_company_access after insert or update or delete on public.agent_company_access
for each row execute procedure public.audit_agent_company_access_change();
drop trigger if exists audit_agent_scope on public.agents;
create trigger audit_agent_scope after insert or update on public.agents
for each row execute procedure public.audit_agent_scope_change();
