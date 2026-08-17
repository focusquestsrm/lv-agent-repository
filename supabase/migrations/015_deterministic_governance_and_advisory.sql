-- Deterministic governance assessments, Admin review, clarifications, and advisory remediation.
-- Idempotent and data-preserving; run after migration 014.

alter table public.agents
  add column if not exists current_governance_assessment_id uuid,
  add column if not exists manual_governance_flag boolean not null default false;

create table if not exists public.governance_assessments (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  prompt_version_id uuid references public.prompt_versions(id) on delete set null,
  assessment_number integer not null,
  assessment_version text not null,
  overall_score integer not null check (overall_score between 0 and 100),
  category_scores jsonb not null default '{}'::jsonb,
  responses jsonb not null default '{}'::jsonb,
  initial_risk text not null check (initial_risk in ('low','medium','high','critical')),
  final_risk text not null check (final_risk in ('low','medium','high','critical')),
  mandatory_overrides jsonb not null default '[]'::jsonb,
  missing_information jsonb not null default '[]'::jsonb,
  review_status text not null check (review_status in ('assessment_pending','cleared','governance_review','clarification_requested','changes_requested','approved','approved_with_conditions','rejected')),
  summary text,
  assessed_by uuid not null references public.profiles(id),
  assessed_at timestamptz not null default now(),
  supersedes_id uuid references public.governance_assessments(id) on delete set null,
  unique(agent_id, assessment_number)
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname='agents_current_governance_assessment_fk' and conrelid='public.agents'::regclass) then
    alter table public.agents add constraint agents_current_governance_assessment_fk
      foreign key (current_governance_assessment_id) references public.governance_assessments(id) on delete set null;
  end if;
end $$;

create table if not exists public.governance_decisions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.governance_assessments(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  admin_id uuid not null references public.profiles(id),
  decision text not null check (decision in ('approved','approved_with_conditions','request_changes','rejected','accepted_residual_risk')),
  notes text,
  conditions text,
  decided_at timestamptz not null default now()
);

create table if not exists public.governance_clarifications (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.governance_assessments(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  requested_by uuid not null references public.profiles(id),
  question_ids jsonb not null default '[]'::jsonb,
  instructions text not null,
  due_at timestamptz,
  status text not null default 'open' check (status in ('open','responded','closed')),
  owner_response text,
  responded_by uuid references public.profiles(id),
  responded_at timestamptz,
  closed_by uuid references public.profiles(id),
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_advisory_assessments (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.governance_assessments(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  advisory_number integer not null,
  requested_by uuid not null references public.profiles(id),
  provider text not null,
  model text,
  advisory_score integer check (advisory_score between 0 and 100),
  advisory_risk text check (advisory_risk in ('low','medium','high','critical')),
  executive_summary text,
  recommended_decision text check (recommended_decision in ('Approve','Approve With Conditions','Request Clarification','Request Changes','Reject')),
  output jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(assessment_id, advisory_number)
);

create table if not exists public.governance_recommendations (
  id uuid primary key default gen_random_uuid(),
  advisory_id uuid not null references public.ai_advisory_assessments(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  category text not null,
  concern text not null,
  impact text,
  recommended_action text not null,
  evidence_required text,
  responsible_role text,
  priority text not null check (priority in ('Critical','Required Before Approval','High','Medium','Best Practice')),
  plan_phase text check (plan_phase in ('Immediate','Short-term','Ongoing')),
  suggested_timeframe text,
  expected_score_improvement integer,
  residual_risk text,
  owner_decision text check (owner_decision is null or owner_decision in ('accepted','disputed')),
  owner_response text,
  action_owner text,
  target_date date,
  status text not null default 'Not Started' check (status in ('Not Started','In Progress','Completed','Accepted Risk','Not Applicable','Awaiting Verification')),
  evidence text,
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists governance_assessments_agent_idx on public.governance_assessments(agent_id, assessment_number desc);
create index if not exists governance_assessments_queue_idx on public.governance_assessments(review_status, final_risk, assessed_at desc);
create index if not exists governance_clarifications_agent_idx on public.governance_clarifications(agent_id, status, created_at desc);
create index if not exists advisory_assessments_agent_idx on public.ai_advisory_assessments(agent_id, created_at desc);
create index if not exists governance_recommendations_agent_idx on public.governance_recommendations(agent_id, status, priority);

alter table public.governance_assessments enable row level security;
alter table public.governance_decisions enable row level security;
alter table public.governance_clarifications enable row level security;
alter table public.ai_advisory_assessments enable row level security;
alter table public.governance_recommendations enable row level security;

drop policy if exists "authorized read assessments" on public.governance_assessments;
create policy "authorized read assessments" on public.governance_assessments for select to authenticated using (public.can_access_agent(agent_id));
drop policy if exists "managers create assessments" on public.governance_assessments;
create policy "managers create assessments" on public.governance_assessments for insert to authenticated with check (assessed_by=auth.uid() and public.can_manage_agent(agent_id));

drop policy if exists "authorized read governance decisions" on public.governance_decisions;
create policy "authorized read governance decisions" on public.governance_decisions for select to authenticated using (public.can_access_agent(agent_id));

drop policy if exists "authorized read clarifications" on public.governance_clarifications;
create policy "authorized read clarifications" on public.governance_clarifications for select to authenticated using (public.can_access_agent(agent_id));
drop policy if exists "admins create clarifications" on public.governance_clarifications;
create policy "admins create clarifications" on public.governance_clarifications for insert to authenticated with check (public.is_active_admin() and requested_by=auth.uid() and public.can_access_agent(agent_id));
drop policy if exists "owners respond clarifications" on public.governance_clarifications;
create policy "owners respond clarifications" on public.governance_clarifications for update to authenticated
using (status='open' and exists(select 1 from public.agents a where a.id=agent_id and (a.accountable_owner_id=auth.uid() or public.is_active_admin())))
with check (responded_by=auth.uid() or public.is_active_admin());

drop policy if exists "authorized read advisories" on public.ai_advisory_assessments;
create policy "authorized read advisories" on public.ai_advisory_assessments for select to authenticated using (public.can_access_agent(agent_id));

drop policy if exists "authorized read recommendations" on public.governance_recommendations;
create policy "authorized read recommendations" on public.governance_recommendations for select to authenticated using (public.can_access_agent(agent_id));
drop policy if exists "owners update recommendations" on public.governance_recommendations;
create policy "owners update recommendations" on public.governance_recommendations for update to authenticated
using (exists(select 1 from public.agents a where a.id=agent_id and (a.accountable_owner_id=auth.uid() or public.is_active_admin())))
with check (exists(select 1 from public.agents a where a.id=agent_id and (a.accountable_owner_id=auth.uid() or public.is_active_admin())));

revoke insert on public.governance_assessments from authenticated;
grant select on public.governance_assessments to authenticated;
grant select on public.governance_decisions, public.ai_advisory_assessments to authenticated;
revoke update on public.governance_clarifications from authenticated;
grant select, insert on public.governance_clarifications to authenticated;
revoke update on public.governance_recommendations from authenticated;
grant select on public.governance_recommendations to authenticated;

create or replace function public.governance_category_score(target_responses jsonb, question_ids text[])
returns integer language sql immutable set search_path=public as $$
  select round(avg(case target_responses->question_id->>'answer'
    when 'Yes' then 100 when 'No' then 0 when 'Unknown' then 25
    when 'Not Applicable' then case when trim(coalesce(target_responses->question_id->>'explanation',''))<>'' then null else 25 end
    else 25 end))::integer
  from unnest(question_ids) question_id;
$$;
revoke all on function public.governance_category_score(jsonb,text[]) from public;

create or replace function public.record_governance_assessment(
  target_agent uuid, target_prompt_version uuid, target_version text,
  target_score integer, target_categories jsonb, target_responses jsonb,
  target_initial_risk text, target_final_risk text, target_overrides jsonb,
  target_missing jsonb, target_status text, target_summary text
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  new_id uuid; next_number integer; prior_id uuid; agent_row public.agents%rowtype;
  computed_categories jsonb; computed_score integer; computed_initial text; computed_final text; computed_status text;
  computed_overrides jsonb := '[]'::jsonb; computed_missing jsonb := '[]'::jsonb;
  all_ids text[] := array['sensitive_data','retention','minimization','restricted_access','systems_access','authentication','secrets_secure','logging','consequential','human_review','escalation','failure_plan','protected_impact','bias_evaluation','representative_testing','approved_grounding','accuracy_validation','uncertainty','inaccuracy_reporting','ai_disclosure','accountable_owner','use_documentation','change_records','customer_facing','secrets_entered','prohibited_use'];
  high_ids text[] := array['sensitive_data','retention','restricted_access','systems_access','authentication','secrets_secure','consequential','human_review','escalation','failure_plan','protected_impact','bias_evaluation','approved_grounding','accuracy_validation','ai_disclosure','accountable_owner','use_documentation'];
  question_id text; answer text; explanation text;
begin
  if not public.can_manage_agent(target_agent) then raise exception 'You cannot assess this resource.'; end if;
  select * into agent_row from public.agents where id=target_agent for update;
  if not found then raise exception 'Resource not found.'; end if;
  foreach question_id in array all_ids loop
    answer := coalesce(target_responses->question_id->>'answer','');
    explanation := coalesce(target_responses->question_id->>'explanation','');
    if answer not in ('Yes','No','Not Applicable','Unknown') then computed_missing := computed_missing || to_jsonb(question_id); end if;
    if answer='Not Applicable' and trim(explanation)='' then computed_missing := computed_missing || to_jsonb(question_id||':explanation'); end if;
    if question_id=any(high_ids) and answer in ('No','Unknown') and trim(explanation)='' then computed_missing := computed_missing || to_jsonb(question_id||':explanation'); end if;
  end loop;
  computed_categories := jsonb_build_object(
    'privacy',public.governance_category_score(target_responses,array['sensitive_data','retention','minimization','restricted_access']),
    'security',public.governance_category_score(target_responses,array['systems_access','authentication','secrets_secure','logging']),
    'safety',public.governance_category_score(target_responses,array['consequential','human_review','escalation','failure_plan']),
    'fairness',public.governance_category_score(target_responses,array['protected_impact','bias_evaluation','representative_testing']),
    'accuracy',public.governance_category_score(target_responses,array['approved_grounding','accuracy_validation','uncertainty','inaccuracy_reporting']),
    'transparency',public.governance_category_score(target_responses,array['ai_disclosure','accountable_owner','use_documentation','change_records'])
  );
  computed_score := round((computed_categories->>'privacy')::integer*.20+(computed_categories->>'security')::integer*.20+(computed_categories->>'safety')::integer*.20+(computed_categories->>'fairness')::integer*.15+(computed_categories->>'accuracy')::integer*.15+(computed_categories->>'transparency')::integer*.10);
  computed_initial := case when computed_score>=85 then 'low' when computed_score>=65 then 'medium' when computed_score>=40 then 'high' else 'critical' end;
  computed_final := computed_initial;
  if agent_row.uses_sensitive_data and coalesce(target_responses->'sensitive_data'->>'answer','') in ('No','Unknown') then computed_overrides:=computed_overrides||jsonb_build_array(jsonb_build_object('id','sensitive_without_safeguards','minimum_risk','high','reason','Sensitive or regulated data lacks confirmed safeguards.')); computed_final:=case when computed_final in ('low','medium') then 'high' else computed_final end; end if;
  if target_responses->'consequential'->>'answer'='Yes' and coalesce(target_responses->'human_review'->>'answer','')<>'Yes' then computed_overrides:=computed_overrides||jsonb_build_array(jsonb_build_object('id','consequential_without_review','minimum_risk','high','reason','Consequential decisions lack confirmed human review.')); computed_final:=case when computed_final in ('low','medium') then 'high' else computed_final end; end if;
  if (agent_row.uses_database or agent_row.uses_api) and coalesce(target_responses->'authentication'->>'answer','')<>'Yes' then computed_overrides:=computed_overrides||jsonb_build_array(jsonb_build_object('id','systems_without_auth','minimum_risk','high','reason','Database or API access lacks confirmed authentication controls.')); computed_final:=case when computed_final in ('low','medium') then 'high' else computed_final end; end if;
  if target_responses->'secrets_entered'->>'answer'='Yes' or target_responses->'secrets_secure'->>'answer'='No' then computed_overrides:=computed_overrides||jsonb_build_array(jsonb_build_object('id','secrets_exposed','minimum_risk','critical','reason','Secrets may be entered or stored in an unsafe location.')); computed_final:='critical'; end if;
  if target_responses->'prohibited_use'->>'answer'='Yes' then computed_overrides:=computed_overrides||jsonb_build_array(jsonb_build_object('id','prohibited_use','minimum_risk','critical','reason','The intended use may be unlawful, deceptive, discriminatory, or harmful.')); computed_final:='critical'; end if;
  if target_responses->'customer_facing'->>'answer'='Yes' and coalesce(target_responses->'ai_disclosure'->>'answer','')<>'Yes' then computed_overrides:=computed_overrides||jsonb_build_array(jsonb_build_object('id','customer_without_disclosure','minimum_risk','medium','reason','Customer-facing AI lacks confirmed disclosure.')); computed_final:=case when computed_final='low' then 'medium' else computed_final end; end if;
  if target_responses->'protected_impact'->>'answer'='Yes' and coalesce(target_responses->'bias_evaluation'->>'answer','')<>'Yes' then computed_overrides:=computed_overrides||jsonb_build_array(jsonb_build_object('id','protected_impact_without_bias_review','minimum_risk','high','reason','Protected-group impact lacks a bias evaluation.')); computed_final:=case when computed_final in ('low','medium') then 'high' else computed_final end; end if;
  if coalesce(target_responses->'accountable_owner'->>'answer','')<>'Yes' or agent_row.accountable_owner_id is null then computed_overrides:=computed_overrides||jsonb_build_array(jsonb_build_object('id','no_accountable_owner','minimum_risk','high','reason','An active accountable owner is not confirmed.')); computed_final:=case when computed_final in ('low','medium') then 'high' else computed_final end; end if;
  if target_responses->'consequential'->>'answer'='Yes' and (coalesce(target_responses->'escalation'->>'answer','')<>'Yes' or coalesce(target_responses->'failure_plan'->>'answer','')<>'Yes') then computed_overrides:=computed_overrides||jsonb_build_array(jsonb_build_object('id','missing_consequential_failure_process','minimum_risk','high','reason','A consequential use lacks a confirmed escalation and failure process.')); computed_final:=case when computed_final in ('low','medium') then 'high' else computed_final end; end if;
  computed_status := case when jsonb_array_length(computed_missing)>0 then 'assessment_pending' when computed_final='low' then 'cleared' else 'governance_review' end;
  if target_score<>computed_score or target_categories<>computed_categories or target_initial_risk<>computed_initial or target_final_risk<>computed_final or target_overrides<>computed_overrides or target_missing<>computed_missing or target_status<>computed_status then raise exception 'The submitted assessment does not match the deterministic governance rules.'; end if;
  select id into prior_id from public.governance_assessments where agent_id=target_agent order by assessment_number desc limit 1;
  select coalesce(max(assessment_number),0)+1 into next_number from public.governance_assessments where agent_id=target_agent;
  insert into public.governance_assessments(agent_id,prompt_version_id,assessment_number,assessment_version,overall_score,category_scores,responses,initial_risk,final_risk,mandatory_overrides,missing_information,review_status,summary,assessed_by,supersedes_id)
  values(target_agent,target_prompt_version,next_number,target_version,target_score,target_categories,target_responses,target_initial_risk,target_final_risk,coalesce(target_overrides,'[]'),coalesce(target_missing,'[]'),target_status,target_summary,auth.uid(),prior_id)
  returning id into new_id;
  update public.agents set current_governance_assessment_id=new_id, governance_score=target_score, risk_level=target_final_risk,
    governance_flagged=(target_status<>'cleared'), governance_summary=target_summary, governance_checked_at=now(), governance_provider='Deterministic LV Governance', governance_status=target_status,
    status=case when status='retired' then status when target_status='cleared' then 'approved'::public.workflow_status when target_status='governance_review' then 'governance_review'::public.workflow_status else 'assessment_pending'::public.workflow_status end
  where id=target_agent;
  if target_status='cleared' and target_prompt_version is not null then
    update public.prompt_versions set status='approved'::public.workflow_status where id=target_prompt_version and status='pending';
  end if;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'governance_assessed','governance_assessments',new_id::text,jsonb_build_object('agent_id',target_agent,'score',target_score,'initial_risk',target_initial_risk,'final_risk',target_final_risk,'status',target_status,'version',target_version));
  return new_id;
end $$;
revoke all on function public.record_governance_assessment(uuid,uuid,text,integer,jsonb,jsonb,text,text,jsonb,jsonb,text,text) from public;
grant execute on function public.record_governance_assessment(uuid,uuid,text,integer,jsonb,jsonb,text,text,jsonb,jsonb,text,text) to authenticated;

create or replace function public.decide_governance_assessment(target_assessment uuid,target_decision text,decision_notes text default null,decision_conditions text default null)
returns void language plpgsql security definer set search_path=public as $$
declare a public.governance_assessments%rowtype; owner_id uuid;
begin
  if not public.is_active_admin() then raise exception 'Admin governance access is required.'; end if;
  if target_decision not in ('approved','approved_with_conditions','request_changes','rejected','accepted_residual_risk') then raise exception 'Unsupported governance decision.'; end if;
  select * into a from public.governance_assessments where id=target_assessment for update;
  if not found then raise exception 'Assessment not found.'; end if;
  select created_by into owner_id from public.agents where id=a.agent_id;
  if target_decision in ('approved','approved_with_conditions','accepted_residual_risk') and owner_id=auth.uid() then raise exception 'Resource authors cannot approve their own resource.'; end if;
  insert into public.governance_decisions(assessment_id,agent_id,admin_id,decision,notes,conditions) values(a.id,a.agent_id,auth.uid(),target_decision,nullif(trim(decision_notes),''),nullif(trim(decision_conditions),''));
  update public.governance_assessments set review_status=case target_decision when 'approved' then 'approved' when 'approved_with_conditions' then 'approved_with_conditions' when 'request_changes' then 'changes_requested' when 'rejected' then 'rejected' else 'approved_with_conditions' end where id=a.id;
  update public.agents set governance_status=case when target_decision in ('approved','approved_with_conditions','accepted_residual_risk') then 'cleared' else 'governance_review' end,
    governance_flagged=not(target_decision in ('approved','approved_with_conditions','accepted_residual_risk')),
    status=case when target_decision in ('approved','approved_with_conditions','accepted_residual_risk') then 'approved'::public.workflow_status else 'changes_requested'::public.workflow_status end
  where id=a.agent_id;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'governance_'||target_decision,'governance_assessments',a.id::text,jsonb_build_object('agent_id',a.agent_id,'notes',decision_notes,'conditions',decision_conditions));
end $$;
revoke all on function public.decide_governance_assessment(uuid,text,text,text) from public;
grant execute on function public.decide_governance_assessment(uuid,text,text,text) to authenticated;

create or replace function public.respond_governance_clarification(target_clarification uuid,target_response text)
returns void language plpgsql security definer set search_path=public as $$
declare clarification public.governance_clarifications%rowtype;
begin
  select * into clarification from public.governance_clarifications where id=target_clarification for update;
  if not found or clarification.status<>'open' then raise exception 'This clarification request is no longer open.'; end if;
  if not exists(select 1 from public.agents where id=clarification.agent_id and (accountable_owner_id=auth.uid() or public.is_active_admin())) then raise exception 'Only the accountable owner can respond.'; end if;
  if trim(coalesce(target_response,''))='' then raise exception 'A clarification response is required.'; end if;
  update public.governance_clarifications set owner_response=trim(target_response),responded_by=auth.uid(),responded_at=now(),status='responded' where id=target_clarification;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'governance_clarification_responded','governance_clarifications',target_clarification::text,jsonb_build_object('agent_id',clarification.agent_id,'assessment_id',clarification.assessment_id));
end $$;
revoke all on function public.respond_governance_clarification(uuid,text) from public;
grant execute on function public.respond_governance_clarification(uuid,text) to authenticated;

create or replace function public.audit_governance_clarification_request()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.audit_log(actor_id,action,entity_type,entity_id,details) values(new.requested_by,'governance_clarification_requested','governance_clarifications',new.id::text,jsonb_build_object('agent_id',new.agent_id,'assessment_id',new.assessment_id,'question_ids',new.question_ids,'due_at',new.due_at));
  return new;
end $$;
drop trigger if exists audit_governance_clarification_request on public.governance_clarifications;
create trigger audit_governance_clarification_request after insert on public.governance_clarifications for each row execute procedure public.audit_governance_clarification_request();

create or replace function public.update_governance_recommendation(
  target_recommendation uuid, target_owner_decision text, target_owner_response text,
  target_action_owner text, target_due_date date, target_status text, target_evidence text,
  target_admin_notes text default null, target_verify boolean default false
) returns void language plpgsql security definer set search_path=public as $$
declare recommendation public.governance_recommendations%rowtype; is_admin boolean;
begin
  select * into recommendation from public.governance_recommendations where id=target_recommendation for update;
  if not found then raise exception 'Recommendation not found.'; end if;
  is_admin := public.is_active_admin();
  if not is_admin and not exists(select 1 from public.agents where id=recommendation.agent_id and accountable_owner_id=auth.uid()) then raise exception 'Only the accountable owner or an Admin can update remediation.'; end if;
  if target_owner_decision is not null and target_owner_decision not in ('accepted','disputed') then raise exception 'Invalid owner decision.'; end if;
  if target_status not in ('Not Started','In Progress','Completed','Accepted Risk','Not Applicable','Awaiting Verification') then raise exception 'Invalid remediation status.'; end if;
  if not is_admin and target_status in ('Completed','Accepted Risk') then target_status := 'Awaiting Verification'; end if;
  update public.governance_recommendations set owner_decision=target_owner_decision, owner_response=nullif(trim(target_owner_response),''), action_owner=nullif(trim(target_action_owner),''), target_date=target_due_date, status=target_status, evidence=nullif(trim(target_evidence),''),
    admin_notes=case when is_admin then nullif(trim(target_admin_notes),'') else admin_notes end,
    verified_by=case when is_admin and target_verify then auth.uid() else verified_by end,
    verified_at=case when is_admin and target_verify then now() else verified_at end, updated_at=now()
  where id=target_recommendation;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,details) values(auth.uid(),case when is_admin and target_verify then 'governance_recommendation_verified' else 'governance_recommendation_updated' end,'governance_recommendations',target_recommendation::text,jsonb_build_object('agent_id',recommendation.agent_id,'status',target_status,'verified',is_admin and target_verify));
end $$;
revoke all on function public.update_governance_recommendation(uuid,text,text,text,date,text,text,text,boolean) from public;
grant execute on function public.update_governance_recommendation(uuid,text,text,text,date,text,text,text,boolean) to authenticated;

notify pgrst, 'reload schema';
