import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyResource } from "../src/classification.js";
import { compareResources, findDuplicates, normalizeUrl, tokenSimilarity } from "../src/duplicates.js";
import { LIFECYCLE_TEMPLATES, suggestLifecycleAlignment } from "../src/lifecycles.js";
import { DEFAULT_REVIEW_THRESHOLD, evaluateGovernance, initialQuestionnaire } from "../src/governance.js";

test("Start Here deterministically classifies all four resource paths", () => {
  assert.equal(classifyResource({ individual_tasks: true }).classification, "citizen_development");
  assert.equal(classifyResource({ shared_dependency: true }).classification, "shared_internal");
  assert.equal(classifyResource({ infrastructure: true }).classification, "platform");
  const product = classifyResource({ commercial: true });
  assert.equal(product.classification, "product");
  assert.equal(product.technicalSupport, true);
});

test("URL normalization ignores scheme, www, trailing slash, and tracking parameters", () => {
  assert.equal(normalizeUrl("HTTPS://WWW.Example.com/demo/?utm_source=test"), "example.com/demo");
  assert.equal(normalizeUrl("http://example.com/demo"), "example.com/demo");
});

test("duplicate detection recognizes exact URLs and similar descriptions", () => {
  const exact = compareResources({ name:"New", url:"https://example.com/app/" }, { id:"1", name:"Existing", url:"http://www.example.com/app" });
  assert.equal(exact.exactUrl, true);
  assert.equal(exact.score, 100);
  assert.ok(tokenSimilarity("student enrollment success", "student success platform") >= 20);
  assert.equal(findDuplicates({ name:"Student success agent", description:"Improve student enrollment and success" }, [{ id:"2", name:"Student success helper", description:"Student enrollment success support" }]).length, 1);
});

test("templates represent phased and circular structures without fixed layout markup", () => {
  assert.equal(LIFECYCLE_TEMPLATES.focusquest.lifecycle_type, "phased");
  assert.equal(LIFECYCLE_TEMPLATES.focusquest.phases.length, 4);
  assert.equal(LIFECYCLE_TEMPLATES.d9.lifecycle_type, "circular");
  assert.equal(LIFECYCLE_TEMPLATES.d9.phases[0][1].length, 7);
  assert.ok(LIFECYCLE_TEMPLATES.d9.connections.some(([from,to]) => from === "Renew or Recover" && to === "Engage"));
});

test("lifecycle alignment is advisory and deterministic", () => {
  const suggestions = suggestLifecycleAlignment({ name:"Enrollment assistant", description:"Supports student enrollment" }, [{ id:"s1", name:"Student Acquisition & Enrollment", activities:[] }, { id:"s2", name:"Procurement", activities:[] }]);
  assert.equal(suggestions[0].stage.id, "s1");
  assert.ok(suggestions[0].confidence > 0);
});

test("governance routing stays separate from lifecycle and product-suite membership", () => {
  const responses = initialQuestionnaire({}, { accountable_owner_id:"owner" });
  const result = evaluateGovernance(responses, { accountable_owner_id:"owner" }, DEFAULT_REVIEW_THRESHOLD);
  assert.ok(["assessment_pending","cleared","governance_review"].includes(result.status));
  assert.equal("lifecycle_relationship" in result, false);
});

test("migrations cover RLS-sensitive lifecycle and Product writes", () => {
  const names=["018_hub_resource_stewardship.sql","019_operational_lifecycles.sql","020_lifecycle_security_templates.sql","021_product_suite.sql","022_resource_department_access.sql"];
  const migrations=names.map(name=>readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url),"utf8")).join("\n");
  for (const table of ["operational_lifecycles","lifecycle_stages","lifecycle_viewers","resource_lifecycle_mappings","resource_duplicate_matches","resource_classification_assessments","resource_stewardship_reviews","product_relationships","resource_department_access"]) assert.match(migrations,new RegExp(`alter table public\\.${table} enable row level security`));
  assert.match(migrations,/public\.can_access_lifecycle/);
  assert.match(migrations,/alignment_needs_clarification/);
  assert.match(migrations,/standalone_lead_ventures_product/);
  assert.match(migrations,/create policy "resource managers create lifecycle mappings"/);
});
