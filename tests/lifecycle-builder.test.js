import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { autoArrangeLifecycle, classifyLifecycleStructure, lifecycleListGroups, lifecycleRouteState, lifecycleSummary, normalizeLifecycleData, validateConnection } from "../src/lifecycleModel.js";

const stages = [{id:"s1",name:"Discover",sequence:1},{id:"s2",name:"Join",sequence:2},{id:"s3",name:"Engage",sequence:3}];

test("stages-only and phased lifecycle structures classify automatically", () => {
  assert.equal(classifyLifecycleStructure([], stages, [{from_stage_id:"s1",to_stage_id:"s2",connection_type:"next"}]), "linear");
  assert.equal(classifyLifecycleStructure([{id:"p1",sequence:1}], [{...stages[0],phase_id:"p1"}], []), "phased");
});

test("nested, circular, and mixed lifecycle structures classify automatically", () => {
  assert.equal(classifyLifecycleStructure([], [{...stages[0],parent_stage_id:"parent"}], []), "nested");
  assert.equal(classifyLifecycleStructure([], stages, [{from_stage_id:"s3",to_stage_id:"s1",connection_type:"feedback"}]), "circular");
  assert.equal(classifyLifecycleStructure([{id:"p1"}], [{...stages[0],parent_stage_id:"parent"}], []), "hybrid");
});

test("moving stages between optional phases changes accessible grouping", () => {
  const phases=[{id:"p1",sequence:1,name:"Acquire"},{id:"p2",sequence:2,name:"Deliver"}];
  const before=lifecycleListGroups(phases,[{...stages[0],phase_id:"p1"}]);
  const after=lifecycleListGroups(phases,[{...stages[0],phase_id:"p2"}]);
  assert.equal(before[0].stages.length,1); assert.equal(after[1].stages.length,1);
});

test("feedback is valid while duplicate and accidental self-connections are prevented", () => {
  const existing=[{from_stage_id:"s1",to_stage_id:"s2",connection_type:"next"}];
  assert.equal(validateConnection(existing,"s2","s1","feedback").valid,true);
  assert.equal(validateConnection(existing,"s1","s2","next").valid,false);
  assert.equal(validateConnection(existing,"s1","s1","feedback").valid,false);
  assert.equal(validateConnection(existing,"s1","s1","feedback",true).valid,true);
});

test("automatic layout returns stable, non-overlapping stage positions and phase positions", () => {
  const phases=[{id:"p1",sequence:1}], phased=stages.map((stage)=>({...stage,phase_id:"p1"}));
  const positions=autoArrangeLifecycle(phases,phased,[{from_stage_id:"s1",to_stage_id:"s2"},{from_stage_id:"s2",to_stage_id:"s3"}]);
  assert.ok(positions.p1); assert.equal(new Set(phased.map((stage)=>`${positions[stage.id].x}:${positions[stage.id].y}`)).size,3);
});

test("summary maps every resource type and identifies supported stages and gaps", () => {
  const resources=["agent","skillset","platform","product"].map((entry_type,index)=>({id:`r${index}`,entry_type,name:`${entry_type} ${index}`,description:`Unique ${entry_type} capability`,status:"approved"}));
  const mappings=resources.map((resource)=>({resource_id:resource.id,stage_id:"s1"}));
  const summary=lifecycleSummary([],stages,mappings,resources);
  assert.equal(summary.mappedResources,4);assert.equal(summary.supportedStages,1);assert.equal(summary.gaps,2);
});

test("accessible list includes phased and unphased stages", () => {
  const groups=lifecycleListGroups([{id:"p1",name:"Phase",sequence:1}],[{...stages[0],phase_id:"p1"},stages[1]]);
  assert.equal(groups.length,2);assert.equal(groups[0].stages[0].id,"s1");assert.equal(groups[1].stages[0].id,"s2");
});

test("migration preserves legacy data and supports positions, publishing, access, version copies, and tenant isolation", () => {
  const sql=readFileSync(new URL("../supabase/migrations/024_operational_lifecycle_builder.sql",import.meta.url),"utf8");
  assert.match(sql,/update public\.operational_lifecycles set status='published' where status='active'/);
  for(const field of ["position_x","position_y","business_objective","relationship_type","published_by","change_summary"])assert.match(sql,new RegExp(field));
  assert.match(sql,/A company, name, and business objective are required before publishing/);
  assert.match(sql,/Add at least one stage before publishing/);
  assert.match(sql,/status='archived'/);
  assert.match(sql,/p\.tenant_key=l\.tenant_key/);
  assert.match(sql,/save_lifecycle_access/);
  assert.match(sql,/mapping in select \* from public\.resource_lifecycle_mappings/);
  assert.match(sql,/viewer in select \* from public\.lifecycle_viewers/);
  assert.match(sql,/apply_lifecycle_suggestion/);
});

test("AI endpoint fails gracefully and never publishes lifecycle suggestions", () => {
  const source=readFileSync(new URL("../netlify/functions/lifecycle-suggest.mjs",import.meta.url),"utf8");
  assert.match(source,/manual visual builder/);
  assert.doesNotMatch(source,/publish_operational_lifecycle/);
  assert.match(source,/editable, unapproved, and never published automatically/);
});

test("admin builder exposes preview, archive, resource mapping, and accessible controls without templates", () => {
  const source=readFileSync(new URL("../src/LifecycleWorkspace.jsx",import.meta.url),"utf8");
  for(const control of ["Auto-arrange","Save draft","Preview","Publish","Accessible list","Create new version","Resource mappings"])assert.match(source,new RegExp(control));
  assert.doesNotMatch(source,/template picker|Start from|FocusQuest starter template|D9 Network starter template/);
});

test("admin route distinguishes empty, loading, missing tenant, request failure, and unauthorized states", () => {
  const base = { mode:"admin", isAdmin:true, tenantKey:"tenant-1", lifecycles:[] };
  assert.equal(lifecycleRouteState(base), "empty");
  assert.equal(lifecycleRouteState({...base, tenantLoading:true}), "tenant_loading");
  assert.equal(lifecycleRouteState({...base, tenantKey:""}), "tenant_unavailable");
  assert.equal(lifecycleRouteState({...base, loadError:"request failed"}), "data_error");
  assert.equal(lifecycleRouteState({...base, isAdmin:false}), "unauthorized");
});

test("authorized simple lifecycle retains its stages when it has no phases", () => {
  const result = normalizeLifecycleData({
    lifecycles:[{id:"l1",tenant_key:"tenant-1",description:null}],
    phases:[],
    stages:[{id:"s1",lifecycle_id:"l1",name:"Discover",description:null},{id:"s2",lifecycle_id:"l1",name:"Join",accountable_owner_name:null}],
    connections:[{id:"c1",from_stage_id:"s1",to_stage_id:"s2"}],
  });
  assert.equal(lifecycleRouteState({mode:"admin",isAdmin:true,tenantKey:"tenant-1",lifecycles:result.lifecycles}), "ready");
  assert.equal(result.stages.length, 2);
  assert.equal(result.connections.length, 1);
});

test("phased lifecycle preserves phase and nested-stage hierarchy with null optional fields", () => {
  const result = normalizeLifecycleData({
    lifecycles:[{id:"l1",tenant_key:"tenant-1",description:null,updated_at:null}],
    phases:[{id:"p1",lifecycle_id:"l1",name:"Acquire",objective:null}],
    stages:[
      {id:"parent",lifecycle_id:"l1",phase_id:"p1",name:"Outreach",activities:null},
      {id:"child",lifecycle_id:"l1",phase_id:"p1",parent_stage_id:"parent",name:"Discovery",accountable_owner_name:null},
    ],
  });
  assert.equal(result.phases[0].id, "p1");
  assert.equal(result.stages.find((stage)=>stage.id==="child").parent_stage_id, "parent");
  assert.equal(classifyLifecycleStructure(result.phases,result.stages,result.connections), "hybrid");
});

test("admin lifecycle route is isolated, direct-hash aware, and logs failed queries safely", () => {
  const app=readFileSync(new URL("../src/App.jsx",import.meta.url),"utf8");
  const boundary=readFileSync(new URL("../src/RouteErrorBoundary.jsx",import.meta.url),"utf8");
  assert.match(app,/window\.location\.hash\.replace/);
  assert.match(app,/lifecycles-admin/);
  assert.match(app,/Operational lifecycle data load failed/);
  assert.match(app,/<RouteErrorBoundary routeKey=\{view\} title="Operational Lifecycles/);
  assert.match(boundary,/componentDidCatch/);
  assert.match(boundary,/this\.props\.children/);
});
