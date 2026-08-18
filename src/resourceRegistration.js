export const REGISTRATION_FIELDS = {
  company_id: { label: "Company", step: 1 },
  name: { label: "Resource name", step: 1 },
  owner_name: { label: "Accountable owner", step: 1 },
  department: { label: "Department", step: 1 },
  category: { label: "Category", step: 1 },
  description: { label: "Purpose and description", step: 1 },
  environment: { label: "Where it runs", step: 1 },
  vendor: { label: "Platform vendor", step: 1, when: (form) => form.entry_type === "platform" },
  access_request_instructions: { label: "Access request instructions", step: 1, when: (form) => form.entry_type === "platform" },
  prompt: { label: "Initial prompt", step: 4, when: (form) => ["agent", "skillset"].includes(form.entry_type) },
};

const blank = (value) => value == null || String(value).trim() === "";

export function normalizeRegistrationDraft(data = {}) {
  const normalized = { ...data };
  for (const field of ["company_id","name","description","owner_name","department","category","environment","vendor","license_type","access_request_instructions","support_contact","data_classification_restrictions","approved_use_guidance","prohibited_use_guidance","platform_notes","prompt","url","logo_url","intended_users","technical_dependencies","integrations","alternate_urls","documentation_links","product_notes"]) {
    if (normalized[field] == null) normalized[field] = "";
  }
  if (normalized.access_scope === "company") normalized.access_scope = "entire_company";
  if (normalized.access_scope === "private") normalized.access_scope = "owner_only";
  return normalized;
}

export function readRegistrationDraft(storage, key) {
  try {
    return JSON.parse(storage?.getItem(key) || "null") || null;
  } catch {
    return null;
  }
}

export function writeRegistrationDraft(storage, key, snapshot) {
  storage?.setItem(key, JSON.stringify(snapshot));
  return snapshot;
}

export function validateRegistrationStep(form, step, { customOwner = "" } = {}) {
  return Object.entries(REGISTRATION_FIELDS).flatMap(([field, definition]) => {
    if (definition.step !== step || (definition.when && !definition.when(form))) return [];
    const value = field === "owner_name" && form.owner_name === "Other" ? customOwner : form[field];
    return blank(value) ? [{ field, label: definition.label, step: definition.step }] : [];
  });
}

export function validateRegistration(form, options = {}) {
  return [1, 2, 3, 4].flatMap((step) => validateRegistrationStep(form, step, options));
}

export function registrationErrorSummary(errors) {
  return errors.length ? `Please complete the following required fields: ${errors.map((item) => item.label).join(", ")}.` : "";
}

export function saveErrorMessage(stage, error) {
  const message = String(error?.message || "Unknown database error").replace(/\s+/g, " ").trim();
  const permissionDenied = error?.code === "42501" || /row-level security|permission denied|not authorized/i.test(message);
  if (permissionDenied) return `The ${stage} could not be saved because your account does not have permission for this operation.`;
  return `The ${stage} could not be saved: ${message}`;
}

export function platformDetailsPayload(form, agentId) {
  return {
    agent_id: agentId,
    vendor: form.vendor?.trim() || null,
    license_type: form.license_type?.trim() || null,
    access_request_instructions: form.access_request_instructions?.trim() || null,
    support_contact: form.support_contact?.trim() || null,
    data_classification_restrictions: form.data_classification_restrictions?.trim() || null,
    approved_use_guidance: form.approved_use_guidance?.trim() || null,
    prohibited_use_guidance: form.prohibited_use_guidance?.trim() || null,
    renewal_at: form.renewal_at ? `${form.renewal_at}T23:59:59.999Z` : null,
    notes: form.platform_notes?.trim() || null,
  };
}
