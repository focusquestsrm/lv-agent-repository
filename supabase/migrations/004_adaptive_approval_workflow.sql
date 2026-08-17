-- Adaptive, multi-reviewer agent approval workflow.
-- Run once after 003_companies_dashboard.sql.

alter table public.profiles add column if not exists can_assign_reviews boolean not null default false;
alter table public.profiles add column if not exists can_approve_agents boolean not null default false;

alter table public.agents add column if not exists agent_scope text not null default 'individual'
  check (agent_scope in ('individual','team','enterprise'));
alter table public.agents add column if not exists category text;
alter table public.agents add column if not exists department text;
alter table public.agents add column if not exists uses_database boolean not null default false;
alter table public.agents add column if not exists uses_api boolean not null default false;
alter table public.agents add column if not exists uses_sensitive_data boolean not null default false;
alter table public.agents add column if not exists crosses_departments boolean not null default false;
alter table public.agents add column if not exists technical_review_required boolean not null default false;
alter table public.agents add column if not exists routing_notes text;

create table if not exists public.approval_assignments (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  required boolean not null default true,
  status text not null default 'assigned'
    check (status in ('assigned','discussion_needed','approved','changes_requested')),
  routing_reason text,
  reviewer_notes text,
  assigned_by uuid not null references public.profiles(id),
  assigned_at timestamptz not null default now(),
  decided_at timestamptz,
  unique(agent_id, reviewer_id)
);

alter table public.approval_assignments enable row level security;

create or replace function public.can_route_reviews()
returns boolean language sql stable security definer set search_path=public
as $$
  select exists(
    select 1 from profiles
    where id=auth.uid() and (role='admin' or can_assign_reviews=true)
  )
$$;

create or replace function public.can_approve_agent()
returns boolean language sql stable security definer set search_path=public
as $$
  select exists(
    select 1 from profiles
    where id=auth.uid() and (role='admin' or can_approve_agents=true)
  )
$$;

drop policy if exists "authenticated read approval assignments" on public.approval_assignments;
create policy "authenticated read approval assignments" on public.approval_assignments
for select to authenticated using (true);

drop policy if exists "coordinators assign reviews" on public.approval_assignments;
create policy "coordinators assign reviews" on public.approval_assignments
for insert to authenticated
with check (public.can_route_reviews() and assigned_by=auth.uid());

drop policy if exists "coordinators update routing" on public.approval_assignments;
create policy "coordinators update routing" on public.approval_assignments
for update to authenticated
using (public.can_route_reviews())
with check (public.can_route_reviews());

drop policy if exists "reviewers decide assignments" on public.approval_assignments;
create policy "reviewers decide assignments" on public.approval_assignments
for update to authenticated
using (
  reviewer_id=auth.uid()
  and public.can_approve_agent()
  and not exists (
    select 1 from public.agents a
    where a.id=agent_id and a.created_by=auth.uid()
  )
)
with check (reviewer_id=auth.uid());

create or replace function public.sync_agent_approval_status()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  update agents
  set status = case
    when exists (
      select 1 from approval_assignments
      where agent_id=new.agent_id and required and status='changes_requested'
    ) then 'changes_requested'::workflow_status
    when exists (
      select 1 from approval_assignments
      where agent_id=new.agent_id and required and status<>'approved'
    ) then 'pending'::workflow_status
    when exists (
      select 1 from approval_assignments
      where agent_id=new.agent_id and required
    ) then 'approved'::workflow_status
    else 'pending'::workflow_status
  end
  where id=new.agent_id;
  return new;
end
$$;

drop trigger if exists sync_agent_approval_status on public.approval_assignments;
create trigger sync_agent_approval_status
after insert or update on public.approval_assignments
for each row execute procedure public.sync_agent_approval_status();

create index if not exists approval_agent_idx on public.approval_assignments(agent_id);
create index if not exists approval_reviewer_idx on public.approval_assignments(reviewer_id, status);

-- Preserve the designated Lead Ventures administrator's approval authority.
update public.profiles
set can_assign_reviews=true, can_approve_agents=true
where lower(email)='danielle@focusquest.com';
