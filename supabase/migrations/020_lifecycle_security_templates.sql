-- Lifecycle administration RPCs: templates, versioning, safe deletion, archival, and audit.
-- Additive and idempotent; run after migration 019.

create or replace function public.create_lifecycle_from_template(target_company uuid,target_template text,target_name text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare lifecycle_id uuid:=gen_random_uuid(); phase_id uuid; stage_id uuid; previous_stage uuid; journey_stage uuid; journey_phase_id uuid; phase_data jsonb; stage_name text; phase_sequence integer:=0; stage_sequence integer:=0; total_sequence integer:=0;
declare template_data jsonb;
begin
  if not public.is_active_admin() then raise exception 'Active Admin access is required.'; end if;
  if target_template='focusquest' then template_data:='[{"name":"Phase I – Acquire the Institution","stages":["Market Intelligence & Target Identification","Lead Generation & Institutional Outreach","Contact Established, Discovery & Program Audit","Solution Design & Proposal"]},{"name":"Phase II – Commit and Build","stages":["Partnership Agreement & Procurement","Onboarding: Program Build & Platform Delivery","Faculty & Staff Enablement"]},{"name":"Phase III – Deliver the Student Journey","stages":["Student Acquisition & Enrollment","Student Success & Engagement","Workforce Readiness & Career Outcomes"]},{"name":"Phase IV – Prove and Grow","stages":["Outcomes Reporting, Renewal & Expansion"]}]'::jsonb;
  elsif target_template='d9' then template_data:='[{"name":"Member Lifecycle","stages":["Discover","Join","Activate","Engage","Upgrade","Advocate","Renew or Recover"]}]'::jsonb;
  elsif target_template='blank' then template_data:='[]'::jsonb;
  else raise exception 'Unknown lifecycle template.'; end if;
  insert into public.operational_lifecycles(id,company_id,name,description,lifecycle_type,template_key,created_by,updated_by)
  values(lifecycle_id,target_company,coalesce(nullif(trim(target_name),''),case target_template when 'focusquest' then 'FocusQuest Operational Lifecycle' when 'd9' then 'D9 Network Member Lifecycle' else 'New Operational Lifecycle' end),
    case target_template when 'focusquest' then 'Phased institution lifecycle with a nested student journey.' when 'd9' then 'Circular member lifecycle with feedback paths.' else null end,
    case target_template when 'focusquest' then 'phased' when 'd9' then 'circular' else 'linear' end,target_template,auth.uid(),auth.uid());
  for phase_data in select value from jsonb_array_elements(template_data) loop
    phase_sequence:=phase_sequence+1; phase_id:=gen_random_uuid();
    insert into public.lifecycle_phases(id,lifecycle_id,name,sequence,created_by,updated_by) values(phase_id,lifecycle_id,phase_data->>'name',phase_sequence,auth.uid(),auth.uid());
    stage_sequence:=0; previous_stage:=null;
    for stage_name in select jsonb_array_elements_text(phase_data->'stages') loop
      stage_sequence:=stage_sequence+1; total_sequence:=total_sequence+1; stage_id:=gen_random_uuid();
      insert into public.lifecycle_stages(id,lifecycle_id,phase_id,name,stage_number,sequence,purpose,created_by,updated_by)
      values(stage_id,lifecycle_id,phase_id,stage_name,total_sequence::text,stage_sequence,'Customize the purpose, activities, criteria, owner, system, metric, and known gaps.',auth.uid(),auth.uid());
      if previous_stage is not null then insert into public.lifecycle_connections(lifecycle_id,from_stage_id,to_stage_id,connection_type,created_by,updated_by) values(lifecycle_id,previous_stage,stage_id,'next',auth.uid(),auth.uid()) on conflict do nothing; end if;
      previous_stage:=stage_id;
    end loop;
  end loop;
  if target_template='focusquest' then
    journey_stage:=gen_random_uuid();
    select id into journey_phase_id from public.lifecycle_phases where lifecycle_id=create_lifecycle_from_template.lifecycle_id and name='Phase III – Deliver the Student Journey';
    insert into public.lifecycle_stages(id,lifecycle_id,phase_id,name,stage_number,sequence,purpose,metadata,created_by,updated_by)
    values(journey_stage,lifecycle_id,journey_phase_id,'Student Journey','III-J',0,'Nested lifecycle containing acquisition, success, engagement, workforce readiness, and career outcomes.',jsonb_build_object('is_journey_container',true),auth.uid(),auth.uid());
    update public.lifecycle_stages set parent_stage_id=journey_stage where lifecycle_id=create_lifecycle_from_template.lifecycle_id and phase_id=journey_phase_id and id<>journey_stage;
  end if;
  if target_template='d9' then
    insert into public.lifecycle_connections(lifecycle_id,from_stage_id,to_stage_id,connection_type,label,created_by,updated_by)
    select lifecycle_id,a.id,b.id,'feedback',x.label,auth.uid(),auth.uid() from (values('Advocate','Discover','Referral loop'),('Renew or Recover','Engage','Recovery loop')) x(from_name,to_name,label)
    join public.lifecycle_stages a on a.lifecycle_id=lifecycle_id and a.name=x.from_name join public.lifecycle_stages b on b.lifecycle_id=lifecycle_id and b.name=x.to_name on conflict do nothing;
  end if;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'lifecycle_created','operational_lifecycles',lifecycle_id::text,jsonb_build_object('template',target_template,'company_id',target_company));
  return lifecycle_id;
end $$;
revoke all on function public.create_lifecycle_from_template(uuid,text,text) from public;
grant execute on function public.create_lifecycle_from_template(uuid,text,text) to authenticated;

create or replace function public.create_lifecycle_version(source_lifecycle uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare source public.operational_lifecycles%rowtype; new_id uuid:=gen_random_uuid(); phase record; stage record; connection record; new_phase uuid; new_stage uuid; phase_map jsonb:='{}'; stage_map jsonb:='{}';
begin
  if not public.is_active_admin() then raise exception 'Active Admin access is required.'; end if;
  select * into source from public.operational_lifecycles where id=source_lifecycle; if not found then raise exception 'Lifecycle not found.'; end if;
  insert into public.operational_lifecycles(id,lineage_id,company_id,name,description,lifecycle_type,version,status,access_scope,template_key,tier_ladder,created_by,updated_by)
  values(new_id,source.lineage_id,source.company_id,source.name,source.description,source.lifecycle_type,(select max(version)+1 from public.operational_lifecycles where lineage_id=source.lineage_id),'draft',source.access_scope,source.template_key,source.tier_ladder,auth.uid(),auth.uid());
  for phase in select * from public.lifecycle_phases where lifecycle_id=source_lifecycle order by sequence loop new_phase:=gen_random_uuid(); phase_map:=phase_map||jsonb_build_object(phase.id::text,new_phase); insert into public.lifecycle_phases(id,lifecycle_id,name,description,sequence,created_by,updated_by) values(new_phase,new_id,phase.name,phase.description,phase.sequence,auth.uid(),auth.uid()); end loop;
  for stage in select * from public.lifecycle_stages where lifecycle_id=source_lifecycle order by sequence loop new_stage:=gen_random_uuid(); stage_map:=stage_map||jsonb_build_object(stage.id::text,new_stage); insert into public.lifecycle_stages(id,lifecycle_id,phase_id,name,stage_number,sequence,purpose,activities,entry_criteria,exit_criteria,accountable_owner_id,accountable_owner_name,system_of_record,success_metric,known_gaps,metadata,created_by,updated_by) values(new_stage,new_id,(phase_map->>stage.phase_id::text)::uuid,stage.name,stage.stage_number,stage.sequence,stage.purpose,stage.activities,stage.entry_criteria,stage.exit_criteria,stage.accountable_owner_id,stage.accountable_owner_name,stage.system_of_record,stage.success_metric,stage.known_gaps,stage.metadata,auth.uid(),auth.uid()); end loop;
  update public.lifecycle_stages n set parent_stage_id=(stage_map->>o.parent_stage_id::text)::uuid from public.lifecycle_stages o where o.lifecycle_id=source_lifecycle and o.parent_stage_id is not null and n.id=(stage_map->>o.id::text)::uuid;
  for connection in select * from public.lifecycle_connections where lifecycle_id=source_lifecycle loop insert into public.lifecycle_connections(lifecycle_id,from_stage_id,to_stage_id,connection_type,label,metadata,created_by,updated_by) values(new_id,(stage_map->>connection.from_stage_id::text)::uuid,(stage_map->>connection.to_stage_id::text)::uuid,connection.connection_type,connection.label,connection.metadata,auth.uid(),auth.uid()); end loop;
  insert into public.lifecycle_viewers(lifecycle_id,viewer_type,user_id,department,created_by) select new_id,viewer_type,user_id,department,auth.uid() from public.lifecycle_viewers where lifecycle_id=source_lifecycle;
  return new_id;
end $$;
revoke all on function public.create_lifecycle_version(uuid) from public;
grant execute on function public.create_lifecycle_version(uuid) to authenticated;

create or replace function public.delete_lifecycle_stage(target_stage uuid,confirm_active_mappings boolean default false)
returns void language plpgsql security definer set search_path=public as $$
declare active_count integer; target_lifecycle uuid;
begin
  if not public.is_active_admin() then raise exception 'Active Admin access is required.'; end if;
  select lifecycle_id into target_lifecycle from public.lifecycle_stages where id=target_stage;
  select count(*) into active_count from public.resource_lifecycle_mappings m join public.agents a on a.id=m.resource_id where m.stage_id=target_stage and a.status<>'retired';
  if active_count>0 and not confirm_active_mappings then raise exception 'This stage has % active resource mapping(s). Remap them or explicitly confirm the change.',active_count; end if;
  if confirm_active_mappings then delete from public.resource_lifecycle_mappings where stage_id=target_stage; end if;
  delete from public.lifecycle_connections where from_stage_id=target_stage or to_stage_id=target_stage;
  update public.lifecycle_stages set parent_stage_id=null where parent_stage_id=target_stage;
  delete from public.lifecycle_stages where id=target_stage;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'lifecycle_stage_deleted','lifecycle_stages',target_stage::text,jsonb_build_object('lifecycle_id',target_lifecycle,'active_mappings',active_count,'confirmed',confirm_active_mappings));
end $$;
revoke all on function public.delete_lifecycle_stage(uuid,boolean) from public;
grant execute on function public.delete_lifecycle_stage(uuid,boolean) to authenticated;

create or replace function public.set_lifecycle_status(target_lifecycle uuid,target_status text)
returns void language plpgsql security definer set search_path=public as $$ begin
  if not public.is_active_admin() then raise exception 'Active Admin access is required.'; end if;
  if target_status not in ('draft','active','archived') then raise exception 'Unsupported lifecycle status.'; end if;
  update public.operational_lifecycles set status=target_status,published_at=case when target_status='active' then coalesce(published_at,now()) else published_at end,updated_by=auth.uid() where id=target_lifecycle;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'lifecycle_status_changed','operational_lifecycles',target_lifecycle::text,jsonb_build_object('status',target_status));
end $$;
revoke all on function public.set_lifecycle_status(uuid,text) from public;
grant execute on function public.set_lifecycle_status(uuid,text) to authenticated;
notify pgrst, 'reload schema';
