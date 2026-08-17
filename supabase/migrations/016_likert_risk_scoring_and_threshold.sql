-- Plain-language Likert risk scoring and configurable future-assessment threshold.
-- Idempotent and data-preserving; run after migration 015.

alter table public.governance_assessments
  add column if not exists risk_band text,
  add column if not exists review_threshold integer,
  add column if not exists score_direction text,
  add column if not exists automatically_cleared boolean;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='governance_assessments_risk_band_check' and conrelid='public.governance_assessments'::regclass) then
    alter table public.governance_assessments add constraint governance_assessments_risk_band_check check (risk_band is null or risk_band in ('low','moderate_low','medium','high','critical'));
  end if;
  if not exists (select 1 from pg_constraint where conname='governance_assessments_review_threshold_check' and conrelid='public.governance_assessments'::regclass) then
    alter table public.governance_assessments add constraint governance_assessments_review_threshold_check check (review_threshold is null or review_threshold between 0 and 100);
  end if;
end $$;

insert into public.app_settings(setting_key,setting_value)
values('governance_review_threshold','40') on conflict(setting_key) do nothing;

create or replace function public.governance_likert_points(target_responses jsonb, question_id text)
returns integer language sql immutable set search_path=public as $$
  select case target_responses->question_id->>'answer'
    when 'Strongly Agree' then 0 when 'Agree' then 25 when 'Not Sure' then 50
    when 'Disagree' then 75 when 'Strongly Disagree' then 100
    when 'Not Applicable' then case when trim(coalesce(target_responses->question_id->>'explanation',''))<>'' then null else 50 end
    else 50 end;
$$;
revoke all on function public.governance_likert_points(jsonb,text) from public;

create or replace function public.governance_likert_category_score(target_responses jsonb, question_ids text[])
returns integer language sql immutable set search_path=public as $$
  select coalesce(round(avg(public.governance_likert_points(target_responses,question_id))),0)::integer from unnest(question_ids) question_id;
$$;
revoke all on function public.governance_likert_category_score(jsonb,text[]) from public;

create or replace function public.record_governance_assessment(
  target_agent uuid, target_prompt_version uuid, target_version text,
  target_score integer, target_categories jsonb, target_responses jsonb,
  target_initial_risk text, target_final_risk text, target_overrides jsonb,
  target_missing jsonb, target_status text, target_summary text
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  new_id uuid; next_number integer; prior_id uuid; agent_row public.agents%rowtype;
  computed_categories jsonb; computed_score integer; computed_initial text; computed_final text; computed_status text; computed_band text;
  computed_overrides jsonb := '[]'::jsonb; computed_missing jsonb := '[]'::jsonb;
  review_threshold integer := 40; relevant_ids text[]; question_id text; answer text; explanation text;
  privacy_ids text[] := array['privacy_minimization','privacy_retention','privacy_access'];
  safety_ids text[] := array['safety_contact']; security_ids text[] := array['security_secrets']; fairness_ids text[] := array[]::text[];
  accuracy_ids text[] := array['accuracy_sources','accuracy_review','accuracy_uncertainty','accuracy_reporting'];
  transparency_ids text[] := array['transparency_uses','transparency_owner','transparency_changes'];
begin
  if not public.can_manage_agent(target_agent) then raise exception 'You cannot assess this resource.'; end if;
  select * into agent_row from public.agents where id=target_agent for update;
  if not found then raise exception 'Resource not found.'; end if;
  select case when setting_value ~ '^[0-9]{1,3}$' then least(100,greatest(0,setting_value::integer)) else 40 end into review_threshold from public.app_settings where setting_key='governance_review_threshold';
  review_threshold := coalesce(review_threshold,40);

  foreach question_id in array array['trigger_sensitive','trigger_connection','trigger_consequential','trigger_affected'] loop
    if coalesce(target_responses->question_id->>'answer','') not in ('Yes','No') then computed_missing:=computed_missing||to_jsonb(question_id); end if;
  end loop;
  if target_responses->'trigger_sensitive'->>'answer'='Yes' then privacy_ids:=array['privacy_sensitive','privacy_minimization','privacy_retention','privacy_access']; end if;
  if target_responses->'trigger_connection'->>'answer'='Yes' then security_ids:=array['security_connections','security_secrets','security_audit']; end if;
  if target_responses->'trigger_consequential'->>'answer'='Yes' then safety_ids:=array['safety_human_review','safety_contact','safety_shutdown']; end if;
  if target_responses->'trigger_affected'->>'answer'='Yes' then fairness_ids:=array['fairness_effects','fairness_testing']; transparency_ids:=array['transparency_disclosure','transparency_uses','transparency_owner','transparency_changes']; end if;
  relevant_ids:=privacy_ids||safety_ids||security_ids||fairness_ids||accuracy_ids||transparency_ids;
  foreach question_id in array relevant_ids loop
    answer:=coalesce(target_responses->question_id->>'answer',''); explanation:=coalesce(target_responses->question_id->>'explanation','');
    if answer not in ('Strongly Disagree','Disagree','Not Sure','Agree','Strongly Agree','Not Applicable') then computed_missing:=computed_missing||to_jsonb(question_id); end if;
    if answer in ('Strongly Disagree','Disagree','Not Sure','Not Applicable') and trim(explanation)='' then computed_missing:=computed_missing||to_jsonb(question_id||':explanation'); end if;
  end loop;
  if coalesce(target_responses->'prohibited_use'->>'answer','') not in ('Yes','No') then computed_missing:=computed_missing||to_jsonb('prohibited_use'::text); end if;

  computed_categories:=jsonb_build_object(
    'privacy',public.governance_likert_category_score(target_responses,privacy_ids),
    'safety',public.governance_likert_category_score(target_responses,safety_ids),
    'security',public.governance_likert_category_score(target_responses,security_ids),
    'fairness',public.governance_likert_category_score(target_responses,fairness_ids),
    'accuracy',public.governance_likert_category_score(target_responses,accuracy_ids),
    'transparency',public.governance_likert_category_score(target_responses,transparency_ids));
  computed_score:=round((computed_categories->>'privacy')::integer*.20+(computed_categories->>'safety')::integer*.20+(computed_categories->>'security')::integer*.20+(computed_categories->>'fairness')::integer*.15+(computed_categories->>'accuracy')::integer*.15+(computed_categories->>'transparency')::integer*.10);
  computed_band:=case when computed_score<20 then 'low' when computed_score<40 then 'moderate_low' when computed_score<60 then 'medium' when computed_score<80 then 'high' else 'critical' end;
  computed_initial:=case when computed_band='moderate_low' then 'medium' else computed_band end; computed_final:=computed_initial;

  if target_responses->'trigger_sensitive'->>'answer'='Yes' and public.governance_likert_points(target_responses,'privacy_sensitive')>=75 then computed_overrides:=computed_overrides||jsonb_build_array(jsonb_build_object('id','sensitive_without_safeguards','minimum_risk','high','reason','Sensitive or regulated information lacks confirmed safeguards.')); end if;
  if target_responses->'trigger_consequential'->>'answer'='Yes' and public.governance_likert_points(target_responses,'safety_human_review')>=75 then computed_overrides:=computed_overrides||jsonb_build_array(jsonb_build_object('id','decision_without_human_review','minimum_risk','high','reason','An important decision lacks qualified human review.')); end if;
  if target_responses->'trigger_connection'->>'answer'='Yes' and public.governance_likert_points(target_responses,'security_connections')>=75 then computed_overrides:=computed_overrides||jsonb_build_array(jsonb_build_object('id','connection_without_access_controls','minimum_risk','high','reason','A system connection lacks confirmed authentication or access controls.')); end if;
  if public.governance_likert_points(target_responses,'security_secrets')>=75 then computed_overrides:=computed_overrides||jsonb_build_array(jsonb_build_object('id','secrets_exposed','minimum_risk','critical','reason','Secrets may be stored in prompts, source code, form fields, or browser-accessible settings.')); end if;
  if target_responses->'trigger_affected'->>'answer'='Yes' and public.governance_likert_points(target_responses,'transparency_disclosure')>=75 then computed_overrides:=computed_overrides||jsonb_build_array(jsonb_build_object('id','customer_without_disclosure','minimum_risk','high','reason','A customer- or stakeholder-facing resource lacks AI disclosure.')); end if;
  if target_responses->'trigger_affected'->>'answer'='Yes' and public.governance_likert_points(target_responses,'fairness_effects')>=75 then computed_overrides:=computed_overrides||jsonb_build_array(jsonb_build_object('id','groups_without_fairness_review','minimum_risk','high','reason','A resource affecting different groups lacks an unfair-outcomes evaluation.')); end if;
  if agent_row.accountable_owner_id is null or public.governance_likert_points(target_responses,'transparency_owner')>=75 then computed_overrides:=computed_overrides||jsonb_build_array(jsonb_build_object('id','no_accountable_owner','minimum_risk','high','reason','No active accountable owner is confirmed.')); end if;
  if target_responses->'trigger_consequential'->>'answer'='Yes' and (public.governance_likert_points(target_responses,'safety_contact')>=75 or public.governance_likert_points(target_responses,'safety_shutdown')>=75) then computed_overrides:=computed_overrides||jsonb_build_array(jsonb_build_object('id','missing_escalation_or_shutdown','minimum_risk','high','reason','A consequential resource lacks a confirmed escalation or shutdown process.')); end if;
  if target_responses->'prohibited_use'->>'answer'='Yes' then computed_overrides:=computed_overrides||jsonb_build_array(jsonb_build_object('id','prohibited_use','minimum_risk','critical','reason','A prohibited, unlawful, deceptive, discriminatory, or materially harmful use was identified.')); end if;
  if exists(select 1 from unnest(relevant_ids) id where id in ('privacy_sensitive','privacy_access','safety_human_review','safety_contact','safety_shutdown','security_connections','security_secrets','fairness_effects','accuracy_review','transparency_disclosure','transparency_owner') and target_responses->id->>'answer'='Not Sure') then computed_overrides:=computed_overrides||jsonb_build_array(jsonb_build_object('id','critical_information_missing','minimum_risk','medium','reason','A critical safeguard is not yet confirmed.')); end if;
  computed_status:=case when jsonb_array_length(computed_missing)>0 then 'assessment_pending' when computed_score>=review_threshold or jsonb_array_length(computed_overrides)>0 then 'governance_review' else 'cleared' end;
  if target_score<>computed_score or target_categories<>computed_categories or target_initial_risk<>computed_initial or target_final_risk<>computed_final or target_overrides<>computed_overrides or target_missing<>computed_missing or target_status<>computed_status then raise exception 'The submitted assessment does not match the deterministic Likert governance rules.'; end if;

  select id into prior_id from public.governance_assessments where agent_id=target_agent order by assessment_number desc limit 1;
  select coalesce(max(assessment_number),0)+1 into next_number from public.governance_assessments where agent_id=target_agent;
  insert into public.governance_assessments(agent_id,prompt_version_id,assessment_number,assessment_version,overall_score,category_scores,responses,initial_risk,final_risk,mandatory_overrides,missing_information,review_status,summary,assessed_by,supersedes_id,risk_band,review_threshold,score_direction,automatically_cleared)
  values(target_agent,target_prompt_version,next_number,target_version,target_score,target_categories,target_responses,target_initial_risk,target_final_risk,target_overrides,target_missing,target_status,target_summary,auth.uid(),prior_id,computed_band,review_threshold,'higher_is_greater_risk',target_status='cleared') returning id into new_id;
  update public.agents set current_governance_assessment_id=new_id,governance_score=target_score,risk_level=target_final_risk::public.risk_level,governance_flagged=(target_status<>'cleared'),manual_governance_flag=false,governance_summary=target_summary,governance_checked_at=now(),governance_provider='Deterministic LV Governance '||target_version,governance_status=target_status,
    status=case when status='retired' then status when target_status='cleared' then 'approved'::public.workflow_status when target_status='governance_review' then 'governance_review'::public.workflow_status else 'assessment_pending'::public.workflow_status end where id=target_agent;
  if target_status='cleared' and target_prompt_version is not null then update public.prompt_versions set status='approved'::public.workflow_status where id=target_prompt_version and status='pending'; end if;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'governance_assessed','governance_assessments',new_id::text,jsonb_build_object('agent_id',target_agent,'risk_score',target_score,'risk_band',computed_band,'review_threshold',review_threshold,'status',target_status,'version',target_version,'override_count',jsonb_array_length(target_overrides)));
  return new_id;
end $$;

revoke all on function public.record_governance_assessment(uuid,uuid,text,integer,jsonb,jsonb,text,text,jsonb,jsonb,text,text) from public;
grant execute on function public.record_governance_assessment(uuid,uuid,text,integer,jsonb,jsonb,text,text,jsonb,jsonb,text,text) to authenticated;

create or replace function public.request_governance_reassessment(target_agent uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_active_admin() then raise exception 'Active Admin access is required.'; end if;
  if not exists(select 1 from public.agents where id=target_agent) then raise exception 'Resource not found.'; end if;
  update public.agents set manual_governance_flag=true where id=target_agent;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'governance_reassessment_requested','agents',target_agent::text,jsonb_build_object('requested_at',now()));
end $$;
revoke all on function public.request_governance_reassessment(uuid) from public;
grant execute on function public.request_governance_reassessment(uuid) to authenticated;

notify pgrst, 'reload schema';
