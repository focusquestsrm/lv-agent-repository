import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isArchivedResource, isMyResource, isPublishedResource, resourceLocations, safeDataError } from "../src/resourceVisibility.js";
import { normalizeLifecycleData } from "../src/lifecycleModel.js";

const userId = "user-1";
const resource = (status, governance_status = "assessment_pending") => ({
  id: `${status}-resource`,
  name: "Enrollment Platform",
  status,
  governance_status,
  created_by: userId,
  accountable_owner_id: "owner-2",
});

test("creator sees every non-archived workflow status in My Resources", () => {
  for (const status of ["draft", "pending", "submitted", "approved", "rejected", "changes_requested", "assessment_pending", "governance_review"]) {
    assert.equal(isMyResource(resource(status), userId), true, status);
  }
  assert.equal(isMyResource(resource("retired"), userId), false);
  assert.equal(isMyResource(resource("archived"), userId), false);
});

test("directory publication requires both approved status and cleared governance", () => {
  assert.equal(isPublishedResource(resource("approved", "cleared")), true);
  assert.equal(isPublishedResource(resource("approved", "governance_review")), false);
  assert.equal(isPublishedResource(resource("governance_review", "cleared")), false);
});

test("submission receipt reports canonical locations", () => {
  assert.deepEqual(resourceLocations(resource("approved", "cleared")), ["My Resources", "Resource Directory"]);
  assert.deepEqual(resourceLocations(resource("assessment_pending")), ["My Resources"]);
});

test("data errors do not expose raw server messages", () => {
  assert.equal(safeDataError({ code: "42501", message: "row-level security secret table" }), "You do not have permission to retrieve this information.");
  assert.equal(safeDataError({ code: "PGRST116", message: "https://project.example/private?token=secret" }), "The requested data could not be loaded. (Reference PGRST116)");
});

test("lifecycle normalization handles no records, partial records, and invalid connections", () => {
  assert.deepEqual(normalizeLifecycleData({ lifecycles: null }).lifecycles, []);
  const normalized = normalizeLifecycleData({
    lifecycles: [{ id: "l1" }],
    phases: [null, { id: "p1", lifecycle_id: "l1" }],
    stages: [{ id: "s1", lifecycle_id: "l1" }, { id: "foreign", lifecycle_id: "l2" }],
    connections: [{ id: "valid", from_stage_id: "s1", to_stage_id: "s1" }, { id: "broken", from_stage_id: "s1", to_stage_id: "missing" }],
  });
  assert.equal(normalized.phases.length, 1);
  assert.equal(normalized.stages.length, 1);
  assert.deepEqual(normalized.connections.map((item) => item.id), ["valid"]);
});

test("save confirmation and lifecycle failures are route-contained in the application", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const boundary = readFileSync(new URL("../src/RouteErrorBoundary.jsx", import.meta.url), "utf8");
  assert.match(app, /visibility confirmation/);
  assert.match(app, /\.maybeSingle\(\)/);
  assert.match(app, /if \(!c\.error\) setCompanies/);
  assert.match(app, /The last successfully loaded company list has been preserved/);
  assert.match(app, /<RouteErrorBoundary/);
  assert.match(boundary, /componentDidCatch/);
  assert.match(boundary, /Return to Dashboard/);
});

test("creator visibility migration enforces tenant isolation", () => {
  const sql = readFileSync(new URL("../supabase/migrations/025_resource_creator_visibility.sql", import.meta.url), "utf8");
  assert.match(sql, /agent\.created_by=auth\.uid\(\)/);
  assert.match(sql, /viewer\.tenant_key=agent\.tenant_key/);
  assert.match(sql, /agent\.status='approved' and agent\.governance_status='cleared'/);
});

test("Data API CORS migration preserves the former origin and allows the Hub production origin", () => {
  const sql = readFileSync(new URL("../supabase/migrations/026_restore_hub_api_cors.sql", import.meta.url), "utf8");
  assert.match(sql, /alter role authenticator set pgrst\.server_cors_allowed_origins/i);
  assert.match(sql, /https:\/\/agentrepository\.lead-ventures\.com/);
  assert.match(sql, /https:\/\/thehub\.lead-ventures\.com/);
  assert.match(sql, /notify pgrst, 'reload config'/i);
  assert.doesNotMatch(sql, /disable row level security|drop table|truncate/i);
});

test("resource loader disambiguates the owning company from additional company access", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /select\("\*,companies!agents_company_id_fkey\(name\)"\)/);
  assert.doesNotMatch(app, /select\("\*,companies\(name\)"\)/);
});
