export const START_HERE_RULE_VERSION = "LV-START-HERE-2.0";

export const CLASSIFICATION_QUESTIONS = [
  { key: "individual_use", label: "Does this mainly support your own role?", help: "Choose Yes when you are the primary person who will rely on it." },
  { key: "multi_user", label: "Will multiple employees or departments depend on it?", help: "Occasional sharing is different from an operational dependency." },
  { key: "shared_data", label: "Will it use shared company or customer data?", help: "This includes shared records, customer information, or other managed business data." },
  { key: "technical_dependency", label: "Does it need a database, API, authentication, or integrations?", help: "Choose Unsure if you need technical help to decide." },
  { key: "external_users", label: "Will customers, schools, members, or other external users access it?", help: "External users include anyone outside your company tenant." },
  { key: "commercial_intent", label: "Might this become a commercial Lead Ventures product?", help: "Choose Yes for an offering that may be sold, licensed, or packaged commercially." },
  { key: "business_impact", label: "Would the business be meaningfully affected if it became unavailable?", help: "Consider interrupted work, revenue, customer experience, or compliance." },
  { key: "support_required", label: "Will it require ongoing technical ownership or support?", help: "Think beyond initial setup to maintenance, monitoring, and incident response." },
];

const yes = (answers, key) => answers[key] === true || answers[key] === "yes";

export function classifyResource(answers = {}, context = {}) {
  const platformKeys = ["technical_dependency", "external_users", "commercial_intent", "business_impact", "support_required"];
  const sharedKeys = ["multi_user", "shared_data"];
  const platformFactors = platformKeys.filter((key) => yes(answers, key));
  const sharedFactors = sharedKeys.filter((key) => yes(answers, key));
  const unsureFactors = CLASSIFICATION_QUESTIONS.filter(({ key }) => answers[key] === "unsure").map(({ label }) => label);
  let classification = "citizen_development";
  if (platformFactors.length) classification = "platform_product_initiative";
  else if (sharedFactors.length) classification = "shared_internal_solution";
  else if (yes(answers, "individual_use")) classification = "personal_productivity";

  const capabilityText = `${context.capabilities || ""} ${context.business_problem || ""}`.toLowerCase();
  const skillsetSignal = /prompt|instruction|playbook|guide|template|training|skillset/.test(capabilityText) && !/agent|automat|workflow/.test(capabilityText);
  let resourceType = skillsetSignal ? "skillset" : "agent";
  let resourceTypeOptions = [resourceType];
  if (classification === "shared_internal_solution" && yes(answers, "technical_dependency")) resourceType = "platform";
  if (classification === "platform_product_initiative") {
    if (yes(answers, "commercial_intent")) resourceType = "product";
    else if (yes(answers, "technical_dependency") || yes(answers, "external_users") || yes(answers, "support_required")) resourceType = "platform";
    else { resourceType = ""; resourceTypeOptions = ["platform", "product"]; }
  }

  const labels = { personal_productivity: "Personal Productivity", citizen_development: "Citizen Development", shared_internal_solution: "Shared Internal Solution", platform_product_initiative: "Platform or Product Initiative" };
  const explanations = {
    personal_productivity: "This idea primarily helps one person and does not currently show shared-data, managed-integration, criticality, or support needs.",
    citizen_development: "This is a limited-complexity employee-built resource for individual or team productivity. Citizen Development is the classification; employee upskilling may be its broader learning purpose.",
    shared_internal_solution: "Several employees or shared business information will depend on this idea, so it needs a named owner and a clear internal support model.",
    platform_product_initiative: "The answers indicate managed technology, external users, commercial potential, business impact, or ongoing technical ownership. An admin or technical conversation is recommended for coordination, not approval.",
  };
  const nextSteps = {
    personal_productivity: ["Register the Agent or Skillset and keep creator attribution.", "Reassess if shared data, integrations, or wider use are added."],
    citizen_development: ["Register the Agent or Skillset and name an accountable owner.", "Use company-controlled tools and complete governance questions at submission."],
    shared_internal_solution: ["Name an operational owner and intended user group.", "Document access, data handling, dependencies, and support."],
    platform_product_initiative: ["Choose Platform or Product during registration.", "Coordinate ownership, architecture, security, support, and commercial review as applicable."],
  };
  const governance = [];
  if (yes(answers, "shared_data")) governance.push("Confirm data classification, retention, and access controls.");
  if (yes(answers, "external_users")) governance.push("Document external-user, disclosure, accessibility, and support safeguards.");
  if (yes(answers, "commercial_intent")) governance.push("Coordinate product, legal, security, and finance review before commercial release.");
  if (yes(answers, "business_impact")) governance.push("Document continuity, recovery, monitoring, and escalation plans.");
  if (!governance.length) governance.push("Complete the standard deterministic governance questionnaire when the resource is submitted.");
  return { classification, label: labels[classification], explanation: explanations[classification], factors: [...platformFactors, ...sharedFactors, ...(yes(answers, "individual_use") ? ["individual_use"] : [])], unsureFactors, resourceType, resourceTypeOptions, technicalSupport: classification === "platform_product_initiative" || yes(answers, "support_required"), adminDiscussion: classification === "platform_product_initiative", nextSteps: nextSteps[classification], governance, ruleVersion: START_HERE_RULE_VERSION };
}

export function assessmentToRegistrationDraft(assessment, result, user = {}) {
  const answers = assessment.answers || {};
  const selectedType = assessment.selected_resource_type || result.resourceType || "agent";
  return {
    name: assessment.working_name || "", description: assessment.business_problem || "", purpose: assessment.business_problem || "", skills_summary: assessment.capabilities || "", capabilities: assessment.capabilities || "",
    development_path: assessment.override_classification || result.classification, entry_type: selectedType, intended_users: assessment.intended_users || "",
    access_scope: /company|department|team|employees/i.test(assessment.intended_users || "") ? "company" : "private",
    data_classification: yes(answers, "shared_data") ? "shared_company_or_customer_data" : "standard",
    technical_dependencies: yes(answers, "technical_dependency") ? "Database, API, authentication, or integrations indicated" : answers.technical_dependency === "unsure" ? "Technical dependencies need consultation" : "None indicated",
    audience: yes(answers, "external_users") ? "external" : "internal", commercial_status: yes(answers, "commercial_intent") ? "evaluating_commercial_potential" : "internal_only",
    business_criticality: yes(answers, "business_impact") ? "meaningful" : answers.business_impact === "unsure" ? "needs_review" : "low",
    support_model: yes(answers, "support_required") ? "ongoing_technical_support" : answers.support_required === "unsure" ? "needs_review" : "creator_managed",
    company_id: assessment.company_id || "", original_creator: user.email || user.full_name || "", owner_id: user.id || "", accountable_owner_id: user.id || "",
    populated_from_start_here: ["name", "description", "skills_summary", "development_path", "entry_type", "intended_users", "access_scope", "data_classification", "technical_dependencies", "audience", "commercial_status", "business_criticality", "support_model", "company_id", "original_creator", "owner_id"],
  };
}
