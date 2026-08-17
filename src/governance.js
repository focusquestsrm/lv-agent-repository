export const ASSESSMENT_VERSION = "LV-GOV-1.0";

export const GOVERNANCE_CATEGORIES = [
  {
    id: "privacy",
    label: "Privacy & Data",
    weight: 20,
    questions: [
      ["sensitive_data", "Does the resource avoid sensitive or regulated data, or have documented safeguards?", true],
      ["retention", "Are data retention and deletion requirements documented?", true],
      ["minimization", "Is data minimization documented and applied?", false],
      ["restricted_access", "Is access to data restricted to authorized people and systems?", true],
    ],
  },
  {
    id: "security",
    label: "Security",
    weight: 20,
    questions: [
      ["systems_access", "Are database, API, and internal-system connections identified?", true],
      ["authentication", "Are authentication and authorization controls documented for those connections?", true],
      ["secrets_secure", "Are credentials and secrets stored securely outside prompts and browser fields?", true],
      ["logging", "Are appropriate logging and audit records available?", false],
    ],
  },
  {
    id: "safety",
    label: "Safety & Oversight",
    weight: 20,
    questions: [
      ["consequential", "Are consequential decisions or actions clearly identified?", true],
      ["human_review", "Is qualified human review required for consequential decisions or actions?", true],
      ["escalation", "Is an escalation path documented?", true],
      ["failure_plan", "Is there a failure, shutdown, or rollback process?", true],
    ],
  },
  {
    id: "fairness",
    label: "Fairness & Bias",
    weight: 15,
    questions: [
      ["protected_impact", "Are impacts on protected groups and affected stakeholders identified?", true],
      ["bias_evaluation", "Has the resource been evaluated for material bias?", true],
      ["representative_testing", "Has it been tested with representative inputs and use cases?", false],
    ],
  },
  {
    id: "accuracy",
    label: "Accuracy & Grounding",
    weight: 15,
    questions: [
      ["approved_grounding", "Does the resource use approved, relevant grounding sources?", true],
      ["accuracy_validation", "Is output accuracy validated for the intended use?", true],
      ["uncertainty", "Does it communicate uncertainty and known limitations?", false],
      ["inaccuracy_reporting", "Can users report inaccurate or harmful outputs?", false],
    ],
  },
  {
    id: "transparency",
    label: "Transparency",
    weight: 10,
    questions: [
      ["ai_disclosure", "Are users told when they are interacting with or receiving output from AI?", true],
      ["accountable_owner", "Is an accountable owner named and active?", true],
      ["use_documentation", "Are approved and prohibited uses documented?", true],
      ["change_records", "Are prompt, configuration, and material change records retained?", false],
    ],
  },
];

export const OVERRIDE_QUESTIONS = [
  ["customer_facing", "Will customers or the public interact with this AI or rely on its output?"],
  ["secrets_entered", "Are passwords, API keys, tokens, or other secrets entered in prompts or browser fields?"],
  ["prohibited_use", "Could the intended use be unlawful, deceptive, discriminatory, or intentionally harmful?"],
];

export const RESPONSE_OPTIONS = ["Yes", "No", "Not Applicable", "Unknown"];
const VALUE = { Yes: 100, No: 0, Unknown: 25 };
const RISK_ORDER = ["low", "medium", "high", "critical"];

export function initialQuestionnaire(stored = {}) {
  const result = {};
  for (const category of GOVERNANCE_CATEGORIES) {
    for (const [id] of category.questions)
      result[id] = { answer: stored[id]?.answer || "", explanation: stored[id]?.explanation || "" };
  }
  for (const [id] of OVERRIDE_QUESTIONS)
    result[id] = { answer: stored[id]?.answer || "", explanation: stored[id]?.explanation || "" };
  return result;
}

function riskForScore(score) {
  if (score >= 85) return "low";
  if (score >= 65) return "medium";
  if (score >= 40) return "high";
  return "critical";
}

function atLeast(current, minimum) {
  return RISK_ORDER[Math.max(RISK_ORDER.indexOf(current), RISK_ORDER.indexOf(minimum))];
}

export function evaluateGovernance(responses, context = {}) {
  const missing = [];
  const categoryScores = {};
  let weighted = 0;
  for (const category of GOVERNANCE_CATEGORIES) {
    const values = [];
    for (const [id, , highImpact] of category.questions) {
      const response = responses[id] || {};
      if (!response.answer) missing.push(id);
      if ((response.answer === "No" || response.answer === "Unknown") && highImpact && !response.explanation?.trim()) missing.push(`${id}:explanation`);
      if (response.answer === "Not Applicable" && !response.explanation?.trim()) missing.push(`${id}:explanation`);
      if (response.answer === "Not Applicable" && response.explanation?.trim()) continue;
      values.push(VALUE[response.answer] ?? 25);
    }
    const score = values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 100;
    categoryScores[category.id] = score;
    weighted += score * (category.weight / 100);
  }
  for (const [id] of OVERRIDE_QUESTIONS) if (!responses[id]?.answer) missing.push(id);
  const score = Math.round(weighted);
  const initialRisk = riskForScore(score);
  let finalRisk = initialRisk;
  const overrides = [];
  const add = (id, risk, reason) => {
    finalRisk = atLeast(finalRisk, risk);
    overrides.push({ id, minimum_risk: risk, reason });
  };
  const answer = (id) => responses[id]?.answer;
  if (context.uses_sensitive_data && ["No", "Unknown"].includes(answer("sensitive_data"))) add("sensitive_without_safeguards", "high", "Sensitive or regulated data lacks confirmed safeguards.");
  if (answer("consequential") === "Yes" && answer("human_review") !== "Yes") add("consequential_without_review", "high", "Consequential decisions lack confirmed human review.");
  if ((context.uses_database || context.uses_api) && answer("authentication") !== "Yes") add("systems_without_auth", "high", "Database or API access lacks confirmed authentication controls.");
  if (answer("secrets_entered") === "Yes" || answer("secrets_secure") === "No") add("secrets_exposed", "critical", "Secrets may be entered or stored in an unsafe location.");
  if (answer("prohibited_use") === "Yes") add("prohibited_use", "critical", "The intended use may be unlawful, deceptive, discriminatory, or harmful.");
  if (answer("customer_facing") === "Yes" && answer("ai_disclosure") !== "Yes") add("customer_without_disclosure", "medium", "Customer-facing AI lacks confirmed disclosure.");
  if (answer("protected_impact") === "Yes" && answer("bias_evaluation") !== "Yes") add("protected_impact_without_bias_review", "high", "Protected-group impact lacks a bias evaluation.");
  if (answer("accountable_owner") !== "Yes" || !context.accountable_owner_id) add("no_accountable_owner", "high", "An active accountable owner is not confirmed.");
  if (answer("consequential") === "Yes" && (answer("escalation") !== "Yes" || answer("failure_plan") !== "Yes")) add("missing_consequential_failure_process", "high", "A consequential use lacks a confirmed escalation and failure process.");
  const assessmentPending = missing.length > 0;
  return {
    assessment_version: ASSESSMENT_VERSION,
    overall_score: score,
    category_scores: categoryScores,
    initial_risk: initialRisk,
    final_risk: finalRisk,
    overrides,
    missing: [...new Set(missing)],
    status: assessmentPending ? "assessment_pending" : finalRisk === "low" ? "cleared" : "governance_review",
    flagged: assessmentPending || finalRisk !== "low",
    summary: assessmentPending
      ? "The resource was saved, but the deterministic assessment needs additional questionnaire information."
      : overrides.length
        ? `${overrides.length} mandatory risk override${overrides.length === 1 ? " applies" : "s apply"}. Admin review is required.`
        : finalRisk === "low"
          ? "The deterministic governance assessment met the readiness threshold for automatic clearance."
          : "The deterministic governance score requires Admin review before publication.",
  };
}

export function validateQuestionnaire(responses) {
  return evaluateGovernance(responses).missing;
}
