import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assessmentToRegistrationDraft, classifyResource, START_HERE_RULE_VERSION } from "../src/classification.js";
import { compareResources, findDuplicates, normalizeUrl, tokenSimilarity } from "../src/duplicates.js";
import { LIFECYCLE_TEMPLATES, suggestLifecycleAlignment } from "../src/lifecycles.js";
import { DEFAULT_REVIEW_THRESHOLD, evaluateGovernance, initialQuestionnaire } from "../src/governance.js";

test("Start Here deterministically classifies all four resource paths", () => {
  assert.equal(classifyResource({ individual_use: "yes" }).classification, "personal_productivity");
  assert.equal(classifyResource({ individual_use: "no" }).classification, "citizen_development");
  assert.equal(classifyResource({ multi_user: "yes" }).classification, "shared_internal_solution");
  assert.equal(classifyResource({ technical_dependency: "yes" }).classification, "platform_product_initiative");
  const product = classifyResource({ commercial_intent: "yes" });
  assert.equal(product.classification, "platform_product_initiative");
  assert.equal(product.resourceType, "product");
  assert.equal(product.technicalSupport, true);
  assert.equal(product.ruleVersion, START_HERE_RULE_VERSION);
});

test("Unsure recommends consultation without automatically raising classification", () => {
  const result = classifyResource({ individual_use: "yes", technical_dependency: "unsure", business_impact: "unsure" });
  assert.equal(result.classification, "personal_productivity");
  assert.equal(result.unsureFactors.length, 2);
});

test("Start Here transfers structured fields into an editable registration draft", () => {
  const assessment = { working_name:"Enrollment Helper", business_problem:"Reduce manual work", capabilities:"Prompt guide", company_id:"company-1", intended_users:"Finance team", answers:{ shared_data:"yes", commercial_intent:"no", support_required:"unsure" } };
  const result = classifyResource(assessment.answers, assessment);
  const draft = assessmentToRegistrationDraft(assessment, result, { id:"user-1", email:"owner@example.com" });
  assert.equal(draft.name, assessment.working_name);
  assert.equal(draft.company_id, "company-1");
  assert.equal(draft.owner_id, "user-1");
  assert.equal(draft.data_classification, "shared_company_or_customer_data");
  assert.ok(draft.populated_from_start_here.includes("development_path"));
});

test("Start Here UI supports nonblocking overrides, resume, and linked final submission", () => {
  const hub = readFileSync(new URL("../src/HubFeatures.jsx", import.meta.url), "utf8");
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(hub, /requested, not required/);
  assert.match(hub, /Resume assessment/);
  assert.match(hub, /Resume registration/);
  assert.match(app, /start_here_assessment_id/);
  assert.match(app, /registration_draft_id/);
  assert.match(app, /status: "submitted"/);
});

test("URL normalization ignores scheme, www, trailing slash, and tracking parameters", () => {
  assert.equal(normalizeUrl("HTTPS://WWW.Example.com/demo/?utm_source=test"), "example.com/demo");
  assert.equal(normalizeUrl("http://example.com/demo"), "example.com/demo");
  assert.equal(normalizeUrl(null), "");
});

test("duplicate detection recognizes exact URLs and similar descriptions", () => {
  const exact = compareResources({ name:"New", url:"https://example.com/app/" }, { id:"1", name:"Existing", url:"http://www.example.com/app" });
  assert.equal(exact.exactUrl, true);
  assert.equal(exact.score, 100);
  assert.ok(tokenSimilarity("student enrollment success", "student success platform") >= 20);
  assert.equal(findDuplicates({ name:"Student success agent", description:"Improve student enrollment and success" }, [{ id:"2", name:"Student success helper", description:"Student enrollment success support" }]).length, 1);
  assert.doesNotThrow(() => findDuplicates(
    { name:"New resource", url:null, alternate_urls:null },
    [{ id:"legacy", name:"Legacy resource", url:null, alternate_urls:null }],
  ));
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

test("migrations cover RLS-sensitive lifecycle, Product, assessment, and draft writes", () => {
  const names=["018_hub_resource_stewardship.sql","019_operational_lifecycles.sql","020_lifecycle_security_templates.sql","021_product_suite.sql","022_resource_department_access.sql","023_start_here_assessment_workflow.sql","024_operational_lifecycle_builder.sql"];
  const migrations=names.map(name=>readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url),"utf8")).join("\n");
  for (const table of ["operational_lifecycles","lifecycle_stages","lifecycle_viewers","resource_lifecycle_mappings","resource_duplicate_matches","resource_classification_assessments","resource_stewardship_reviews","product_relationships","resource_department_access","start_here_assessments","resource_registration_drafts","admin_awareness_notifications"]) assert.match(migrations,new RegExp(`alter table public\\.${table} enable row level security`));
  assert.match(migrations,/public\.can_access_lifecycle/);
  assert.match(migrations,/alignment_needs_clarification/);
  assert.match(migrations,/standalone_lead_ventures_product/);
  assert.match(migrations,/create policy "resource managers create lifecycle mappings"/);
  assert.match(migrations,/convert_start_here_to_registration_draft/);
  assert.match(migrations,/converted_to_registration_draft/);
  assert.match(migrations,/submitted_resource_id/);
});

test("dashboard tiles and resource registration actions have stable responsive layout", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/admin-actions.css", import.meta.url), "utf8");
  assert.match(css, /grid-template-columns:\s*repeat\(6, minmax\(0, 1fr\)\)/);
  assert.match(app, /className="dashboard-container"/);
  assert.match(css, /width:\s*min\(96%, 1800px\)/);
  assert.match(css, /\.dashboard-container \.stats article\s*\{\s*min-width:\s*0/);
  assert.match(css, /min-width:\s*1024px[\s\S]*max-width:\s*1279px[\s\S]*repeat\(6, minmax\(0, 1fr\)\)/);
  assert.match(css, /max-width:\s*1023px[\s\S]*min-width:\s*768px[\s\S]*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /max-width:\s*479px[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(css, /\.modal\.compact\.resource-form > footer\s*\{[\s\S]*position:\s*sticky/);
  assert.match(app, /validateRegistrationStep/);
  assert.match(app, /type="submit" className="primary"/);
  assert.match(app, /"Save and continue"/);
  assert.match(app, /"Create resource"/);
});
