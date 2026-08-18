import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRegistrationDraft, platformDetailsPayload, readRegistrationDraft, registrationErrorSummary, saveErrorMessage, validateRegistration, validateRegistrationStep, writeRegistrationDraft } from "../src/resourceRegistration.js";
import { readFileSync } from "node:fs";

const validPlatform = {
  entry_type: "platform",
  company_id: "company-1",
  name: "Approved AI Platform",
  owner_name: "Platform Owner",
  department: "Technology",
  category: "AI Platform",
  description: "Provides governed access to an approved AI platform.",
  environment: "Enterprise SaaS",
  vendor: "Example Vendor",
  access_request_instructions: "Submit an access request to the platform administrator.",
  prompt: "",
};

test("valid Platform registration has no required-field errors and does not require a prompt", () => {
  assert.deepEqual(validateRegistration(validPlatform), []);
});

test("missing required Platform fields return specific labels and the owning step", () => {
  const errors = validateRegistrationStep({ ...validPlatform, vendor: "", access_request_instructions: undefined }, 1);
  assert.deepEqual(errors.map((item) => item.field), ["vendor", "access_request_instructions"]);
  assert.equal(errors[0].step, 1);
  assert.equal(registrationErrorSummary(errors), "Please complete the following required fields: Platform vendor, Access request instructions.");
});

test("Platform-only fields stay hidden and optional for other resource types", () => {
  const agent = { ...validPlatform, entry_type: "agent", vendor: "", access_request_instructions: "", prompt: "Agent system prompt" };
  assert.equal(validateRegistration(agent).some((item) => item.field === "vendor"), false);
  assert.equal(validateRegistration(agent).some((item) => item.field === "access_request_instructions"), false);
});

test("Start Here and database draft values normalize and restore Platform fields", () => {
  const restored = normalizeRegistrationDraft({ ...validPlatform, access_scope: "company", platform_notes: null, prohibited_use_guidance: undefined });
  assert.equal(restored.vendor, "Example Vendor");
  assert.equal(restored.access_request_instructions, validPlatform.access_request_instructions);
  assert.equal(restored.access_scope, "entire_company");
  assert.equal(restored.platform_notes, "");
  assert.equal(restored.prohibited_use_guidance, "");
});

test("local draft restoration preserves entered values and the current step", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const snapshot = { form: { ...validPlatform, platform_notes: "Keep this note" }, step: 2, questionnaire: { trigger_connection: { answer: "No" } } };
  writeRegistrationDraft(storage, "draft", snapshot);
  assert.deepEqual(readRegistrationDraft(storage, "draft"), snapshot);
});

test("full validation routes back to the earliest invalid step", () => {
  const errors = validateRegistration({ ...validPlatform, company_id: "", vendor: "" });
  assert.equal(errors[0].field, "company_id");
  assert.equal(errors[0].step, 1);
});

test("validation does not mutate or discard entered values", () => {
  const incomplete = { ...validPlatform, vendor: "", platform_notes: "Already entered" };
  const before = structuredClone(incomplete);
  validateRegistration(incomplete);
  assert.deepEqual(incomplete, before);
});

test("successful Platform payload retains required values and leaves optional fields null", () => {
  assert.deepEqual(platformDetailsPayload(validPlatform, "resource-1"), {
    agent_id: "resource-1",
    vendor: "Example Vendor",
    license_type: null,
    access_request_instructions: validPlatform.access_request_instructions,
    support_contact: null,
    data_classification_restrictions: null,
    approved_use_guidance: null,
    prohibited_use_guidance: null,
    renewal_at: null,
    notes: null,
  });
});

test("governance risk, lifecycle gaps, duplicate signals, and AI availability do not block validation", () => {
  const form = { ...validPlatform, governance_flagged: true, lifecycle_relationship: "not_yet_evaluated", possible_duplicate: true, ai_provider_available: false };
  assert.deepEqual(validateRegistration(form), []);
});

test("Supabase and RLS failures return safe actionable reasons", () => {
  assert.equal(saveErrorMessage("resource record", { code: "42501", message: "new row violates row-level security policy" }), "The resource record could not be saved because your account does not have permission for this operation.");
  assert.equal(saveErrorMessage("platform details", { code: "23502", message: "vendor violates a database constraint" }), "The platform details could not be saved: vendor violates a database constraint");
});

test("registration UI exposes inline errors, focus recovery, autosave, and clear actions", () => {
  const source = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(source, /scrollIntoView\(\{ behavior: "smooth", block: "center" \}\)/);
  assert.match(source, /input\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(source, /<FieldError id="vendor-error"/);
  assert.match(source, /<FieldError id="access_request_instructions-error"/);
  assert.match(source, /persistDraft\(\{ quiet: true, stepOverride:/);
  assert.match(source, /"Save and continue"/);
  assert.match(source, /"Create resource"/);
  assert.match(source, /disabled=\{checking \|\| draftSaving\}/);
});
