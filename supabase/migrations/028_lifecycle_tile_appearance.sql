-- Persist opt-in lifecycle tile dimensions and colors without changing existing tiles.
alter table public.lifecycle_stages
  add column if not exists visual_width double precision,
  add column if not exists visual_height double precision,
  add column if not exists background_color text,
  add column if not exists border_color text,
  add column if not exists text_color text;

alter table public.lifecycle_phases
  add column if not exists visual_width double precision,
  add column if not exists visual_height double precision,
  add column if not exists background_color text,
  add column if not exists border_color text,
  add column if not exists text_color text;

alter table public.lifecycle_stages
  add constraint lifecycle_stages_visual_width_check check (visual_width is null or visual_width between 200 and 600),
  add constraint lifecycle_stages_visual_height_check check (visual_height is null or visual_height between 110 and 400),
  add constraint lifecycle_stages_background_color_check check (background_color is null or background_color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint lifecycle_stages_border_color_check check (border_color is null or border_color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint lifecycle_stages_text_color_check check (text_color is null or text_color ~ '^#[0-9A-Fa-f]{6}$');

alter table public.lifecycle_phases
  add constraint lifecycle_phases_visual_width_check check (visual_width is null or visual_width between 280 and 1200),
  add constraint lifecycle_phases_visual_height_check check (visual_height is null or visual_height between 120 and 900),
  add constraint lifecycle_phases_background_color_check check (background_color is null or background_color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint lifecycle_phases_border_color_check check (border_color is null or border_color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint lifecycle_phases_text_color_check check (text_color is null or text_color ~ '^#[0-9A-Fa-f]{6}$');

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
    insert into public.lifecycle_phases(id,lifecycle_id,name,description,objective,sequence,accountable_owner_id,accountable_owner_name,visual_label,collapsed,position_x,position_y,visual_width,visual_height,background_color,border_color,text_color,suggestion_source,created_by,updated_by)
    values(new_phase,new_id,phase.name,phase.description,phase.objective,phase.sequence,phase.accountable_owner_id,phase.accountable_owner_name,phase.visual_label,phase.collapsed,phase.position_x,phase.position_y,phase.visual_width,phase.visual_height,phase.background_color,phase.border_color,phase.text_color,phase.suggestion_source,auth.uid(),auth.uid());
  end loop;
  for stage in select * from public.lifecycle_stages where lifecycle_id=source_lifecycle order by sequence loop
    new_stage:=gen_random_uuid(); stage_map:=stage_map||jsonb_build_object(stage.id::text,new_stage);
    insert into public.lifecycle_stages(id,lifecycle_id,phase_id,name,stage_number,sequence,purpose,activities,entry_criteria,exit_criteria,accountable_owner_id,accountable_owner_name,supporting_team,system_of_record,success_metric,known_gaps,notes,stage_status,position_x,position_y,visual_width,visual_height,background_color,border_color,text_color,suggestion_source,metadata,created_by,updated_by)
    values(new_stage,new_id,case when stage.phase_id is null then null else (phase_map->>stage.phase_id::text)::uuid end,stage.name,stage.stage_number,stage.sequence,stage.purpose,stage.activities,stage.entry_criteria,stage.exit_criteria,stage.accountable_owner_id,stage.accountable_owner_name,stage.supporting_team,stage.system_of_record,stage.success_metric,stage.known_gaps,stage.notes,stage.stage_status,stage.position_x,stage.position_y,stage.visual_width,stage.visual_height,stage.background_color,stage.border_color,stage.text_color,stage.suggestion_source,stage.metadata,auth.uid(),auth.uid());
  end loop;
  update public.lifecycle_stages n set parent_stage_id=(stage_map->>o.parent_stage_id::text)::uuid from public.lifecycle_stages o where o.lifecycle_id=source_lifecycle and o.parent_stage_id is not null and n.id=(stage_map->>o.id::text)::uuid;
  for connection in select * from public.lifecycle_connections where lifecycle_id=source_lifecycle loop insert into public.lifecycle_connections(lifecycle_id,from_stage_id,to_stage_id,connection_type,label,description,condition,sequence,repeat_confirmed,suggestion_source,metadata,created_by,updated_by) values(new_id,(stage_map->>connection.from_stage_id::text)::uuid,(stage_map->>connection.to_stage_id::text)::uuid,connection.connection_type,connection.label,connection.description,connection.condition,connection.sequence,connection.repeat_confirmed,connection.suggestion_source,connection.metadata,auth.uid(),auth.uid()); end loop;
  for mapping in select * from public.resource_lifecycle_mappings where lifecycle_id=source_lifecycle loop insert into public.resource_lifecycle_mappings(resource_id,lifecycle_id,stage_id,mapping_source,relationship_type,alignment_status,confidence,explanation,admin_notes,approved_by,approved_at,created_by,updated_by) values(mapping.resource_id,new_id,(stage_map->>mapping.stage_id::text)::uuid,mapping.mapping_source,mapping.relationship_type,mapping.alignment_status,mapping.confidence,mapping.explanation,mapping.admin_notes,mapping.approved_by,mapping.approved_at,auth.uid(),auth.uid()); end loop;
  for viewer in select * from public.lifecycle_viewers where lifecycle_id=source_lifecycle loop insert into public.lifecycle_viewers(lifecycle_id,viewer_type,user_id,department,created_by) values(new_id,viewer.viewer_type,viewer.user_id,viewer.department,auth.uid()); end loop;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'lifecycle_version_created','operational_lifecycles',new_id::text,jsonb_build_object('source_lifecycle',source_lifecycle,'version',(select version from public.operational_lifecycles where id=new_id)));
  return new_id;
end $$;

grant execute on function public.create_lifecycle_version(uuid) to authenticated;
