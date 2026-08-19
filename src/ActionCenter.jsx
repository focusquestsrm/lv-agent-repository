import { useMemo, useState } from "react";
import { actionSummary, buildAdminQueues, buildRecentlyCompleted, buildUserActions } from "./actionCenter";

const FILTERS = {
  drafts: (item) => item.itemType === "resource_draft",
  needs_changes: (item) => item.itemType === "needs_changes",
  governance_pending: (item) => ["governance_check", "governance_clarification"].includes(item.itemType),
  reviews_due: (item) => item.itemType === "resource_review",
};

const label = (value) => String(value || "standard").replaceAll("_", " ");
const formatDate = (value) => value ? new Date(value).toLocaleDateString() : "No due date";

function Priority({ value }) {
  const icon = value === "urgent" ? "!" : value === "due_soon" ? "◷" : "•";
  return <span className={`action-priority ${value}`}><span aria-hidden="true">{icon}</span>{label(value)}</span>;
}

function ActionRow({ item, onNavigate }) {
  return <article className="action-center-item">
    <div className="action-center-item-main"><header><Priority value={item.priority}/><span className="action-status">{label(item.status)}</span></header><h3>{item.title}</h3><p>{item.requiredAction}</p><dl><div><dt>Type</dt><dd>{label(item.resourceType)}</dd></div><div><dt>Company</dt><dd>{item.companyName || "Unassigned"}</dd></div><div><dt>Due</dt><dd>{formatDate(item.dueDate)}</dd></div></dl></div>
    <button className="action-link" onClick={() => onNavigate(item)}>{item.actionLabel}</button>
  </article>;
}

export default function ActionCenter({ resources = [], registrationDrafts = [], governanceRequests = [], clarifications = [], attentionItems = [], assessments = [], versions = [], duplicateMatches = [], audit = [], userId, role, onNavigate }) {
  const [filter, setFilter] = useState("all");
  const actions = useMemo(() => buildUserActions({ resources, registrationDrafts, governanceRequests, clarifications, attentionItems, userId }), [resources, registrationDrafts, governanceRequests, clarifications, attentionItems, userId]);
  const summary = useMemo(() => actionSummary(actions), [actions]);
  const adminQueues = useMemo(() => role === "admin" ? buildAdminQueues({ resources, assessments, governanceRequests, versions, duplicateMatches }) : [], [role, resources, assessments, governanceRequests, versions, duplicateMatches]);
  const completed = useMemo(() => buildRecentlyCompleted({ audit, resources, userId }), [audit, resources, userId]);
  const work = (filter === "all" ? actions : actions.filter(FILTERS[filter])).slice(0, 5);
  const tiles = [["drafts", "Drafts", summary.drafts], ["needs_changes", "Needs Changes", summary.needs_changes], ["governance_pending", "Governance Pending", summary.governance_pending], ["reviews_due", "Reviews Due Soon", summary.reviews_due]];
  return <div className="action-center">
    <div className="pagehead action-center-heading"><div><small>YOUR WORK</small><h1>Action Center</h1><p>Review work assigned to you, complete required actions, and resolve items that need attention.</p></div></div>
    <section className="action-center-section action-center-primary" aria-labelledby="needs-attention-heading"><header><div><small>PRIORITIZED ACTIONS</small><h2 id="needs-attention-heading">Needs Your Attention</h2></div><span>{actions.length} open</span></header>
      {!actions.length ? <div className="action-center-empty"><span aria-hidden="true">✓</span><div><h3>You’re all caught up.</h3><p>No resources currently require your attention.</p><button onClick={() => onNavigate({ route: "my-agents" })}>View My Resources</button></div></div> : <div className="action-center-list">{actions.map((item) => <ActionRow key={item.id} item={item} onNavigate={onNavigate}/>)}</div>}
    </section>
    <section className="action-center-section" aria-labelledby="my-work-heading"><header><div><small>OWNED OR CREATED BY YOU</small><h2 id="my-work-heading">My Work</h2></div></header><div className="action-summary-grid">{tiles.map(([id, tileLabel, count]) => <button key={id} aria-pressed={filter === id} onClick={() => setFilter((current) => current === id ? "all" : id)}><span>{tileLabel}</span><b>{count}</b></button>)}</div>
      {work.length ? <div className="action-center-compact-list">{work.map((item) => <button key={item.id} onClick={() => onNavigate(item)}><span><b>{item.title}</b><small>{item.requiredAction}</small></span><Priority value={item.priority}/></button>)}</div> : <p className="action-filter-empty">No records match this work filter.</p>}<button className="section-link" onClick={() => onNavigate({ route: "my-agents" })}>View All in My Resources →</button>
    </section>
    {role === "admin" && <section className="action-center-section" aria-labelledby="admin-queue-heading"><header><div><small>ADMIN ONLY</small><h2 id="admin-queue-heading">Admin Review Queue</h2></div></header><div className="admin-queue-grid">{adminQueues.map((queue) => <article key={queue.id}><header><span>{queue.name}</span><b>{queue.count}</b></header><p>{queue.description}</p><small>Highest priority or oldest: {queue.highlight}</small><button onClick={() => onNavigate({ route: queue.route })}>{queue.actionLabel}</button></article>)}</div></section>}
    {completed.length > 0 && <section className="action-center-section" aria-labelledby="recently-completed-heading"><header><div><small>YOUR ACTIVITY</small><h2 id="recently-completed-heading">Recently Completed</h2></div></header><div className="completed-list">{completed.map((item) => <article key={item.id}><span><b>{item.action}</b><small>{item.resourceName}</small></span><span>{new Date(item.completedAt).toLocaleDateString()}<small>{label(item.status)}</small></span></article>)}</div></section>}
  </div>;
}
