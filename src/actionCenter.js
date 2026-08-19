import { isArchivedResource, isMyResource } from "./resourceVisibility.js";

export const ACTION_CENTER_SOURCES = Object.freeze({
  resource_draft: "agents.status and resource_registration_drafts.status",
  needs_changes: "agents.status",
  governance_check: "governance_assessment_requests",
  governance_clarification: "governance_clarifications",
  resource_review: "agents.review_date",
  prompt_approval: "prompt_versions.status",
  potential_duplicate: "resource_duplicate_matches.status",
  ownership_exception: "agents.accountable_owner_id and agents.stewardship_status",
  recently_completed: "audit_log actions written by existing workflows",
});

const DAY = 86400000;
const PRIORITY_ORDER = { urgent: 0, due_soon: 1, standard: 2 };
const ACTIVE_DRAFT_STATUSES = new Set(["draft", "ready_for_submission"]);
const GOVERNANCE_REVIEW_STATUSES = new Set(["assessment_pending", "governance_review", "clarification_requested", "changes_requested"]);
const STEWARDSHIP_EXCEPTIONS = new Set(["migration_needed", "ownership_needs_verification", "hosting_needs_verification"]);

function timestamp(value) {
  const parsed = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function dueTimestamp(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T23:59:59.999`).getTime();
  return timestamp(value);
}

export function actionPriority(dueDate, now = new Date(), urgentWithoutDate = false) {
  if (typeof dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    const [year, month, day] = dueDate.split("-").map(Number);
    const dueDay = Date.UTC(year, month - 1, day);
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const daysUntilDue = Math.round((dueDay - today) / DAY);
    if (daysUntilDue < 0) return "urgent";
    if (daysUntilDue <= 7) return "due_soon";
    return urgentWithoutDate ? "urgent" : "standard";
  }
  const due = dueTimestamp(dueDate), today = now.getTime();
  if (due != null && due < today) return "urgent";
  if (due != null && due <= today + 7 * DAY) return "due_soon";
  return urgentWithoutDate ? "urgent" : "standard";
}

function resourceMeta(resource) {
  return {
    resourceId: resource?.id,
    resourceType: resource?.entry_type || "agent",
    companyId: resource?.company_id || null,
    companyName: resource?.companies?.name || "Unassigned",
    ownerUserId: resource?.accountable_owner_id || null,
  };
}

function sortActions(items) {
  return items.sort((left, right) => PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority]
    || (timestamp(left.dueDate) ?? Number.MAX_SAFE_INTEGER) - (timestamp(right.dueDate) ?? Number.MAX_SAFE_INTEGER)
    || (timestamp(right.updatedAt) ?? 0) - (timestamp(left.updatedAt) ?? 0));
}

export function buildUserActions({ resources = [], registrationDrafts = [], governanceRequests = [], clarifications = [], attentionItems = [], userId, now = new Date() }) {
  const items = [], mine = resources.filter((resource) => isMyResource(resource, userId));
  for (const resource of mine) {
    const common = { ...resourceMeta(resource), title: resource.name || "Untitled resource", assignedUserId: userId, updatedAt: resource.updated_at || resource.created_at };
    if (resource.status === "draft") items.push({ ...common, id: `resource-draft:${resource.id}`, itemType: "resource_draft", requiredAction: "Complete and submit this resource registration.", status: resource.status, priority: "standard", dueDate: null, route: "my-agents", actionLabel: "Continue Draft", actionKind: "edit_resource" });
    if (resource.status === "changes_requested") items.push({ ...common, id: `needs-changes:${resource.id}`, itemType: "needs_changes", requiredAction: "Review the requested changes and update the resource.", status: resource.status, priority: "standard", dueDate: null, route: "my-agents", actionLabel: "Make Changes", actionKind: "edit_resource" });
    if (resource.review_date) {
      const priority = actionPriority(resource.review_date, now);
      const reviewDue = dueTimestamp(resource.review_date);
      if (priority !== "standard" || reviewDue <= now.getTime() + 7 * DAY) items.push({ ...common, id: `resource-review:${resource.id}`, itemType: "resource_review", requiredAction: reviewDue < now.getTime() ? "The resource review date has passed." : "The resource review date is approaching.", status: reviewDue < now.getTime() ? "overdue" : "due soon", priority, dueDate: resource.review_date, route: "my-agents", actionLabel: "Review Resource", actionKind: "edit_resource" });
    }
    if (!resource.accountable_owner_id && resource.created_by === userId) items.push({ ...common, id: `missing-owner:${resource.id}`, itemType: "ownership_exception", requiredAction: "Confirm an accountable owner for this resource.", status: "owner missing", priority: "standard", dueDate: null, route: "my-agents", actionLabel: "Open Resource", actionKind: "edit_resource" });
    if (resource.entry_type === "platform" && !String(resource.platform_details?.access_request_instructions || "").trim()) items.push({ ...common, id: `access-instructions:${resource.id}`, itemType: "ownership_exception", requiredAction: "Add instructions explaining how authorized users request platform access.", status: "information missing", priority: "standard", dueDate: null, route: "my-agents", actionLabel: "Edit Access Instructions", actionKind: "edit_resource" });
  }
  for (const draft of registrationDrafts.filter((item) => item.user_id === userId && ACTIVE_DRAFT_STATUSES.has(item.status))) items.push({ id: `registration-draft:${draft.id}`, itemType: "resource_draft", title: draft.draft_form_data?.name || "Registration draft", resourceType: draft.selected_resource_type || draft.recommended_resource_type || "resource", companyId: draft.company_id || null, companyName: draft.draft_form_data?.company_name || "Unassigned", requiredAction: "Continue the saved registration draft.", status: draft.status, priority: "standard", dueDate: null, assignedUserId: userId, ownerUserId: userId, route: "action-center", actionLabel: "Continue Draft", actionKind: "resume_registration_draft", draftId: draft.id, updatedAt: draft.last_saved_at || draft.created_at });
  for (const request of governanceRequests.filter((item) => item.owner_id === userId && item.status === "pending")) {
    const resource = resources.find((item) => item.id === request.agent_id); if (!resource) continue;
    items.push({ ...resourceMeta(resource), id: `governance-check:${request.id}`, itemType: "governance_check", title: resource.name, requiredAction: "Complete the requested Governance Check.", status: request.due_at && timestamp(request.due_at) < now.getTime() ? "overdue" : "response required", priority: actionPriority(request.due_at, now), dueDate: request.due_at || null, assignedUserId: userId, route: "my-agents", actionLabel: "Complete Governance Check", actionKind: "edit_resource", updatedAt: request.created_at });
  }
  for (const clarification of clarifications.filter((item) => item.status === "open")) {
    const resource = resources.find((item) => item.id === clarification.agent_id); if (!resource || !isMyResource(resource, userId)) continue;
    items.push({ ...resourceMeta(resource), id: `governance-clarification:${clarification.id}`, itemType: "governance_clarification", title: resource.name, requiredAction: clarification.instructions || "Respond to the requested governance clarification.", status: clarification.due_at && timestamp(clarification.due_at) < now.getTime() ? "overdue" : "clarification requested", priority: actionPriority(clarification.due_at, now), dueDate: clarification.due_at || null, assignedUserId: userId, route: "governance", actionLabel: "Respond to Clarification", actionKind: "open_route", updatedAt: clarification.created_at });
  }
  for (const attention of attentionItems.filter((item) => item.status === "clarification_requested")) {
    if (clarifications.some((item) => item.agent_id === attention.agent_id && item.status === "open")) continue;
    const resource = resources.find((item) => item.id === attention.agent_id); if (!resource || !isMyResource(resource, userId)) continue;
    items.push({ ...resourceMeta(resource), id: `attention-clarification:${attention.id}`, itemType: "governance_clarification", title: resource.name, requiredAction: attention.recommended_action || attention.statement, status: "clarification requested", priority: "standard", dueDate: null, assignedUserId: userId, route: "governance", actionLabel: "Respond to Clarification", actionKind: "open_route", updatedAt: attention.created_at });
  }
  return sortActions(items);
}

export function actionSummary(items = []) {
  return {
    drafts: items.filter((item) => item.itemType === "resource_draft").length,
    needs_changes: items.filter((item) => item.itemType === "needs_changes").length,
    governance_pending: items.filter((item) => ["governance_check", "governance_clarification"].includes(item.itemType)).length,
    reviews_due: items.filter((item) => item.itemType === "resource_review").length,
  };
}

export function buildAdminQueues({ resources = [], assessments = [], governanceRequests = [], versions = [], duplicateMatches = [], now = new Date() }) {
  const active = resources.filter((resource) => !isArchivedResource(resource));
  const latestAssessment = (resourceId) => assessments.find((item) => item.agent_id === resourceId);
  const governance = active.filter((resource) => resource.governance_flagged || GOVERNANCE_REVIEW_STATUSES.has(latestAssessment(resource.id)?.review_status || resource.governance_status));
  const prompts = versions.filter((item) => item.status === "pending" && item.agents?.governance_flagged);
  const duplicates = duplicateMatches.filter((item) => item.status === "pending");
  const ownership = active.filter((resource) => !resource.accountable_owner_id || STEWARDSHIP_EXCEPTIONS.has(resource.stewardship_status));
  const overdue = governanceRequests.filter((item) => item.status === "pending" && timestamp(item.due_at) != null && timestamp(item.due_at) < now.getTime());
  const legacy = active.filter((resource) => !assessments.some((item) => item.agent_id === resource.id && item.assessment_version === "LV-GOV-2.0"));
  const queue = (id, name, records, route, description) => ({ id, name, count: records.length, highlight: records[0]?.name || records[0]?.agents?.name || resources.find((resource) => resource.id === records[0]?.agent_id || resource.id === records[0]?.resource_id)?.name || "No items waiting", route, actionLabel: "Open Queue", description });
  return [queue("governance", "Governance Review", governance, "governance", "Resources with unresolved deterministic governance status."), queue("prompts", "Prompt Approvals", prompts, "approvals", "Prompt versions waiting for controlled review."), queue("duplicates", "Potential Duplicates", duplicates, "duplicates", "Possible duplicate, similar, or overlapping resources."), queue("ownership", "Ownership and Stewardship Exceptions", ownership, "agents", "Resources missing confirmed ownership or stewardship information."), queue("overdue", "Overdue Governance Responses", overdue, "governance", "Owner responses past their requested deadline."), queue("legacy", "Legacy Governance Assessments", legacy, "governance", "Resources requiring the current deterministic assessment.")];
}

const COMPLETED_ACTIONS = {
  governance_assessed: ["Governance Check completed", "assessed"],
  governance_clarification_responded: ["Clarification answered", "responded"],
  governance_approved: ["Resource approved", "approved"],
  governance_approved_with_conditions: ["Resource approved", "approved with conditions"],
  access_scope_updated: ["Resource updated", "access updated"],
  access_update: ["Resource updated", "access updated"],
};

export function buildRecentlyCompleted({ audit = [], resources = [], userId }) {
  return audit.filter((item) => item.actor_id === userId && COMPLETED_ACTIONS[item.action]).map((item) => {
    const resourceId = item.details?.agent_id || (item.entity_type === "agents" ? item.entity_id : null), resource = resources.find((entry) => entry.id === resourceId);
    const [action, status] = COMPLETED_ACTIONS[item.action];
    return { id: item.id, action, resourceName: resource?.name || item.details?.resource_name || "Resource", completedAt: item.created_at, status };
  }).sort((left, right) => (timestamp(right.completedAt) || 0) - (timestamp(left.completedAt) || 0)).slice(0, 5);
}
