-- Durable governance workflow and auditable Admin prompt-review decisions.
-- Idempotent and data-preserving; run after migration 013.

alter type public.workflow_status add value if not exists 'assessment_pending';
alter type public.workflow_status add value if not exists 'governance_review';
alter type public.workflow_status add value if not exists 'cleared';

alter table public.agents
  add column if not exists governance_status text not null default 'assessment_pending';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.agents'::regclass
      and conname = 'agents_governance_status_check'
  ) then
    alter table public.agents add constraint agents_governance_status_check
      check (governance_status in ('assessment_pending', 'cleared', 'governance_review'));
  end if;
end
$$;

-- Backfill workflow state from preserved assessment results.
update public.agents
set governance_status = case
  when governance_flagged then 'governance_review'
  when governance_checked_at is not null then 'cleared'
  else 'assessment_pending'
end
where governance_status = 'assessment_pending';

create index if not exists agents_governance_status_idx
on public.agents(governance_status, governance_flagged);

create table if not exists public.prompt_review_decisions (
  id uuid primary key default gen_random_uuid(),
  prompt_version_id uuid not null references public.prompt_versions(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  admin_id uuid not null references public.profiles(id),
  decision text not null check (decision in ('approved', 'changes_requested')),
  notes text,
  decided_at timestamptz not null default now()
);

create index if not exists prompt_review_decisions_version_idx
on public.prompt_review_decisions(prompt_version_id, decided_at desc);
create index if not exists prompt_review_decisions_agent_idx
on public.prompt_review_decisions(agent_id, decided_at desc);

alter table public.prompt_review_decisions enable row level security;

create or replace function public.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

grant execute on function public.is_active_admin() to authenticated;

-- Pending and flagged resources stay private to Admins and their accountable
-- owner. Cleared resources follow the configured audience and timing rules.
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
            agent.accountable_owner_id = auth.uid()
            or (
              agent.governance_status = 'cleared'
              and (
                agent.access_scope = 'entire_team'
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
        )
      )
  );
$$;

grant execute on function public.can_access_agent(uuid) to authenticated;

drop policy if exists "admins approve versions" on public.prompt_versions;
drop policy if exists "admins review pending versions" on public.prompt_versions;
create policy "admins review pending versions"
on public.prompt_versions
for update
to authenticated
using (
  public.is_active_admin()
  and status = 'pending'
  and public.can_access_agent(agent_id)
)
with check (
  public.is_active_admin()
  and public.can_access_agent(agent_id)
  and (
    (status = 'changes_requested' and approved_by is null)
    or (
      status = 'approved'
      and approved_by = auth.uid()
      and created_by <> auth.uid()
    )
  )
);

drop policy if exists "automated clearance publishes versions" on public.prompt_versions;
create policy "automated clearance publishes versions"
on public.prompt_versions
for update
to authenticated
using (
  status = 'pending'
  and public.can_manage_agent(agent_id)
)
with check (
  status = 'approved'
  and approved_by is null
  and exists (
    select 1 from public.agents agent
    where agent.id = agent_id
      and agent.governance_status = 'cleared'
      and agent.governance_flagged = false
  )
);

drop policy if exists "authorized read prompt decisions" on public.prompt_review_decisions;
create policy "authorized read prompt decisions"
on public.prompt_review_decisions
for select
to authenticated
using (public.can_access_agent(agent_id));

drop policy if exists "admins create prompt decisions" on public.prompt_review_decisions;
create policy "admins create prompt decisions"
on public.prompt_review_decisions
for insert
to authenticated
with check (
  public.is_active_admin()
  and admin_id = auth.uid()
  and public.can_access_agent(agent_id)
  and (
    decision = 'changes_requested'
    or not exists (
      select 1 from public.prompt_versions version
      where version.id = prompt_version_id and version.created_by = auth.uid()
    )
  )
);

grant select, insert on public.prompt_review_decisions to authenticated;

create or replace function public.audit_prompt_review_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log(actor_id, action, entity_type, entity_id, details)
  values (
    new.admin_id,
    case when new.decision = 'approved' then 'prompt_approved' else 'prompt_changes_requested' end,
    'prompt_versions',
    new.prompt_version_id::text,
    jsonb_build_object(
      'agent_id', new.agent_id,
      'decision', new.decision,
      'notes', new.notes,
      'decided_at', new.decided_at
    )
  );
  return new;
end;
$$;

drop trigger if exists audit_prompt_review_decision on public.prompt_review_decisions;
create trigger audit_prompt_review_decision
after insert on public.prompt_review_decisions
for each row execute procedure public.audit_prompt_review_decision();

create or replace function public.review_prompt_version(
  target_version uuid,
  target_decision text,
  review_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  version_row public.prompt_versions%rowtype;
begin
  if not public.is_active_admin() then
    raise exception 'Admin approval access is required.';
  end if;
  if target_decision not in ('approved', 'changes_requested') then
    raise exception 'Unsupported review decision.';
  end if;

  select * into version_row
  from public.prompt_versions
  where id = target_version
  for update;

  if not found or version_row.status <> 'pending' then
    raise exception 'This prompt is no longer pending review.';
  end if;
  if not public.can_access_agent(version_row.agent_id) then
    raise exception 'You are not authorized to govern this resource.';
  end if;
  if target_decision = 'approved' and version_row.created_by = auth.uid() then
    raise exception 'Prompt authors cannot approve their own prompt.';
  end if;

  update public.prompt_versions
  set status = target_decision::public.workflow_status,
      approved_by = case when target_decision = 'approved' then auth.uid() else null end,
      approved_at = case when target_decision = 'approved' then now() else null end
  where id = target_version;

  insert into public.prompt_review_decisions(
    prompt_version_id, agent_id, admin_id, decision, notes
  ) values (
    version_row.id, version_row.agent_id, auth.uid(), target_decision, nullif(trim(review_notes), '')
  );

  update public.agents
  set governance_flagged = target_decision <> 'approved',
      governance_status = case when target_decision = 'approved' then 'cleared' else 'governance_review' end,
      status = case
        when target_decision = 'approved' then 'approved'::public.workflow_status
        else 'changes_requested'::public.workflow_status
      end
  where id = version_row.agent_id;
end;
$$;

revoke all on function public.review_prompt_version(uuid, text, text) from public;
grant execute on function public.review_prompt_version(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
