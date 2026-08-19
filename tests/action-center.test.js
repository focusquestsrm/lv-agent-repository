import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ACTION_CENTER_SOURCES,
  actionPriority,
  actionSummary,
  buildAdminQueues,
  buildRecentlyCompleted,
  buildUserActions,
} from "../src/actionCenter.js";

const NOW = new Date("2026-08-18T12:00:00Z");
const owned = (overrides = {}) => ({
  id: "resource-1",
  name: "Enrollment Platform",
  entry_type: "platform",
  status: "approved",
  governance_status: "cleared",
  created_by: "user-1",
  accountable_owner_id: "user-1",
  companies: { name: "D9 Network" },
  platform_details: { access_request_instructions: "Ask the service desk." },
  ...overrides,
});

test("Action Center uses deterministic overdue, due-soon, and standard priority", () => {
  assert.equal(actionPriority("2026-08-17", NOW), "urgent");
  assert.equal(actionPriority("2026-08-18", NOW), "due_soon", "date-only deadlines remain active through the end of the calendar day");
  assert.equal(actionPriority("2026-08-25", NOW), "due_soon");
  assert.equal(actionPriority("2026-08-26", NOW), "standard");
  assert.equal(actionPriority(null, NOW), "standard");
});

test("Action Center aggregates only work owned or created by the signed-in user", () => {
  const actions = buildUserActions({
    userId: "user-1",
    now: NOW,
    resources: [
      owned({ status: "draft" }),
      owned({ id: "other-resource", created_by: "user-2", accountable_owner_id: "user-2", status: "changes_requested" }),
    ],
    registrationDrafts: [{ id: "draft-1", user_id: "user-1", status: "draft", selected_resource_type: "agent", draft_form_data: { name: "Saved helper" } }],
  });
  assert.deepEqual(actions.map((item) => item.id).sort(), ["registration-draft:draft-1", "resource-draft:resource-1"]);
  assert.ok(actions.every((item) => item.assignedUserId === "user-1"));
});

test("Action Center includes governance, review, and missing-information actions", () => {
  const resource = owned({ review_date: "2026-08-20", platform_details: { access_request_instructions: null } });
  const actions = buildUserActions({
    userId: "user-1",
    now: NOW,
    resources: [resource],
    governanceRequests: [{ id: "request-1", agent_id: resource.id, owner_id: "user-1", status: "pending", due_at: "2026-08-17T12:00:00Z" }],
    clarifications: [{ id: "clarification-1", agent_id: resource.id, status: "open", instructions: "Explain data retention.", due_at: "2026-08-24T12:00:00Z" }],
  });
  assert.deepEqual(new Set(actions.map((item) => item.itemType)), new Set(["governance_check", "governance_clarification", "resource_review", "ownership_exception"]));
  assert.equal(actions[0].itemType, "governance_check");
  assert.equal(actionSummary(actions).governance_pending, 2);
});

test("Action Center admin queues reuse existing controlled workflows", () => {
  const resource = owned({ governance_flagged: true, accountable_owner_id: null, stewardship_status: "ownership_needs_verification" });
  const queues = buildAdminQueues({
    now: NOW,
    resources: [resource],
    assessments: [],
    governanceRequests: [{ id: "request-1", agent_id: resource.id, status: "pending", due_at: "2026-08-17T12:00:00Z" }],
    versions: [{ id: "version-1", status: "pending", agents: { name: resource.name, governance_flagged: true } }],
    duplicateMatches: [{ id: "match-1", resource_id: resource.id, status: "pending" }],
  });
  assert.deepEqual(queues.map((queue) => queue.route), ["governance", "approvals", "duplicates", "agents", "governance", "governance"]);
  assert.deepEqual(queues.map((queue) => queue.count), [1, 1, 1, 1, 1, 1]);
});

test("Recently Completed is derived only from reliable existing audit actions", () => {
  const completed = buildRecentlyCompleted({
    userId: "user-1",
    resources: [owned()],
    audit: [
      { id: "audit-1", actor_id: "user-1", action: "governance_clarification_responded", entity_type: "governance_clarifications", details: { agent_id: "resource-1" }, created_at: "2026-08-18T10:00:00Z" },
      { id: "audit-2", actor_id: "user-1", action: "unknown_action", created_at: "2026-08-18T11:00:00Z" },
      { id: "audit-3", actor_id: "user-2", action: "governance_assessed", details: { agent_id: "resource-1" }, created_at: "2026-08-18T12:00:00Z" },
    ],
  });
  assert.equal(completed.length, 1);
  assert.equal(completed[0].resourceName, "Enrollment Platform");
});

test("Action Center replaces the active Start Here route and keeps a bookmark redirect", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../src/ActionCenter.jsx", import.meta.url), "utf8");
  assert.match(app, /\["action-center", "✓", "Action Center"\]/);
  assert.doesNotMatch(app, /\["start-here", [^\]]+"Start Here"\]/);
  assert.match(app, /route === "start-here" \? "action-center" : route/);
  assert.match(page, /Needs Your Attention/);
  assert.match(page, /Admin Review Queue/);
  assert.match(page, /role === "admin"/);
  assert.equal(ACTION_CENTER_SOURCES.resource_draft, "agents.status and resource_registration_drafts.status");
});
