-- Visual lifecycle builder, direct creation, publishing, versioning, and tenant-safe access.
-- Additive and idempotent; preserves all lifecycle records and mappings from migrations 019-020.
alter table public.profiles add column if not exists tenant_key text not null default 'lead-ventures';
alter table public.operational_lifecycles add column if not exists tenant_key text not null default 'lead-ventures';
alter table public.operational_lifecycles add column if not exists business_objective text;
alter table public.operational_lifecycles add column if not exists published_by uuid references public.profiles(id) on delete set null;
alter table public.operational_lifecycles add column if not exists change_summary text;
alter table public.operational_lifecycles add column if not exists canvas_settings jsonb not null default '{}'::jsonb;
alter table public.lifecycle_phases add column if not exists objective text;
alter table public.lifecycle_phases add column if not exists accountable_owner_id uuid references public.profiles(id) on delete set null;
alter table public.lifecycle_phases add column if not exists accountable_owner_name text;
alter table public.lifecycle_phases add column if not exists visual_label text;
alter table public.lifecycle_phases add column if not exists collapsed boolean not null default false;
alter table public.lifecycle_phases add column if not exists position_x numeric not null default 0;
alter table public.lifecycle_phases add column if not exists position_y numeric not null default 0;
alter table public.lifecycle_phases add column if not exists suggestion_source text;
alter table public.lifecycle_stages add column if not exists supporting_team text;
alter table public.lifecycle_stages add column if not exists notes text;
alter table public.lifecycle_stages add column if not exists stage_status text not null default 'active';
alter table public.lifecycle_stages add column if not exists position_x numeric not null default 0;
alter table public.lifecycle_stages add column if not exists position_y numeric not null default 0;
alter table public.lifecycle_stages add column if not exists suggestion_source text;
alter table public.lifecycle_connections add column if not exists description text;
alter table public.lifecycle_connections add column if not exists condition text;
alter table public.lifecycle_connections add column if not exists sequence integer not null default 1;
alter table public.lifecycle_connections add column if not exists repeat_confirmed boolean not null default false;
alter table public.lifecycle_connections add column if not exists suggestion_source text;
alter table public.resource_lifecycle_mappings add column if not exists relationship_type text not null default 'supports';

update public.operational_lifecycles set status='published' where status='active';
update public.operational_lifecycles lifecycle set status='draft',published_at=null,published_by=null
where lifecycle.name ilike '%focusquest%' and (select count(*) from public.lifecycle_stages stage where stage.lifecycle_id=lifecycle.id)=1
  and exists(select 1 from public.lifecycle_stages stage where stage.lifecycle_id=lifecycle.id and lower(stage.name)=lower('Acquire the Institution'));
update public.operational_lifecycles set business_objective=coalesce(nullif(description,''),'Document how work moves through this company operation.') where business_objective is null;
alter table public.operational_lifecycles drop constraint if exists operational_lifecycles_status_check;
alter table public.operational_lifecycles add constraint operational_lifecycles_status_check check(status in ('draft','published','archived'));
alter table public.lifecycle_connections drop constraint if exists lifecycle_connections_connection_type_check;
alter table public.lifecycle_connections add constraint lifecycle_connections_connection_type_check check(connection_type in ('next','feedback','loop','conditional','nested','supporting'));
alter table public.resource_lifecycle_mappings drop constraint if exists resource_lifecycle_mappings_relationship_type_check;
alter table public.resource_lifecycle_mappings add constraint resource_lifecycle_mappings_relationship_type_check check(relationship_type in ('performs','supports','automates','provides_data','receives_data','planned'));
create index if not exists lifecycle_tenant_company_status_idx on public.operational_lifecycles(tenant_key,company_id,status,updated_at desc);
create index if not exists lifecycle_phase_position_idx on public.lifecycle_phases(lifecycle_id,sequence,position_x,position_y);
create index if not exists lifecycle_stage_position_idx on public.lifecycle_stages(lifecycle_id,phase_id,position_x,position_y);
create index if not exists lifecycle_mapping_relationship_idx on public.resource_lifecycle_mappings(lifecycle_id,stage_id,relationship_type);

create or replace function public.can_manage_lifecycle(target_lifecycle uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.operational_lifecycles l join public.profiles p on p.id=auth.uid()
    where l.id=target_lifecycle and p.status='active' and p.role='admin' and p.tenant_key=l.tenant_key);
$$;
grant execute on function public.can_manage_lifecycle(uuid) to authenticated;

create or replace function public.can_access_lifecycle(target_lifecycle uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.operational_lifecycles l join public.profiles p on p.id=auth.uid() and p.status='active' and p.tenant_key=l.tenant_key
    where l.id=target_lifecycle and (p.role='admin' or (l.status='published' and (
      l.access_scope='entire_tenant' or (l.access_scope='entire_company' and p.company_id=l.company_id)
      or (l.access_scope='selected_individuals' and exists(select 1 from public.lifecycle_viewers v join public.profiles selected on selected.id=v.user_id and selected.status='active' where v.lifecycle_id=l.id and v.viewer_type='user' and v.user_id=auth.uid()))
      or (l.access_scope='selected_departments' and exists(select 1 from public.lifecycle_viewers v where v.lifecycle_id=l.id and v.viewer_type='department' and lower(v.department)=lower(p.department)))
    ))));
$$;

drop policy if exists "admins manage lifecycles" on public.operational_lifecycles;
drop policy if exists "tenant admins manage lifecycles" on public.operational_lifecycles;
create policy "tenant admins manage lifecycles" on public.operational_lifecycles for all to authenticated using(public.can_manage_lifecycle(id)) with check(exists(select 1 from public.profiles p where p.id=auth.uid() and p.status='active' and p.role='admin' and p.tenant_key=operational_lifecycles.tenant_key));
drop policy if exists "admins manage phases" on public.lifecycle_phases;
drop policy if exists "tenant admins manage phases" on public.lifecycle_phases;
create policy "tenant admins manage phases" on public.lifecycle_phases for all to authenticated using(public.can_manage_lifecycle(lifecycle_id)) with check(public.can_manage_lifecycle(lifecycle_id));
drop policy if exists "admins manage stages" on public.lifecycle_stages;
drop policy if exists "tenant admins manage stages" on public.lifecycle_stages;
create policy "tenant admins manage stages" on public.lifecycle_stages for all to authenticated using(public.can_manage_lifecycle(lifecycle_id)) with check(public.can_manage_lifecycle(lifecycle_id));
drop policy if exists "admins manage connections" on public.lifecycle_connections;
drop policy if exists "tenant admins manage connections" on public.lifecycle_connections;
create policy "tenant admins manage connections" on public.lifecycle_connections for all to authenticated using(public.can_manage_lifecycle(lifecycle_id)) with check(public.can_manage_lifecycle(lifecycle_id));
drop policy if exists "admins manage lifecycle viewers" on public.lifecycle_viewers;
drop policy if exists "tenant admins manage lifecycle viewers" on public.lifecycle_viewers;
create policy "tenant admins manage lifecycle viewers" on public.lifecycle_viewers for all to authenticated using(public.can_manage_lifecycle(lifecycle_id)) with check(public.can_manage_lifecycle(lifecycle_id));
drop policy if exists "admins read lifecycle viewers" on public.lifecycle_viewers;
drop policy if exists "tenant authorized read lifecycle viewers" on public.lifecycle_viewers;
create policy "tenant authorized read lifecycle viewers" on public.lifecycle_viewers for select to authenticated using(public.can_manage_lifecycle(lifecycle_id) or user_id=auth.uid());
drop policy if exists "resource managers create lifecycle mappings" on public.resource_lifecycle_mappings;
drop policy if exists "tenant admins or resource managers create lifecycle mappings" on public.resource_lifecycle_mappings;
create policy "tenant admins or resource managers create lifecycle mappings" on public.resource_lifecycle_mappings for insert to authenticated with check(created_by=auth.uid() and (public.can_manage_lifecycle(lifecycle_id) or (public.can_manage_agent(resource_id) and public.can_access_lifecycle(lifecycle_id))));
drop policy if exists "admins or resource managers update lifecycle mappings" on public.resource_lifecycle_mappings;
drop policy if exists "tenant admins or resource managers update lifecycle mappings" on public.resource_lifecycle_mappings;
create policy "tenant admins or resource managers update lifecycle mappings" on public.resource_lifecycle_mappings for update to authenticated using(public.can_manage_lifecycle(lifecycle_id) or (public.can_manage_agent(resource_id) and public.can_access_lifecycle(lifecycle_id))) with check(public.can_manage_lifecycle(lifecycle_id) or (public.can_manage_agent(resource_id) and public.can_access_lifecycle(lifecycle_id)));
drop policy if exists "admins or resource managers delete lifecycle mappings" on public.resource_lifecycle_mappings;
drop policy if exists "tenant admins or resource managers delete lifecycle mappings" on public.resource_lifecycle_mappings;
create policy "tenant admins or resource managers delete lifecycle mappings" on public.resource_lifecycle_mappings for delete to authenticated using(public.can_manage_lifecycle(lifecycle_id) or (public.can_manage_agent(resource_id) and public.can_access_lifecycle(lifecycle_id)));

create or replace function public.create_operational_lifecycle(target_company uuid,target_name text,target_objective text,target_description text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare lifecycle_id uuid:=gen_random_uuid(); tenant text;
begin
  select tenant_key into tenant from public.profiles where id=auth.uid() and status='active' and role='admin';
  if tenant is null then raise exception 'Active Admin access is required.'; end if;
  if target_company is null then raise exception 'Select a company.'; end if;
  if nullif(trim(target_name),'') is null then raise exception 'Enter a lifecycle name.'; end if;
  if nullif(trim(target_objective),'') is null then raise exception 'Enter a business objective.'; end if;
  if not exists(select 1 from public.companies where id=target_company and status='active') then raise exception 'Select an active company.'; end if;
  insert into public.operational_lifecycles(id,lineage_id,tenant_key,company_id,name,business_objective,description,status,access_scope,created_by,updated_by)
  values(lifecycle_id,lifecycle_id,tenant,target_company,trim(target_name),trim(target_objective),nullif(trim(target_description),''),'draft','admins_only',auth.uid(),auth.uid());
  insert into public.audit_log(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'lifecycle_created','operational_lifecycles',lifecycle_id::text,jsonb_build_object('company_id',target_company,'creation_method','direct'));
  return lifecycle_id;
end $$;
grant execute on function public.create_operational_lifecycle(uuid,text,text,text) to authenticated;

create or replace function public.publish_operational_lifecycle(target_lifecycle uuid,target_change_summary text default null)
returns void language plpgsql security definer set search_path=public as $$
declare item public.operational_lifecycles%rowtype;
begin
  if not public.can_manage_lifecycle(target_lifecycle) then raise exception 'Active tenant Admin access is required.'; end if;
  select * into item from public.operational_lifecycles where id=target_lifecycle for update;
  if item.company_id is null or nullif(trim(item.name),'') is null or nullif(trim(item.business_objective),'') is null then raise exception 'A company, name, and business objective are required before publishing.'; end if;
  if not exists(select 1 from public.lifecycle_stages where lifecycle_id=target_lifecycle) then raise exception 'Add at least one stage before publishing.'; end if;
  update public.operational_lifecycles set status='archived',updated_by=auth.uid() where lineage_id=item.lineage_id and status='published' and id<>target_lifecycle;
  update public.operational_lifecycles set status='published',published_at=now(),published_by=auth.uid(),change_summary=nullif(trim(target_change_summary),''),updated_by=auth.uid() where id=target_lifecycle;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'lifecycle_published','operational_lifecycles',target_lifecycle::text,jsonb_build_object('version',item.version));
end $$;
grant execute on function public.publish_operational_lifecycle(uuid,text) to authenticated;

create or replace function public.create_lifecycle_version(source_lifecycle uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare source public.operational_lifecycles%rowtype; new_id uuid:=gen_random_uuid(); phase record; stage record; connection record; mapping record; viewer record; new_phase uuid; new_stage uuid; phase_map jsonb:='{}'; stage_map jsonb:='{}';
begin
  if not public.can_manage_lifecycle(source_lifecycle) then raise exception 'Active tenant Admin access is required.'; end if;
  select * into source from public.operational_lifecycles where id=source_lifecycle for update; if not found then raise exception 'Lifecycle not found.'; end if;
  insert into public.operational_lifecycles(id,lineage_id,tenant_key,company_id,name,business_objective,description,lifecycle_type,version,status,access_scope,tier_ladder,canvas_settings,change_summary,created_by,updated_by)
  values(new_id,source.lineage_id,source.tenant_key,source.company_id,source.name,source.business_objective,source.description,source.lifecycle_type,(select coalesce(max(version),0)+1 from public.operational_lifecycles where lineage_id=source.lineage_id),'draft',source.access_scope,source.tier_ladder,source.canvas_settings,null,auth.uid(),auth.uid());
  for phase in select * from public.lifecycle_phases where lifecycle_id=source_lifecycle order by sequence loop
    new_phase:=gen_random_uuid(); phase_map:=phase_map||jsonb_build_object(phase.id::text,new_phase);
    insert into public.lifecycle_phases(id,lifecycle_id,name,description,objective,sequence,accountable_owner_id,accountable_owner_name,visual_label,collapsed,position_x,position_y,suggestion_source,created_by,updated_by)
    values(new_phase,new_id,phase.name,phase.description,phase.objective,phase.sequence,phase.accountable_owner_id,phase.accountable_owner_name,phase.visual_label,phase.collapsed,phase.position_x,phase.position_y,phase.suggestion_source,auth.uid(),auth.uid());
  end loop;
  for stage in select * from public.lifecycle_stages where lifecycle_id=source_lifecycle order by sequence loop
    new_stage:=gen_random_uuid(); stage_map:=stage_map||jsonb_build_object(stage.id::text,new_stage);
    insert into public.lifecycle_stages(id,lifecycle_id,phase_id,name,stage_number,sequence,purpose,activities,entry_criteria,exit_criteria,accountable_owner_id,accountable_owner_name,supporting_team,system_of_record,success_metric,known_gaps,notes,stage_status,position_x,position_y,suggestion_source,metadata,created_by,updated_by)
    values(new_stage,new_id,case when stage.phase_id is null then null else (phase_map->>stage.phase_id::text)::uuid end,stage.name,stage.stage_number,stage.sequence,stage.purpose,stage.activities,stage.entry_criteria,stage.exit_criteria,stage.accountable_owner_id,stage.accountable_owner_name,stage.supporting_team,stage.system_of_record,stage.success_metric,stage.known_gaps,stage.notes,stage.stage_status,stage.position_x,stage.position_y,stage.suggestion_source,stage.metadata,auth.uid(),auth.uid());
  end loop;
  update public.lifecycle_stages n set parent_stage_id=(stage_map->>o.parent_stage_id::text)::uuid from public.lifecycle_stages o where o.lifecycle_id=source_lifecycle and o.parent_stage_id is not null and n.id=(stage_map->>o.id::text)::uuid;
  for connection in select * from public.lifecycle_connections where lifecycle_id=source_lifecycle loop insert into public.lifecycle_connections(lifecycle_id,from_stage_id,to_stage_id,connection_type,label,description,condition,sequence,repeat_confirmed,suggestion_source,metadata,created_by,updated_by) values(new_id,(stage_map->>connection.from_stage_id::text)::uuid,(stage_map->>connection.to_stage_id::text)::uuid,connection.connection_type,connection.label,connection.description,connection.condition,connection.sequence,connection.repeat_confirmed,connection.suggestion_source,connection.metadata,auth.uid(),auth.uid()); end loop;
  for mapping in select * from public.resource_lifecycle_mappings where lifecycle_id=source_lifecycle loop insert into public.resource_lifecycle_mappings(resource_id,lifecycle_id,stage_id,mapping_source,relationship_type,alignment_status,confidence,explanation,admin_notes,approved_by,approved_at,created_by,updated_by) values(mapping.resource_id,new_id,(stage_map->>mapping.stage_id::text)::uuid,mapping.mapping_source,mapping.relationship_type,mapping.alignment_status,mapping.confidence,mapping.explanation,mapping.admin_notes,mapping.approved_by,mapping.approved_at,auth.uid(),auth.uid()); end loop;
  for viewer in select * from public.lifecycle_viewers where lifecycle_id=source_lifecycle loop insert into public.lifecycle_viewers(lifecycle_id,viewer_type,user_id,department,created_by) values(new_id,viewer.viewer_type,viewer.user_id,viewer.department,auth.uid()); end loop;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'lifecycle_version_created','operational_lifecycles',new_id::text,jsonb_build_object('source_lifecycle',source_lifecycle,'version',(select version from public.operational_lifecycles where id=new_id)));
  return new_id;
end $$;
grant execute on function public.create_lifecycle_version(uuid) to authenticated;

create or replace function public.delete_lifecycle_phase(target_phase uuid,delete_stages boolean default false)
returns void language plpgsql security definer set search_path=public as $$
declare target_lifecycle uuid; stage_count integer;
begin
  select lifecycle_id into target_lifecycle from public.lifecycle_phases where id=target_phase;
  if target_lifecycle is null or not public.can_manage_lifecycle(target_lifecycle) then raise exception 'Active tenant Admin access is required.'; end if;
  select count(*) into stage_count from public.lifecycle_stages where phase_id=target_phase;
  if stage_count>0 and not delete_stages then raise exception 'Move the stages elsewhere or confirm deletion of the phase and its stages.'; end if;
  if delete_stages then delete from public.lifecycle_stages where phase_id=target_phase; end if;
  delete from public.lifecycle_phases where id=target_phase;
end $$;
grant execute on function public.delete_lifecycle_phase(uuid,boolean) to authenticated;

create or replace function public.save_lifecycle_access(target_lifecycle uuid,target_scope text,target_users uuid[] default '{}',target_departments text[] default '{}')
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.can_manage_lifecycle(target_lifecycle) then raise exception 'Active tenant Admin access is required.'; end if;
  if target_scope not in ('admins_only','entire_tenant','entire_company','selected_departments','selected_individuals') then raise exception 'Select a valid lifecycle access scope.'; end if;
  if target_scope='selected_individuals' and exists(select 1 from unnest(target_users) id left join public.profiles p on p.id=id where p.id is null or p.status<>'active') then raise exception 'One or more selected users are no longer active.'; end if;
  update public.operational_lifecycles set access_scope=target_scope,updated_by=auth.uid() where id=target_lifecycle;
  delete from public.lifecycle_viewers where lifecycle_id=target_lifecycle;
  if target_scope='selected_individuals' then insert into public.lifecycle_viewers(lifecycle_id,viewer_type,user_id,created_by) select target_lifecycle,'user',id,auth.uid() from unnest(target_users) id; end if;
  if target_scope='selected_departments' then insert into public.lifecycle_viewers(lifecycle_id,viewer_type,department,created_by) select target_lifecycle,'department',trim(department),auth.uid() from unnest(target_departments) department where nullif(trim(department),'') is not null; end if;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'lifecycle_access_updated','operational_lifecycles',target_lifecycle::text,jsonb_build_object('scope',target_scope,'users',target_users,'departments',target_departments));
end $$;
grant execute on function public.save_lifecycle_access(uuid,text,uuid[],text[]) to authenticated;

create or replace function public.apply_lifecycle_suggestion(target_lifecycle uuid,target_proposal jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare phase jsonb; stage jsonb; connection jsonb; phase_id uuid; stage_id uuid; phase_map jsonb:='{}'; stage_map jsonb:='{}'; next_phase integer; next_stage integer;
begin
  if not public.can_manage_lifecycle(target_lifecycle) then raise exception 'Active tenant Admin access is required.'; end if;
  if (select status from public.operational_lifecycles where id=target_lifecycle)<>'draft' then raise exception 'AI suggestions can only be added to a draft.'; end if;
  select coalesce(max(sequence),0)+1 into next_phase from public.lifecycle_phases where lifecycle_id=target_lifecycle;
  for phase in select value from jsonb_array_elements(coalesce(target_proposal->'phases','[]')) loop
    if nullif(trim(phase->>'name'),'') is not null and not exists(select 1 from public.lifecycle_phases where lifecycle_id=target_lifecycle and lower(name)=lower(phase->>'name')) then
      phase_id:=gen_random_uuid(); phase_map:=phase_map||jsonb_build_object(phase->>'name',phase_id);
      insert into public.lifecycle_phases(id,lifecycle_id,name,objective,description,sequence,position_x,position_y,suggestion_source,created_by,updated_by) values(phase_id,target_lifecycle,trim(phase->>'name'),nullif(trim(phase->>'objective'),''),nullif(trim(phase->>'description'),''),next_phase,next_phase*40,next_phase*30,'ai',auth.uid(),auth.uid()); next_phase:=next_phase+1;
    end if;
  end loop;
  select coalesce(max(sequence),0)+1 into next_stage from public.lifecycle_stages where lifecycle_id=target_lifecycle;
  for stage in select value from jsonb_array_elements(coalesce(target_proposal->'stages','[]')) loop
    if nullif(trim(stage->>'name'),'') is not null and not exists(select 1 from public.lifecycle_stages where lifecycle_id=target_lifecycle and lower(name)=lower(stage->>'name')) then
      stage_id:=gen_random_uuid(); stage_map:=stage_map||jsonb_build_object(stage->>'name',stage_id);
      select id into phase_id from public.lifecycle_phases where lifecycle_id=target_lifecycle and lower(name)=lower(stage->>'phase') limit 1;
      insert into public.lifecycle_stages(id,lifecycle_id,phase_id,name,sequence,purpose,activities,entry_criteria,exit_criteria,position_x,position_y,suggestion_source,metadata,created_by,updated_by) values(stage_id,target_lifecycle,phase_id,trim(stage->>'name'),next_stage,nullif(trim(stage->>'purpose'),''),coalesce(stage->'activities','[]'),nullif(trim(stage->>'entry_criteria'),''),nullif(trim(stage->>'exit_criteria'),''),next_stage*250,120,'ai',jsonb_build_object('ai_suggestion',true),auth.uid(),auth.uid()); next_stage:=next_stage+1;
    end if;
  end loop;
  for connection in select value from jsonb_array_elements(coalesce(target_proposal->'connections','[]')) loop
    insert into public.lifecycle_connections(lifecycle_id,from_stage_id,to_stage_id,connection_type,label,description,condition,sequence,suggestion_source,metadata,created_by,updated_by)
    select target_lifecycle,source.id,target.id,case when connection->>'type' in ('next','feedback','conditional','nested','supporting') then connection->>'type' else 'next' end,nullif(trim(connection->>'label'),''),nullif(trim(connection->>'description'),''),nullif(trim(connection->>'condition'),''),coalesce(nullif(connection->>'sequence','')::integer,1),'ai',jsonb_build_object('ai_suggestion',true),auth.uid(),auth.uid()
    from public.lifecycle_stages source,public.lifecycle_stages target where source.lifecycle_id=target_lifecycle and target.lifecycle_id=target_lifecycle and lower(source.name)=lower(connection->>'source') and lower(target.name)=lower(connection->>'target') on conflict do nothing;
  end loop;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'lifecycle_ai_suggestion_applied','operational_lifecycles',target_lifecycle::text,jsonb_build_object('reviewed_by',auth.uid()));
end $$;
grant execute on function public.apply_lifecycle_suggestion(uuid,jsonb) to authenticated;
notify pgrst, 'reload schema';
