export const CLASSIFICATION_QUESTIONS = [
  ["individual_tasks", "Is this mainly helping you perform tasks in your own role?"],
  ["shared_dependency", "Will multiple employees depend on it?"],
  ["shared_data", "Will it store shared company or customer data?"],
  ["infrastructure", "Does it need a database, API, authentication, or integrations?"],
  ["external_users", "Will customers, schools, members, or other external users access it?"],
  ["commercial", "Is it intended to become a product Lead Ventures could sell?"],
  ["business_critical", "Would the company be significantly affected if the tool stopped working?"],
  ["ongoing_support", "Will it require ongoing technical support?"],
];

export function classifyResource(answers = {}) {
  const yes = (key) => answers[key] === true || answers[key] === "yes";
  const platformSignals = ["shared_data", "infrastructure", "external_users", "business_critical", "ongoing_support"].filter(yes);
  const classification = yes("commercial") ? "product" : platformSignals.length ? "platform" : yes("shared_dependency") ? "shared_internal" : "citizen_development";
  const result = {
    classification,
    technicalSupport: ["platform","product"].includes(classification) || yes("ongoing_support"),
    governance: [],
  };
  if (classification === "product") {
    result.label = "Product";
    result.explanation = "This is intended to become a commercial or strategic Lead Ventures offering. Register it in the Product Suite; lifecycle alignment remains optional.";
    result.nextSteps = ["Name business and product owners and select a product family.", "Document target customers, commercial status, development stage, hosting, and related resources."];
  } else if (classification === "platform") {
    result.label = "Platform";
    result.explanation = "This resource has shared infrastructure, data, external-user, commercial, criticality, or ongoing-support needs that call for platform ownership.";
    result.nextSteps = ["Name an accountable business and technical owner.", "Confirm company-controlled hosting, administration, security, and support before launch."];
  } else if (classification === "shared_internal") {
    result.label = "Shared Internal Resource";
    result.explanation = "Several employees will depend on this resource, but its current answers do not indicate full platform infrastructure.";
    result.nextSteps = ["Name a steward and document who may access it.", "Confirm a shared company-controlled location and a basic support plan."];
  } else {
    result.label = "Employee Upskilling / Citizen Development";
    result.explanation = "This appears to be a limited Agent or Skillset that improves individual or team productivity.";
    result.nextSteps = ["Register the Agent or Skillset and keep creator attribution.", "Avoid sensitive data or unmanaged integrations unless the scope is reassessed."];
  }
  if (yes("shared_data")) result.governance.push("Confirm data classification, retention, and access controls.");
  if (yes("external_users")) result.governance.push("Document disclosure, support, accessibility, and external-user safeguards.");
  if (yes("commercial")) result.governance.push("Involve product, legal, security, and finance before commercial release.");
  if (yes("business_critical")) result.governance.push("Document monitoring, recovery, escalation, and continuity plans.");
  if (!result.governance.length) result.governance.push("Complete the standard deterministic governance questionnaire.");
  return result;
}
