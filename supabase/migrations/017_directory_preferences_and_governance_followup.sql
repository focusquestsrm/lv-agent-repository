-- Directory preferences and current-assessment follow-up support.
-- Idempotent and data-preserving; run after migration 016. Never rerun schema.sql.

create table if not exists public.user_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  preference_key text not null,
  preference_value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, preference_key)
);

create table if not exists public.governance_assessment_drafts (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  questionnaire_version text not null,
  trigger_responses jsonb not null default '{}'::jsonb,
  likert_responses jsonb not null default '{}'::jsonb,
  explanations jsonb not null default '{}'::jsonb,
  not_applicable_justifications jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (agent_id, owner_id, questionnaire_version)
);

create table if not exists public.governance_assessment_requests (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  requested_by uuid not null references auth.users(id),
  due_at timestamptz,
  status text not null default 'pending' check (status in ('pending','completed','cancelled')),
  legacy_resource boolean not null default true,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists governance_assessment_requests_one_pending
  on public.governance_assessment_requests(agent_id) where status='pending';
create index if not exists governance_assessment_requests_owner_status
  on public.governance_assessment_requests(owner_id,status,due_at);
create index if not exists governance_assessment_drafts_owner
  on public.governance_assessment_drafts(owner_id,updated_at desc);

create table if not exists public.governance_attention_items (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.governance_assessments(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  source text not null default 'admin' check (source in ('deterministic','override','admin','ai_advisory')),
  category text,
  statement text not null,
  owner_response text,
  owner_explanation text,
  risk_points integer check (risk_points is null or risk_points between 0 and 100),
  recommended_action text,
  status text not null default 'open' check (status in ('open','clarification_requested','resolved','accepted_risk')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists governance_attention_items_assessment_status
  on public.governance_attention_items(assessment_id,status,created_at);

alter table public.user_preferences enable row level security;
alter table public.governance_assessment_drafts enable row level security;
alter table public.governance_assessment_requests enable row level security;
alter table public.governance_attention_items enable row level security;

grant select,insert,update,delete on public.user_preferences to authenticated;
grant select,insert,update,delete on public.governance_assessment_drafts to authenticated;
grant select,insert,update,delete on public.governance_assessment_requests to authenticated;
grant select,insert,update,delete on public.governance_attention_items to authenticated;

drop policy if exists "users manage own preferences" on public.user_preferences;
create policy "users manage own preferences" on public.user_preferences for all to authenticated
  using (user_id=auth.uid()) with check (user_id=auth.uid());

drop policy if exists "owners manage governance drafts" on public.governance_assessment_drafts;
create policy "owners manage governance drafts" on public.governance_assessment_drafts for all to authenticated
  using (owner_id=auth.uid() and exists(select 1 from public.agents a where a.id=agent_id and a.accountable_owner_id=auth.uid()))
  with check (owner_id=auth.uid() and exists(select 1 from public.agents a where a.id=agent_id and a.accountable_owner_id=auth.uid()));
drop policy if exists "admins read governance drafts" on public.governance_assessment_drafts;
create policy "admins read governance drafts" on public.governance_assessment_drafts for select to authenticated using (public.is_active_admin());

drop policy if exists "owners read assessment requests" on public.governance_assessment_requests;
create policy "owners read assessment requests" on public.governance_assessment_requests for select to authenticated using (owner_id=auth.uid() or public.is_active_admin());
drop policy if exists "admins manage assessment requests" on public.governance_assessment_requests;
create policy "admins manage assessment requests" on public.governance_assessment_requests for all to authenticated using (public.is_active_admin()) with check (public.is_active_admin());

drop policy if exists "authorized read attention items" on public.governance_attention_items;
create policy "authorized read attention items" on public.governance_attention_items for select to authenticated using (public.is_active_admin() or public.can_manage_agent(agent_id));
drop policy if exists "admins manage attention items" on public.governance_attention_items;
create policy "admins manage attention items" on public.governance_attention_items for all to authenticated using (public.is_active_admin()) with check (public.is_active_admin());

create or replace function public.request_owner_governance_check(target_agent uuid, target_due_at timestamptz default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare request_id uuid; owner_id uuid;
begin
  if not public.is_active_admin() then raise exception 'Active Admin access is required.'; end if;
  select accountable_owner_id into owner_id from public.agents where id=target_agent;
  if owner_id is null then raise exception 'Assign an accountable owner first.'; end if;
  insert into public.governance_assessment_requests(agent_id,owner_id,requested_by,due_at,status,legacy_resource)
  values(target_agent,owner_id,auth.uid(),target_due_at,'pending',not exists(select 1 from public.governance_assessments where agent_id=target_agent and assessment_version='LV-GOV-2.0'))
  on conflict (agent_id) where status='pending' do update set owner_id=excluded.owner_id,requested_by=excluded.requested_by,due_at=excluded.due_at,created_at=now()
  returning id into request_id;
  update public.agents set manual_governance_flag=true,governance_status='assessment_pending' where id=target_agent;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'owner_governance_check_requested','agents',target_agent::text,jsonb_build_object('owner_id',owner_id,'due_at',target_due_at));
  return request_id;
end $$;
revoke all on function public.request_owner_governance_check(uuid,timestamptz) from public;
grant execute on function public.request_owner_governance_check(uuid,timestamptz) to authenticated;

create or replace function public.complete_governance_assessment_request()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.assessment_version='LV-GOV-2.0' then
    update public.governance_assessment_requests set status='completed',completed_at=now()
      where agent_id=new.agent_id and status='pending';
    delete from public.governance_assessment_drafts where agent_id=new.agent_id and questionnaire_version=new.assessment_version;
  end if;
  return new;
end $$;
drop trigger if exists complete_governance_assessment_request on public.governance_assessments;
create trigger complete_governance_assessment_request after insert on public.governance_assessments
for each row execute function public.complete_governance_assessment_request();

notify pgrst, 'reload schema';
