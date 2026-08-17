export const ASSESSMENT_VERSION = "LV-GOV-2.0";
export const DEFAULT_REVIEW_THRESHOLD = 40;

export const TRIGGER_QUESTIONS = [
  ["trigger_sensitive", "Will the resource use sensitive or confidential information?"],
  ["trigger_connection", "Will it connect to another system, database, API, or shared drive?"],
  ["trigger_consequential", "Could it influence an important decision or action?"],
  ["trigger_affected", "Could its output affect customers, students, employees, applicants, or different groups of people?"],
];

export const GOVERNANCE_CATEGORIES = [
  { id: "privacy", label: "Privacy and Data", weight: 20, statements: [
    { id: "privacy_sensitive", trigger: "trigger_sensitive", label: "Sensitive or confidential information is avoided or properly protected.", help: "Think about customer, student, employee, financial, health, personal, or company-confidential information.", critical: true },
    { id: "privacy_minimization", label: "The resource collects only the information it actually needs.", help: "It should not request or retrieve unnecessary personal or confidential information." },
    { id: "privacy_retention", label: "Information is kept only as long as needed and can be deleted appropriately.", help: "Consider prompts, uploaded files, responses, conversation history, logs, and database records." },
    { id: "privacy_access", label: "Only approved people can access the information.", help: "Access should be limited based on the person’s role, company, or individual assignment.", critical: true },
  ]},
  { id: "safety", label: "Safety and Human Oversight", weight: 20, statements: [
    { id: "safety_human_review", trigger: "trigger_consequential", label: "A qualified person reviews important recommendations before action is taken.", help: "This is especially important for decisions involving customers, students, employees, applicants, payments, eligibility, or compliance.", critical: true },
    { id: "safety_contact", label: "There is a clear person to contact when something goes wrong.", help: "The accountable person should be able to investigate, correct, stop, or escalate the resource.", critical: true },
    { id: "safety_shutdown", trigger: "trigger_consequential", label: "The resource can be safely stopped or rolled back if it fails.", help: "There should be a way to pause the resource and return to a safe manual or previous process.", critical: true },
  ]},
  { id: "security", label: "Security", weight: 20, statements: [
    { id: "security_connections", trigger: "trigger_connection", label: "Connections to databases, APIs, shared drives, or other systems are secured.", help: "Only approved users and systems should be able to use these connections.", critical: true },
    { id: "security_secrets", label: "Passwords, API keys, and other secrets are stored securely.", help: "Secrets must not be placed in prompts, form fields, source code, or browser-accessible settings.", critical: true },
    { id: "security_audit", trigger: "trigger_connection", label: "Activity can be reviewed if a problem occurs.", help: "Examples include usage history, activity logs, access records, and audit trails." },
  ]},
  { id: "fairness", label: "Fairness", weight: 15, statements: [
    { id: "fairness_effects", trigger: "trigger_affected", label: "The resource has been considered for unfair effects on different groups.", help: "Consider customers, students, employees, applicants, people with disabilities, protected groups, and different backgrounds.", critical: true },
    { id: "fairness_testing", trigger: "trigger_affected", label: "The resource has been tested using realistic and representative situations.", help: "Testing should reflect the different people, information, and situations the resource will encounter." },
  ]},
  { id: "accuracy", label: "Accuracy", weight: 15, statements: [
    { id: "accuracy_sources", label: "The resource uses approved and reliable information.", help: "Examples include company policies, verified databases, approved documents, and reviewed reference materials." },
    { id: "accuracy_review", label: "Important outputs are checked for accuracy.", help: "Users or owners should verify important information before relying on it.", critical: true },
    { id: "accuracy_uncertainty", label: "The resource communicates when an answer may be uncertain or incomplete.", help: "It should not present uncertain or estimated information as confirmed fact." },
    { id: "accuracy_reporting", label: "Users have a clear way to report incorrect or harmful outputs.", help: "Reports should reach the accountable owner or appropriate support team." },
  ]},
  { id: "transparency", label: "Transparency and Accountability", weight: 10, statements: [
    { id: "transparency_disclosure", trigger: "trigger_affected", label: "Users are told when they are interacting with AI or receiving AI-generated content.", help: "A disclosure is needed when someone could reasonably believe the response came entirely from a person.", critical: true },
    { id: "transparency_uses", label: "The permitted and prohibited uses are clearly documented.", help: "People should know what the resource may be used for and what they must not do with it." },
    { id: "transparency_owner", label: "An active accountable owner is responsible for this resource.", help: "The owner is responsible for appropriate use, maintenance, issues, and outcomes.", critical: true, automatic: "owner" },
    { id: "transparency_changes", label: "Important changes to the resource are recorded.", help: "The repository preserves prompt, configuration, version, and approval history.", automatic: "history" },
  ]},
];

export const LIKERT_OPTIONS = [
  { value: "Strongly Disagree", points: 100 }, { value: "Disagree", points: 75 },
  { value: "Not Sure", points: 50 }, { value: "Agree", points: 25 },
  { value: "Strongly Agree", points: 0 }, { value: "Not Applicable", points: null },
];
export const OVERRIDE_QUESTIONS = [["prohibited_use", "Does the intended use involve anything unlawful, deceptive, discriminatory, prohibited, or materially harmful?"]];
const POINTS = Object.fromEntries(LIKERT_OPTIONS.map((option) => [option.value, option.points]));
const NEEDS_EXPLANATION = new Set(["Not Sure", "Disagree", "Strongly Disagree", "Not Applicable"]);

export function initialQuestionnaire(stored = {}, context = {}) {
  const result = {};
  for (const [id] of TRIGGER_QUESTIONS) result[id] = { answer: stored[id]?.answer || "", explanation: stored[id]?.explanation || "" };
  for (const category of GOVERNANCE_CATEGORIES) for (const statement of category.statements) {
    const automatic = statement.automatic === "owner" ? Boolean(context.accountable_owner_id) : statement.automatic === "history";
    result[statement.id] = { answer: stored[statement.id]?.answer || (automatic ? "Strongly Agree" : ""), explanation: stored[statement.id]?.explanation || (automatic ? "Confirmed automatically from repository records." : "") };
  }
  for (const [id] of OVERRIDE_QUESTIONS) result[id] = { answer: stored[id]?.answer || "", explanation: stored[id]?.explanation || "" };
  return result;
}

export function visibleStatements(category, responses) { return category.statements.filter((statement) => !statement.trigger || responses[statement.trigger]?.answer === "Yes"); }
function scoreResponse(response = {}) { if (response.answer === "Not Applicable" && response.explanation?.trim()) return null; return POINTS[response.answer] ?? 50; }
export function riskBand(score) { if (score < 20) return "low"; if (score < 40) return "moderate_low"; if (score < 60) return "medium"; if (score < 80) return "high"; return "critical"; }
export function riskLabel(band) { return ({ low: "Low", moderate_low: "Moderate-Low", medium: "Medium", high: "High", critical: "Critical" })[band] || "Pending"; }

export function evaluateGovernance(responses, context = {}, reviewThreshold = DEFAULT_REVIEW_THRESHOLD) {
  const requestedThreshold = Number(reviewThreshold);
  const threshold = Number.isFinite(requestedThreshold) ? Math.max(0, Math.min(100, requestedThreshold)) : DEFAULT_REVIEW_THRESHOLD;
  const missing = [];
  for (const [id] of TRIGGER_QUESTIONS) if (!["Yes", "No"].includes(responses[id]?.answer)) missing.push(id);
  const categoryScores = {}, drivers = [];
  for (const category of GOVERNANCE_CATEGORIES) {
    const values = [];
    for (const statement of visibleStatements(category, responses)) {
      const response = responses[statement.id] || {};
      if (!response.answer) missing.push(statement.id);
      if (NEEDS_EXPLANATION.has(response.answer) && !response.explanation?.trim()) missing.push(`${statement.id}:explanation`);
      const points = scoreResponse(response);
      if (points != null) values.push(points);
      if (points >= 25) drivers.push({ id: statement.id, category: category.label, statement: statement.label, points, response: response.answer || "Missing", explanation: response.explanation || "" });
    }
    categoryScores[category.id] = values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
  }
  if (!["Yes", "No"].includes(responses.prohibited_use?.answer)) missing.push("prohibited_use");
  const score = Math.round(GOVERNANCE_CATEGORIES.reduce((sum, category) => sum + categoryScores[category.id] * category.weight / 100, 0));
  const band = riskBand(score), overrides = [];
  const add = (id, reason, severity = "high") => { if (!overrides.some((item) => item.id === id)) overrides.push({ id, minimum_risk: severity, reason }); };
  const points = (id) => scoreResponse(responses[id]);
  if (responses.trigger_sensitive?.answer === "Yes" && points("privacy_sensitive") >= 75) add("sensitive_without_safeguards", "Sensitive or regulated information lacks confirmed safeguards.");
  if (responses.trigger_consequential?.answer === "Yes" && points("safety_human_review") >= 75) add("decision_without_human_review", "An important decision lacks qualified human review.");
  if (responses.trigger_connection?.answer === "Yes" && points("security_connections") >= 75) add("connection_without_access_controls", "A system connection lacks confirmed authentication or access controls.");
  if (points("security_secrets") >= 75) add("secrets_exposed", "Secrets may be stored in prompts, source code, form fields, or browser-accessible settings.", "critical");
  if (responses.trigger_affected?.answer === "Yes" && points("transparency_disclosure") >= 75) add("customer_without_disclosure", "A customer- or stakeholder-facing resource lacks AI disclosure.");
  if (responses.trigger_affected?.answer === "Yes" && points("fairness_effects") >= 75) add("groups_without_fairness_review", "A resource affecting different groups lacks an unfair-outcomes evaluation.");
  if (!context.accountable_owner_id || points("transparency_owner") >= 75) add("no_accountable_owner", "No active accountable owner is confirmed.");
  if (responses.trigger_consequential?.answer === "Yes" && (points("safety_contact") >= 75 || points("safety_shutdown") >= 75)) add("missing_escalation_or_shutdown", "A consequential resource lacks a confirmed escalation or shutdown process.");
  if (responses.prohibited_use?.answer === "Yes") add("prohibited_use", "A prohibited, unlawful, deceptive, discriminatory, or materially harmful use was identified.", "critical");
  const uncertainCritical = GOVERNANCE_CATEGORIES.flatMap((category) => visibleStatements(category, responses)).some((statement) => statement.critical && responses[statement.id]?.answer === "Not Sure");
  if (uncertainCritical) add("critical_information_missing", "A critical safeguard is not yet confirmed.", "medium");
  const uniqueMissing = [...new Set(missing)];
  const status = uniqueMissing.length ? "assessment_pending" : (score >= threshold || overrides.length) ? "governance_review" : "cleared";
  return { assessment_version: ASSESSMENT_VERSION, overall_score: score, category_scores: categoryScores,
    initial_risk: band === "moderate_low" ? "medium" : band, final_risk: band === "moderate_low" ? "medium" : band,
    risk_band: band, review_threshold: threshold, overrides, missing: uniqueMissing, status, flagged: status !== "cleared", drivers,
    recommendations: drivers.map((driver) => `${driver.category}: strengthen or document the control described by “${driver.statement}”`),
    summary: status === "assessment_pending" ? "The resource was saved, but critical assessment information is incomplete."
      : status === "cleared" ? score < 20 ? "The resource was saved and automatically cleared as Low Risk." : "The resource was saved and automatically cleared with governance recommendations."
      : overrides.length ? "The resource was saved and sent to Admin review because a required safeguard needs attention." : `The resource was saved and sent to Admin review because its risk score meets the ${threshold}% review threshold.` };
}
