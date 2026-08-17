-- Stage 0: requirements intake and approval before an agent can be built.
-- Run once after 004_adaptive_approval_workflow.sql.

create table if not exists public.agent_requests (
  id uuid primary key default gen_random_uuid(),
  proposed_name text not null,
  company_id uuid references public.companies(id) on delete set null,
  department text not null,
  category text not null,
  business_problem text not null,
  desired_outcome text not null,
  intended_users text not null,
  current_process text,
  success_measures text not null,
  proposed_owner text,
  agent_scope text not null default 'individual'
    check (agent_scope in ('individual','team','enterprise')),
  data_sources text,
  integrations text,
  uses_database boolean not null default false,
  uses_api boolean not null default false,
  uses_sensitive_data boolean not null default false,
  crosses_departments boolean not null default false,
  affected_areas text,
  requester_notes text,
  technical_review_required boolean not null default false,
  status text not null default 'submitted'
    check (status in ('submitted','triage','discussion_needed','changes_requested','approved','rejected','build_authorized','built')),
  requested_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.request_approvals (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.agent_requests(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  required boolean not null default true,
  review_type text not null default 'business'
    check (review_type in ('business','technical','data','security','department','advisory')),
  status text not null default 'assigned'
    check (status in ('assigned','discussion_needed','approved','changes_requested','rejected')),
  routing_reason text,
  reviewer_notes text,
  assigned_by uuid not null references public.profiles(id),
  assigned_at timestamptz not null default now(),
  decided_at timestamptz,
  unique(request_id,reviewer_id,review_type)
);

alter table public.agents add column if not exists request_id uuid unique
  references public.agent_requests(id) on delete set null;

alter table public.agent_requests enable row level security;
alter table public.request_approvals enable row level security;

create policy "authenticated read requests" on public.agent_requests
for select to authenticated using (true);
create policy "editors submit requests" on public.agent_requests
for insert to authenticated
with check (public.current_role() in ('admin','editor') and requested_by=auth.uid());
create policy "requesters revise returned requests" on public.agent_requests
for update to authenticated
using (requested_by=auth.uid() and status='changes_requested')
with check (requested_by=auth.uid() and status='submitted');
create policy "coordinators manage requests" on public.agent_requests
for update to authenticated
using (public.can_route_reviews()) with check (public.can_route_reviews());

create policy "authenticated read request approvals" on public.request_approvals
for select to authenticated using (true);
create policy "coordinators assign request reviews" on public.request_approvals
for insert to authenticated
with check (public.can_route_reviews() and assigned_by=auth.uid());
create policy "coordinators update request routing" on public.request_approvals
for update to authenticated
using (public.can_route_reviews()) with check (public.can_route_reviews());
create policy "reviewers decide request approvals" on public.request_approvals
for update to authenticated
using (
  reviewer_id=auth.uid() and public.can_approve_agent()
  and not exists (
    select 1 from public.agent_requests r
    where r.id=request_id and r.requested_by=auth.uid()
  )
)
with check (reviewer_id=auth.uid());

create or replace function public.sync_request_approval_status()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  update agent_requests
  set status=case
    when exists(select 1 from request_approvals where request_id=new.request_id and required and status='rejected') then 'rejected'
    when exists(select 1 from request_approvals where request_id=new.request_id and required and status='changes_requested') then 'changes_requested'
    when exists(select 1 from request_approvals where request_id=new.request_id and required and status='discussion_needed') then 'discussion_needed'
    when exists(select 1 from request_approvals where request_id=new.request_id and required and status<>'approved') then 'triage'
    when exists(select 1 from request_approvals where request_id=new.request_id and required) then 'approved'
    else 'triage'
  end,
  updated_at=now()
  where id=new.request_id and status not in ('build_authorized','built');
  return new;
end
$$;

create trigger request_approvals_sync
after insert or update on public.request_approvals
for each row execute procedure public.sync_request_approval_status();

create trigger requests_updated before update on public.agent_requests
for each row execute procedure public.touch_updated_at();

drop policy if exists "editors create agents" on public.agents;
create policy "editors create approved agents" on public.agents
for insert to authenticated
with check (
  public.current_role() in ('admin','editor')
  and created_by=auth.uid()
  and request_id is not null
  and exists (
    select 1 from public.agent_requests r
    where r.id=request_id and r.status='build_authorized'
  )
);

create index if not exists requests_status_idx on public.agent_requests(status,created_at desc);
create index if not exists request_approvals_reviewer_idx on public.request_approvals(reviewer_id,status);
