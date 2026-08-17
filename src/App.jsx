import { useEffect, useState } from "react";
import { supabase, configured } from "./supabase";
const checks = [
  "Fairness & bias",
  "Privacy & data",
  "Accuracy & grounding",
  "Safety & oversight",
  "Transparency",
  "Security",
];
export default function App() {
  const [session, setSession] = useState(null),
    [profile, setProfile] = useState(null),
    [profileError, setProfileError] = useState(""),
    [loading, setLoading] = useState(true),
    [recovery, setRecovery] = useState(false);
  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (session && !recovery)
      supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single()
        .then(({ data, error }) => {
          setProfile(data);
          setProfileError(error?.message || (!data ? "Your account exists, but its access profile has not been created yet." : ""));
        });
    else if (!session) setProfile(null);
  }, [session, recovery]);
  if (loading) return <Splash text="Loading secure workspace…" />;
  if (!configured) return <Setup />;
  if (recovery) return <SetPassword done={() => setRecovery(false)} />;
  if (!session) return <Auth />;
  if (!profile)
    return (
      <Splash
        text={
          profileError ||
          "Preparing your account…"
        }
      />
    );
  return (
    <Registry session={session} profile={profile} setProfile={setProfile} />
  );
}
function Auth() {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [fullName, setFullName] = useState(""),
    [mode, setMode] = useState("signin"),
    [message, setMessage] = useState("");
  async function submit(e) {
    e.preventDefault();
    setMessage("");
    if (mode === "forgot") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      setMessage(
        error
          ? error.message
          : "Check your email for a secure password-reset link.",
      );
      return;
    }
    const request =
      mode === "signin"
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({
            email,
            password,
            options: { data: { full_name: fullName } },
          });
    const { error } = await request;
    if (error) setMessage(error.message);
    else if (mode === "signup")
      setMessage(
        "Account created. Check your email if confirmation is enabled.",
      );
  }
  const heading =
    mode === "signin"
      ? "Welcome back"
      : mode === "signup"
        ? "Join the workspace"
        : "Reset your password";
  return (
    <div className="auth">
      <section>
        <Logo />
        <p className="kicker">GOVERNED AI OPERATIONS</p>
        <h1>
          Your agents.
          <br />
          Accountable by design.
        </h1>
        <p>
          One secure workspace for prompts, approvals, responsible AI controls,
          and access.
        </p>
      </section>
      <form onSubmit={submit}>
        <h2>{heading}</h2>
        <p>
          {mode === "forgot"
            ? "We’ll email you a secure link to choose a new password."
            : "Use your Lead Ventures or FocusQuest email."}
        </p>
        {mode === "signup" && (
          <label>
            Full name
            <input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </label>
        )}
        <label>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        {mode !== "forgot" && (
          <label>
            Password
            <input
              type="password"
              minLength="8"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}
        {message && <div className="message">{message}</div>}
        <button className="primary">
          {mode === "signin"
            ? "Sign in"
            : mode === "signup"
              ? "Join workspace"
              : "Send reset link"}
        </button>
        {mode === "signin" && (
          <button
            type="button"
            className="link"
            onClick={() => setMode("forgot")}
          >
            Forgot your password?
          </button>
        )}
        <button
          type="button"
          className="link"
          onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
        >
          {mode === "signup"
            ? "Already have an account? Sign in"
            : "New to the registry? Join workspace"}
        </button>
        {mode === "forgot" && (
          <button
            type="button"
            className="link"
            onClick={() => setMode("signin")}
          >
            Back to sign in
          </button>
        )}
      </form>
    </div>
  );
}
function SetPassword({ done }) {
  const [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [message, setMessage] = useState("");
  async function submit(e) {
    e.preventDefault();
    if (password !== confirm) return setMessage("Passwords do not match.");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setMessage(error.message);
    else {
      setMessage("Password updated successfully.");
      setTimeout(done, 900);
    }
  }
  return (
    <div className="auth">
      <section>
        <Logo />
        <p className="kicker">SECURE ACCOUNT RECOVERY</p>
        <h1>Choose a new password.</h1>
        <p>
          Your reset link has been verified. Create a strong password to return
          to the registry.
        </p>
      </section>
      <form onSubmit={submit}>
        <h2>Set new password</h2>
        <p>
          Use at least eight characters and avoid a password used elsewhere.
        </p>
        <label>
          New password
          <input
            type="password"
            minLength="8"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          Confirm password
          <input
            type="password"
            minLength="8"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        {message && <div className="message">{message}</div>}
        <button className="primary">Update password</button>
      </form>
    </div>
  );
}
function Registry({ session, profile }) {
  const [view, setView] = useState("dashboard"),
    [agents, setAgents] = useState([]),
    [versions, setVersions] = useState([]),
    [users, setUsers] = useState([]),
    [companies, setCompanies] = useState([]),
    [busy, setBusy] = useState(true),
    [modal, setModal] = useState(false),
    [companyModal, setCompanyModal] = useState(false),
    [toast, setToast] = useState(""),
    [theme, setTheme] = useState(
      () => localStorage.getItem("lv-agent-theme") || "current",
    ),
    [tour, setTour] = useState(
      () => localStorage.getItem("lv-agent-tour-complete") !== "yes",
    );
  const canEdit = ["admin", "editor"].includes(profile.role),
    admin = profile.role === "admin";
  async function load() {
    setBusy(true);
    const [a, v, u, c] = await Promise.all([
      supabase
        .from("agents")
        .select("*,companies(name)")
        .order("updated_at", { ascending: false }),
      supabase
        .from("prompt_versions")
        .select("*,agents(name,governance_flagged)")
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("*").order("full_name"),
      supabase.from("companies").select("*").order("name"),
    ]);
    setAgents(a.data || []);
    setVersions(v.data || []);
    setUsers(u.data || []);
    setCompanies(c.data || []);
    setBusy(false);
  }
  useEffect(() => {
    load();
  }, [profile.role, profile.can_assign_reviews, profile.can_approve_agents]);
  useEffect(() => {
    localStorage.setItem("lv-agent-theme", theme);
  }, [theme]);
  async function approvePrompt(id, status) {
    const { error } = await supabase
      .from("prompt_versions")
      .update({
        status,
        approved_by: session.user.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) setToast(error.message);
    else {
      setToast(`Prompt change ${status}.`);
      load();
    }
  }
  const nav = [
    ["dashboard", "▥", "Dashboard"],
    ["agents", "▦", "Agents & Skillsets"],
    ["approvals", "✓", "Prompt Approvals"],
    ["governance", "◇", "AI Governance"],
    ...(admin
      ? [
          ["companies", "◫", "Companies"],
          ["users", "♙", "Admin · Users & Access"],
          ["settings", "⚙", "Admin · AI Settings"],
        ]
      : []),
  ];
  return (
    <main className={`shell ${theme === "light" ? "light-theme" : ""}`}>
      <aside>
        <Logo />
        <nav data-tour="navigation">
          {nav.map(([id, icon, label]) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              onClick={() => setView(id)}
            >
              {icon}
              <span>{label}</span>
              {id === "approvals" &&
                versions.filter((v) => v.status === "pending" && v.agents?.governance_flagged).length > 0 && (
                  <em>
                    {versions.filter((v) => v.status === "pending" && v.agents?.governance_flagged).length}
                  </em>
                )}
            </button>
          ))}
        </nav>
        <div className="me">
          <i>{initials(profile.full_name || profile.email)}</i>
          <div>
            <b>{profile.full_name || profile.email}</b>
            <small>{profile.role}</small>
          </div>
        </div>
      </aside>
      <section className="content">
        <header>
          <span>
            Agent Registry /{" "}
            <b>
              {
                {
                  dashboard: "Dashboard",
                  agents: "Agents & Skillsets",
                  approvals: "Prompt Approvals",
                  governance: "AI Governance",
                  companies: "Companies",
                  users: "Users & Access",
                  settings: "AI Settings",
                }[view]
              }
            </b>
          </span>
          <div className="header-actions">
            <label className="theme-picker">
              <span>Appearance</span>
              <select
                aria-label="Choose appearance"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
              >
                <option value="current">Dark</option>
                <option value="light">Light</option>
              </select>
            </label>
            <button className="tour-trigger" onClick={() => setTour(true)}>
              ? Take a tour
            </button>
            <button onClick={() => supabase.auth.signOut()}>Sign out</button>
          </div>
        </header>
        {toast && (
          <div className="toast">
            {toast}
            <button onClick={() => setToast("")}>×</button>
          </div>
        )}
        {view === "dashboard" && (
          <Dashboard
            agents={agents}
            companies={companies}
            busy={busy}
            open={() => setModal(true)}
          />
        )}{" "}
        {view === "agents" && (
          <Agents
            rows={agents}
            companies={companies}
            busy={busy}
            canEdit={canEdit}
            open={() => setModal(true)}
          />
        )}{" "}
        {view === "approvals" && (
          <Approvals
            rows={versions}
            busy={busy}
            admin={admin}
            approve={approvePrompt}
          />
        )}{" "}
        {view === "governance" && <Governance agents={agents} />}{" "}
        {view === "companies" && (
          <Companies
            rows={companies}
            agents={agents}
            admin={admin}
            open={() => setCompanyModal(true)}
          />
        )}{" "}
        {view === "users" && (
          <Users
            rows={users}
            companies={companies}
            admin={admin}
            session={session}
            reload={load}
          />
        )}
        {view === "settings" && <AISettings user={session.user} />}
      </section>
        {modal && (
          <AgentForm
            user={session.user}
            companies={companies}
            close={() => setModal(false)}
            saved={() => {
              setModal(false);
              setToast("Entry created and governance assessment completed.");
            load();
          }}
        />
      )}
      {companyModal && (
        <CompanyForm
          user={session.user}
          close={() => setCompanyModal(false)}
          saved={() => {
            setCompanyModal(false);
            setToast("Company added.");
            load();
          }}
        />
      )}
      {tour && (
        <Tour
          role={profile.role}
          setView={setView}
          close={() => {
            localStorage.setItem("lv-agent-tour-complete", "yes");
            setTour(false);
          }}
        />
      )}
    </main>
  );
}
function Dashboard({ agents, companies, busy, open }) {
  const flagged = agents.filter((a) => a.governance_flagged);
  const owned = [...new Set(agents.map((a) => a.owner_name).filter(Boolean))];
  return (
    <>
      <section className="dashboard-hero">
        <div>
          <small>LEAD VENTURES AI ENABLEMENT</small>
          <h1>Build boldly. Govern intelligently.</h1>
          <p>
            Create agents and skillsets freely. Keep ownership visible. Escalate
            only meaningful governance risk.
          </p>
          <button className="primary" onClick={open}>
            ＋ Add agent or skillset
          </button>
        </div>
        <aside>
          <span>Governance signal</span>
          <b>{flagged.length}</b>
          <p>{flagged.length === 1 ? "entry needs" : "entries need"} review</p>
        </aside>
      </section>
      <Stats
        values={[
          [agents.length, "Total entries"],
          [agents.filter((a) => a.entry_type !== "skillset").length, "Agents"],
          [agents.filter((a) => a.entry_type === "skillset").length, "Skillsets"],
          [flagged.length, "Governance flags"],
        ]}
      />
      {busy ? (
        <Loading />
      ) : (
        <div className="dashboard-grid">
          <section className="panel">
            <h2>Entries by company</h2>
            {companies.length === 0 ? (
              <p className="muted">
                Add a company to begin portfolio reporting.
              </p>
            ) : (
              companies.map((c) => {
                const count = agents.filter(
                  (a) => a.company_id === c.id,
                ).length;
                return (
                  <div className="metric-row" key={c.id}>
                    <span>{c.name}</span>
                    <div>
                      <i
                        style={{
                          width: `${agents.length ? Math.max(4, (count / agents.length) * 100) : 4}%`,
                        }}
                      />
                    </div>
                    <b>{count}</b>
                  </div>
                );
              })
            )}
          </section>
          <section className="panel">
            <h2>Ownership coverage</h2>
            {owned.length === 0 ? (
              <p className="muted">
                Owners will appear when agents are registered.
              </p>
            ) : (
              owned.slice(0, 6).map((o) => (
                <div className="owner-row" key={o}>
                  <i>{initials(o)}</i>
                  <span>{o}</span>
                  <b>
                    {agents.filter((a) => a.owner_name === o).length} agent
                    {agents.filter((a) => a.owner_name === o).length === 1
                      ? ""
                      : "s"}
                  </b>
                </div>
              ))
            )}
          </section>
          <section className="panel wide">
            <h2>Agent and skillset portfolio</h2>
            <div className="table embedded">
              <table>
                <thead>
                  <tr>
                    <th>Entry</th>
                    <th>Type</th>
                    <th>Company</th>
                    <th>Owner</th>
                    <th>Platform</th>
                    <th>Status</th>
                    <th>Risk</th>
                    <th>Governance</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.slice(0, 10).map((a) => (
                    <tr key={a.id}>
                      <td>
                        <b>{a.name}</b>
                      </td>
                      <td>{a.entry_type || "agent"}</td>
                      <td>{a.companies?.name || "Unassigned"}</td>
                      <td>{a.owner_name}</td>
                      <td>{a.platform}</td>
                      <td>
                        <Pill text={a.status} />
                      </td>
                      <td>{a.governance_flagged ? <span className="risk-flag">⚑ {a.risk_level} risk</span> : <span className="governance-cleared">✓ Cleared</span>}</td>
                      <td>
                        {a.governance_score == null
                          ? "—"
                          : `${a.governance_score}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
function Agents({ rows, companies, busy, canEdit, open }) {
  const [company, setCompany] = useState("all");
  const visible =
    company === "all" ? rows : rows.filter((a) => a.company_id === company);
  return (
    <>
      <PageHead
        tag="TEAM INTELLIGENCE"
        title="Agents & Skillsets"
        desc="A governed source of truth for the AI agents and reusable skillsets your team builds."
        action={
          canEdit && (
            <button className="primary" onClick={open}>
              ＋ Add agent or skillset
            </button>
          )
        }
      />
      <div className="filterbar">
        <label>
          Agents by Company
          <select value={company} onChange={(e) => setCompany(e.target.value)}>
            <option value="all">All companies</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Stats
        values={[
          [visible.length, "Total entries"],
          [visible.filter((x) => x.entry_type === "skillset").length, "Skillsets"],
          [
            visible.filter((x) => x.governance_flagged).length,
            "Governance flags",
          ],
          [
            visible.length
              ? `${Math.round(visible.reduce((s, x) => s + (x.governance_score || 0), 0) / visible.length)}%`
              : "—",
            "Governance score",
          ],
        ]}
      />
      {busy ? (
        <Loading />
      ) : visible.length === 0 ? (
        <Empty
          title="No agents or skillsets found"
          text="Add an entry or select a different company."
          action={
            canEdit && (
              <button className="primary" onClick={open}>
                Add agent or skillset
              </button>
            )
          }
        />
      ) : (
        <div className="table">
          <table>
            <thead>
              <tr>
                <th>Entry</th>
                <th>Type</th>
                <th>Company</th>
                <th>Owner</th>
                <th>Runs on</th>
                <th>Status</th>
                <th>Risk</th>
                <th>Governance</th>
                <th>URL</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((a) => (
                <tr key={a.id}>
                  <td>
                    <b>{a.name}</b>
                    <small>{a.description}</small>
                  </td>
                  <td>{a.entry_type || "agent"}</td>
                  <td>{a.companies?.name || "Unassigned"}</td>
                  <td>{a.owner_name || "—"}</td>
                  <td>
                    {a.platform || "—"}
                    <small>{a.environment}</small>
                  </td>
                  <td>
                    <Pill text={a.status} />
                  </td>
                  <td>{a.governance_flagged ? <span className="risk-flag">⚑ {a.risk_level} risk</span> : <span className="governance-cleared">✓ Cleared</span>}</td>
                  <td>
                    {a.governance_score ?? "—"}
                    {a.governance_score != null && "%"}
                  </td>
                  <td>
                    {a.url ? (
                      <a href={a.url} target="_blank" rel="noreferrer">
                        Open ↗
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
function Requests({
  rows,
  approvals,
  users,
  session,
  busy,
  coordinator,
  approver,
  open,
  assign,
  decide,
  authorize,
}) {
  return (
    <>
      <PageHead
        tag="STAGE 0 · REQUIREMENTS"
        title="Agent Requests"
        desc="Define the need, assess technical impact, assign reviewers, and authorize work before development begins."
        action={
          <button className="primary" onClick={open}>
            ＋ Request an agent
          </button>
        }
      />
      <div className="stagebar">
        {[
          "Requirements",
          "Triage & routing",
          "Required reviews",
          "Build authorization",
          "Agent delivery",
        ].map((x, i) => (
          <span key={x}>
            <b>{i + 1}</b>
            {x}
          </span>
        ))}
      </div>
      {busy ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty
          title="No agent requests yet"
          text="Submit the business need before an agent is designed or built."
          action={
            <button className="primary" onClick={open}>
              Create first request
            </button>
          }
        />
      ) : (
        <div className="request-list">
          {rows.map((r) => {
            const assigned = approvals.filter((a) => a.request_id === r.id),
              mine = assigned.filter(
                (a) =>
                  a.reviewer_id === session.user.id && a.status === "assigned",
              ),
              technical = r.technical_review_required;
            return (
              <article className="request-card" key={r.id}>
                <header>
                  <div>
                    <small>
                      {r.companies?.name || "Unassigned"} · {r.department} ·{" "}
                      {r.category}
                    </small>
                    <h2>{r.proposed_name}</h2>
                    <p>{r.business_problem}</p>
                  </div>
                  <div>
                    <Pill text={r.status} />
                    {technical && (
                      <span className="technical">Technical review</span>
                    )}
                  </div>
                </header>
                <div className="request-facts">
                  <span>
                    <b>Outcome</b>
                    {r.desired_outcome}
                  </span>
                  <span>
                    <b>Users</b>
                    {r.intended_users}
                  </span>
                  <span>
                    <b>Success</b>
                    {r.success_measures}
                  </span>
                  <span>
                    <b>Scope</b>
                    {r.agent_scope}
                  </span>
                </div>
                <div className="flags">
                  {r.uses_database && <span>Database</span>}
                  {r.uses_api && <span>API / integration</span>}
                  {r.uses_sensitive_data && <span>Sensitive data</span>}
                  {r.crosses_departments && <span>Multiple departments</span>}
                  {r.affected_areas && (
                    <span>Affected: {r.affected_areas}</span>
                  )}
                </div>
                <section className="reviewers">
                  <h3>Assigned reviews</h3>
                  {assigned.length === 0 ? (
                    <p>No reviewers assigned yet.</p>
                  ) : (
                    assigned.map((a) => (
                      <div key={a.id}>
                        <span>
                          <b>{a.reviewer?.full_name || a.reviewer?.email}</b>
                          <small>
                            {a.review_type} ·{" "}
                            {a.required ? "required" : "advisory"}
                          </small>
                        </span>
                        <Pill text={a.status} />
                      </div>
                    ))
                  )}
                </section>
                {coordinator && (
                  <Routing
                    request={r}
                    users={users}
                    assigned={assigned}
                    assign={assign}
                  />
                )}{" "}
                {mine.map((a) => (
                  <div className="decision" key={a.id}>
                    <b>Your review is required</b>
                    <button onClick={() => decide(a.id, "discussion_needed")}>
                      Discuss
                    </button>
                    <button onClick={() => decide(a.id, "changes_requested")}>
                      Request changes
                    </button>
                    <button
                      className="primary"
                      onClick={() => decide(a.id, "approved")}
                    >
                      Approve
                    </button>
                  </div>
                ))}
                {coordinator && r.status === "approved" && (
                  <footer>
                    <button className="primary" onClick={() => authorize(r.id)}>
                      Authorize build
                    </button>
                  </footer>
                )}
                {r.status === "build_authorized" && (
                  <footer>
                    <span className="authorized">
                      ✓ Approved requirements · Build may begin
                    </span>
                  </footer>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
function Routing({ request, users, assigned, assign }) {
  const [reviewer, setReviewer] = useState(""),
    [type, setType] = useState(
      request.technical_review_required ? "technical" : "business",
    ),
    [required, setRequired] = useState(true);
  const available = users.filter(
    (u) => u.can_approve_agents || u.role === "admin",
  );
  return (
    <div className="routing">
      <b>Assign reviewer</b>
      <select value={reviewer} onChange={(e) => setReviewer(e.target.value)}>
        <option value="">Select reviewer</option>
        {available.map((u) => (
          <option key={u.id} value={u.id}>
            {u.full_name || u.email}
          </option>
        ))}
      </select>
      <select value={type} onChange={(e) => setType(e.target.value)}>
        {[
          "business",
          "technical",
          "data",
          "security",
          "department",
          "advisory",
        ].map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
      <label>
        <input
          type="checkbox"
          checked={required}
          onChange={(e) => setRequired(e.target.checked)}
        />{" "}
        Required
      </label>
      <button
        disabled={!reviewer}
        onClick={() => {
          assign(request.id, reviewer, type, required);
          setReviewer("");
        }}
      >
        Assign
      </button>
    </div>
  );
}
function RequestForm({ user, companies, close, saved }) {
  const [form, setForm] = useState({
      proposed_name: "",
      company_id: "",
      department: "",
      category: "",
      business_problem: "",
      desired_outcome: "",
      intended_users: "",
      current_process: "",
      success_measures: "",
      proposed_owner: "",
      agent_scope: "individual",
      data_sources: "",
      integrations: "",
      affected_areas: "",
      requester_notes: "",
      uses_database: false,
      uses_api: false,
      uses_sensitive_data: false,
      crosses_departments: false,
    }),
    [error, setError] = useState("");
  function set(k, v) {
    setForm({ ...form, [k]: v });
  }
  async function submit(e) {
    e.preventDefault();
    const technical =
      form.uses_database ||
      form.uses_api ||
      form.uses_sensitive_data ||
      form.crosses_departments ||
      form.agent_scope === "enterprise";
    const { error } = await supabase
      .from("agent_requests")
      .insert({
        ...form,
        company_id: form.company_id || null,
        technical_review_required: technical,
        requested_by: user.id,
      });
    if (error) setError(error.message);
    else saved();
  }
  return (
    <div className="backdrop">
      <form className="modal request-form" onSubmit={submit}>
        <header>
          <div>
            <small>PRE-BUILD GOVERNANCE</small>
            <h2>Request an AI agent</h2>
            <p>Describe the requirement before anyone begins development.</p>
          </div>
          <button type="button" onClick={close}>
            ×
          </button>
        </header>
        <label>
          Proposed agent name
          <input
            required
            value={form.proposed_name}
            onChange={(e) => set("proposed_name", e.target.value)}
          />
        </label>
        <label>
          Company
          <select
            required
            value={form.company_id}
            onChange={(e) => set("company_id", e.target.value)}
          >
            <option value="">Select company</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Department
          <input
            required
            value={form.department}
            onChange={(e) => set("department", e.target.value)}
          />
        </label>
        <label>
          Agent category
          <input
            required
            placeholder="e.g., Operations, Marketing, Enrollment"
            value={form.category}
            onChange={(e) => set("category", e.target.value)}
          />
        </label>
        <label className="full">
          Business problem
          <textarea
            required
            value={form.business_problem}
            onChange={(e) => set("business_problem", e.target.value)}
          />
        </label>
        <label className="full">
          Desired outcome
          <textarea
            required
            value={form.desired_outcome}
            onChange={(e) => set("desired_outcome", e.target.value)}
          />
        </label>
        <label>
          Intended users
          <input
            required
            value={form.intended_users}
            onChange={(e) => set("intended_users", e.target.value)}
          />
        </label>
        <label>
          Proposed owner
          <input
            value={form.proposed_owner}
            onChange={(e) => set("proposed_owner", e.target.value)}
          />
        </label>
        <label className="full">
          Current process
          <input
            value={form.current_process}
            onChange={(e) => set("current_process", e.target.value)}
          />
        </label>
        <label className="full">
          Success measures
          <input
            required
            value={form.success_measures}
            onChange={(e) => set("success_measures", e.target.value)}
          />
        </label>
        <label>
          Scope
          <select
            value={form.agent_scope}
            onChange={(e) => set("agent_scope", e.target.value)}
          >
            <option value="individual">Individual</option>
            <option value="team">Team</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </label>
        <label>
          Data sources
          <input
            value={form.data_sources}
            onChange={(e) => set("data_sources", e.target.value)}
          />
        </label>
        <label>
          Integrations
          <input
            value={form.integrations}
            onChange={(e) => set("integrations", e.target.value)}
          />
        </label>
        <label>
          Affected areas / people
          <input
            value={form.affected_areas}
            onChange={(e) => set("affected_areas", e.target.value)}
          />
        </label>
        <fieldset className="full">
          <legend>Technical and governance indicators</legend>
          {[
            ["uses_database", "Database access"],
            ["uses_api", "API or system integration"],
            ["uses_sensitive_data", "Sensitive or regulated data"],
            ["crosses_departments", "Multiple departments or owners"],
          ].map(([k, l]) => (
            <label key={k}>
              <input
                type="checkbox"
                checked={form[k]}
                onChange={(e) => set(k, e.target.checked)}
              />
              {l}
            </label>
          ))}
        </fieldset>
        <label className="full">
          Routing notes
          <textarea
            value={form.requester_notes}
            onChange={(e) => set("requester_notes", e.target.value)}
          />
        </label>
        {error && <div className="message">{error}</div>}
        <footer>
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button className="primary">Submit requirements</button>
        </footer>
      </form>
    </div>
  );
}
function AgentForm({ user, companies, close, saved }) {
  const [form, setForm] = useState({
      entry_type: "agent",
      company_id: "",
      name: "",
      description: "",
      owner_name: "",
      category: "",
      department: "",
      skills_summary: "",
      platform: "Claude",
      environment: "",
      url: "",
      prompt: "",
      uses_database: false,
      uses_api: false,
      uses_sensitive_data: false,
      crosses_departments: false,
    }),
    [error, setError] = useState(""),
    [checking, setChecking] = useState(false);
  function set(k, v) {
    setForm({ ...form, [k]: v });
  }
  async function submit(e) {
    e.preventDefault();
    setError("");
    setChecking(true);
    let assessment;
    try {
      const response = await fetch("/api/governance-check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Governance check failed.");
      assessment = result;
    } catch (err) {
      setChecking(false);
      return setError(
        err.message || "The governance assessment could not be completed.",
      );
    }
    const { data, error: e1 } = await supabase
      .from("agents")
      .insert({
        entry_type: form.entry_type,
        company_id: form.company_id,
        name: form.name,
        description: form.description,
        owner_name: form.owner_name,
        category: form.category || null,
        department: form.department || null,
        skills_summary: form.skills_summary || null,
        platform: form.platform,
        environment: form.environment,
        url: form.url || null,
        uses_database: form.uses_database,
        uses_api: form.uses_api,
        uses_sensitive_data: form.uses_sensitive_data,
        crosses_departments: form.crosses_departments,
        risk_level: assessment.risk_level,
        governance_score: assessment.governance_score,
        governance_flagged: assessment.flagged,
        governance_summary: assessment.summary,
        governance_checked_at: new Date().toISOString(),
        governance_provider: assessment.provider,
        status: assessment.flagged ? "pending" : "approved",
        created_by: user.id,
      })
      .select()
      .single();
    if (e1) {
      setChecking(false);
      return setError(e1.message);
    }
    const { data: version, error: e2 } = await supabase
      .from("prompt_versions")
      .insert({
        agent_id: data.id,
        version_number: 1,
        prompt_text: form.prompt,
        change_explanation: "Initial prompt evaluated by AI governance.",
        status: assessment.flagged ? "pending" : "approved",
        created_by: user.id,
      })
      .select()
      .single();
    if (e2) {
      setChecking(false);
      return setError(e2.message);
    }
    if (assessment.checks?.length) {
      await supabase.from("governance_reviews").insert(
        assessment.checks.map((check) => ({
          agent_id: data.id,
          prompt_version_id: version.id,
          category: check.category,
          score: check.score,
          status: check.status,
          findings: check.findings,
          reviewer_id: user.id,
        })),
      );
    }
    setChecking(false);
    saved();
  }
  return (
    <div className="backdrop">
      <form className="modal compact" onSubmit={submit}>
        <header>
          <div>
            <small>OPEN CREATION · GOVERNANCE MONITORED</small>
            <h2>Add an agent or skillset</h2>
          </div>
          <button type="button" onClick={close}>
            ×
          </button>
        </header>
        <label>
          Entry type
          <select
            value={form.entry_type}
            onChange={(e) => set("entry_type", e.target.value)}
          >
            <option value="agent">Agent</option>
            <option value="skillset">Skillset</option>
          </select>
        </label>
        <label>
          Company
          <select
            required
            value={form.company_id}
            onChange={(e) => set("company_id", e.target.value)}
          >
            <option value="">Select company</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Name
          <input required value={form.name} onChange={(e) => set("name", e.target.value)} />
        </label>
        <label>
          Accountable owner
          <input required value={form.owner_name} onChange={(e) => set("owner_name", e.target.value)} />
        </label>
        <label>
          Department
          <input value={form.department} onChange={(e) => set("department", e.target.value)} />
        </label>
        <label>
          Category
          <input value={form.category} onChange={(e) => set("category", e.target.value)} />
        </label>
        <label className="full">
          Purpose and description
          <textarea required value={form.description} onChange={(e) => set("description", e.target.value)} />
        </label>
        <label className="full">
          Capabilities or skills
          <textarea value={form.skills_summary} onChange={(e) => set("skills_summary", e.target.value)} />
        </label>
        <label>
          Platform
          <select
            value={form.platform}
            onChange={(e) => set("platform", e.target.value)}
          >
            <option>Claude</option>
            <option>ChatGPT</option>
            <option>Microsoft Copilot</option>
            <option>Other</option>
          </select>
        </label>
        <label>
          Where it runs
          <input
            required
            value={form.environment}
            onChange={(e) => set("environment", e.target.value)}
          />
        </label>
        <label>
          URL
          <input
            value={form.url}
            onChange={(e) => set("url", e.target.value)}
          />
        </label>
        <fieldset className="full governance-inputs">
          <legend>Technical and data considerations</legend>
          {[
            ["uses_database", "Uses a database"],
            ["uses_api", "Uses APIs or integrations"],
            ["uses_sensitive_data", "Uses sensitive or regulated data"],
            ["crosses_departments", "Affects multiple departments"],
          ].map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={form[key]}
                onChange={(e) => set(key, e.target.checked)}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <label className="full">
          Initial prompt
          <textarea
            required
            value={form.prompt}
            onChange={(e) => set("prompt", e.target.value)}
          />
        </label>
        {error && <div className="message">{error}</div>}
        <footer>
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button className="primary" disabled={checking}>
            {checking ? "Running governance check…" : "Check governance & create"}
          </button>
        </footer>
      </form>
    </div>
  );
}
function Approvals({ rows, busy, admin, approve }) {
  const pending = rows.filter((x) => x.status === "pending" && x.agents?.governance_flagged);
  return (
    <>
      <PageHead
        tag="CONTROLLED RELEASES"
        title="Prompt Approvals"
        desc="Review prompt changes before they become an active production version."
      />
      {busy ? (
        <Loading />
      ) : pending.length === 0 ? (
        <Empty
          title="Approval queue is clear"
          text="Only prompts attached to a governance-flagged agent or skillset appear here."
        />
      ) : (
        <div className="cards">
          {pending.map((v) => (
            <article key={v.id}>
              <div>
                <small>
                  {v.agents?.name} · v{v.version_number}
                </small>
                <h3>{v.change_explanation}</h3>
                <pre>{v.prompt_text}</pre>
              </div>
              <footer>
                {admin ? (
                  <>
                    <button onClick={() => approve(v.id, "changes_requested")}>
                      Request changes
                    </button>
                    <button
                      className="primary"
                      onClick={() => approve(v.id, "approved")}
                    >
                      Approve & publish
                    </button>
                  </>
                ) : (
                  <span>Admin approval required</span>
                )}
              </footer>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
function Governance({ agents }) {
  const flagged = agents.filter((agent) => agent.governance_flagged);
  return (
    <>
      <PageHead
        tag="RESPONSIBLE AI"
        title="AI Governance"
        desc="Automated screening across fairness, privacy, accuracy, safety, transparency, and security. Only meaningful risk is flagged."
      />
      {flagged.length === 0 ? (
        <Empty
          title="No governance risks flagged"
          text="Registered agents and skillsets have either cleared the automated assessment or have not yet been evaluated."
        />
      ) : (
        <div className="governance-flags">
          {flagged.map((agent) => (
            <article key={agent.id}>
              <header>
                <div>
                  <small>{agent.entry_type || "agent"} · {agent.companies?.name || "Unassigned"}</small>
                  <h2>{agent.name}</h2>
                </div>
                <span className="risk-flag">⚑ {agent.risk_level} risk</span>
              </header>
              <p>{agent.governance_summary}</p>
              <footer>
                <b>Governance score: {agent.governance_score ?? "—"}</b>
                <span>{agent.governance_provider || "Automated assessment"}</span>
              </footer>
            </article>
          ))}
        </div>
      )}
      <section className="standard">
        <h2>Lead Ventures agent standard</h2>
        <div>
          {[
            "Clear approved purpose",
            "Named accountable owner",
            "Human review for high-impact decisions",
            "Grounded outputs and uncertainty labels",
            "Representative bias evaluation",
            "Data minimization and retention rules",
            "Failure, escalation, and rollback plan",
            "Quarterly access review",
          ].map((x) => (
            <span key={x}>✓ {x}</span>
          ))}
        </div>
      </section>
    </>
  );
}
function Companies({ rows, agents, admin, open }) {
  return (
    <>
      <PageHead
        tag="PORTFOLIO ADMINISTRATION"
        title="Companies"
        desc="Manage the Lead Ventures companies represented in the agent portfolio."
        action={
          admin && (
            <button className="primary" onClick={open}>
              ＋ Add company
            </button>
          )
        }
      />
      {!admin ? (
        <Empty
          title="Administrator access required"
          text="Only administrators can add and manage companies."
        />
      ) : rows.length === 0 ? (
        <Empty
          title="No companies yet"
          text="Add the first Lead Ventures company before registering agents."
          action={
            <button className="primary" onClick={open}>
              Add first company
            </button>
          }
        />
      ) : (
        <div className="company-grid">
          {rows.map((c) => (
            <article key={c.id}>
              <div className="company-mark">{initials(c.name)}</div>
              <div>
                <h3>{c.name}</h3>
                <p>{c.description || "Lead Ventures portfolio company"}</p>
                <span>
                  {agents.filter((a) => a.company_id === c.id).length} agents ·{" "}
                  {c.status}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
function CompanyForm({ user, close, saved }) {
  const [form, setForm] = useState({ name: "", description: "", website: "" }),
    [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    const { error } = await supabase
      .from("companies")
      .insert({ ...form, website: form.website || null, created_by: user.id });
    if (error) setError(error.message);
    else saved();
  }
  return (
    <div className="backdrop">
      <form className="modal compact" onSubmit={submit}>
        <header>
          <div>
            <small>ADMINISTRATION</small>
            <h2>Add a company</h2>
          </div>
          <button type="button" onClick={close}>
            ×
          </button>
        </header>
        <label>
          Company name
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label>
          Description
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
        <label>
          Website
          <input
            type="url"
            placeholder="https://"
            value={form.website}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
          />
        </label>
        {error && <div className="message">{error}</div>}
        <footer>
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button className="primary">Add company</button>
        </footer>
      </form>
    </div>
  );
}
function Users({ rows, companies, admin, session, reload }) {
  const [message, setMessage] = useState(""),
    [syncing, setSyncing] = useState(false),
    [syncComplete, setSyncComplete] = useState(false);
  async function syncUsers() {
    setMessage("");
    setSyncing(true);
    try {
      const response = await fetch("/api/sync-users", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to synchronize users.");
      setMessage(
        result.created
          ? `${result.created} user ${result.created === 1 ? "profile" : "profiles"} added.`
          : "User list is up to date.",
      );
      await reload();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSyncing(false);
      setSyncComplete(true);
    }
  }
  useEffect(() => {
    if (admin && !syncComplete) syncUsers();
  }, [admin, syncComplete]);
  async function update(id, changes) {
    setMessage("");
    const { error } = await supabase.from("profiles").update(changes).eq("id", id);
    if (error) setMessage(error.message);
    else {
      setMessage("Access updated.");
      reload();
    }
  }
  return (
    <>
      <PageHead
        tag="ADMINISTRATION"
        title="Users & Access"
        desc="Admin-only controls for company assignment and Admin, Editor, or Viewer access."
      />
      {message && <div className="admin-message">{message}</div>}
      {!admin ? (
        <Empty
          title="Administrator access required"
          text="Only administrators can view and change user access."
        />
      ) : syncing && rows.length === 0 ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty
          title="No team members found"
          text="No access profiles are available. Try synchronizing authentication users again."
          action={
            <button className="primary" onClick={syncUsers} disabled={syncing}>
              {syncing ? "Synchronizing…" : "Synchronize users"}
            </button>
          }
        />
      ) : (
        <div className="table">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Company</th>
                <th>Role</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td>
                    <b>{u.full_name || "New user"}</b>
                    <small>{u.email}</small>
                  </td>
                  <td>
                    <select
                      value={u.company_id || ""}
                      onChange={(e) =>
                        update(u.id, { company_id: e.target.value || null })
                      }
                    >
                      <option value="">Unassigned</option>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={u.role}
                      onChange={(e) => update(u.id, { role: e.target.value })}
                    >
                      <option value="admin">Admin</option>
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </td>
                  <td>
                    <Pill text={u.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
function AISettings({ user }) {
  const defaults = { anthropic: "claude-sonnet-4-20250514", openai: "gpt-4o-mini", gemini: "gemini-2.5-flash" };
  const [provider, setProvider] = useState("anthropic");
  const [model, setModel] = useState(defaults.anthropic);
  const [message, setMessage] = useState("");
  useEffect(() => {
    supabase.from("app_settings").select("setting_key,setting_value").then(({ data }) => {
      const values = Object.fromEntries((data || []).map((x) => [x.setting_key, x.setting_value]));
      const selected = values.governance_provider || "anthropic";
      setProvider(selected);
      setModel(values.governance_model || defaults[selected]);
    });
  }, []);
  function choose(value) {
    setProvider(value);
    setModel(defaults[value]);
  }
  async function save(e) {
    e.preventDefault();
    setMessage("");
    const { error } = await supabase.from("app_settings").upsert([
      { setting_key: "governance_provider", setting_value: provider, updated_by: user.id, updated_at: new Date().toISOString() },
      { setting_key: "governance_model", setting_value: model, updated_by: user.id, updated_at: new Date().toISOString() },
    ]);
    setMessage(error ? error.message : "AI governance provider saved.");
  }
  return (
    <>
      <PageHead tag="ADMINISTRATION" title="AI Settings" desc="Choose the server-side AI provider used to screen new agents and skillsets for governance risk." />
      <form className="settings-panel" onSubmit={save}>
        <label>Governance Provider
          <select value={provider} onChange={(e) => choose(e.target.value)}>
            <option value="anthropic">Anthropic Claude</option>
            <option value="openai">OpenAI (ChatGPT)</option>
            <option value="gemini">Google Gemini</option>
          </select>
        </label>
        <label>Model
          <input required value={model} onChange={(e) => setModel(e.target.value)} />
        </label>
        <div className="secret-note">
          <b>API Key Location</b>
          <p>Add the corresponding secret in Netlify → Project configuration → Environment variables: <code>{provider === "anthropic" ? "ANTHROPIC_API_KEY" : provider === "openai" ? "OPENAI_API_KEY" : "GEMINI_API_KEY"}</code>.</p>
          <p>Keys are intentionally never entered or displayed in this application.</p>
        </div>
        {message && <div className="message">{message}</div>}
        <button className="primary">Save AI Settings</button>
      </form>
    </>
  );
}
const PageHead = ({ tag, title, desc, action }) => (
  <div className="pagehead">
    <div>
      <small>{tag}</small>
      <h1>{title}</h1>
      <p>{desc}</p>
    </div>
    {action}
  </div>
);
const Stats = ({ values }) => (
  <div className="stats">
    {values.map(([v, l]) => (
      <article key={l}>
        <span>{l}</span>
        <b>{v}</b>
      </article>
    ))}
  </div>
);
const Pill = ({ text = "draft" }) => (
  <span className={`pill ${text}`}>● {text.replaceAll("_", " ")}</span>
);
const Loading = () => <div className="loading">Loading workspace data…</div>;
const Empty = ({ title, text, action }) => (
  <div className="empty">
    <i>LV</i>
    <h2>{title}</h2>
    <p>{text}</p>
    {action}
  </div>
);
const Logo = () => (
  <img
    className="logo"
    src="https://www.lead-ventures.com/wp-content/uploads/2023/03/LV-logo.png"
    alt="Lead Ventures"
  />
);
const Splash = ({ text }) => (
  <div className="splash">
    <Logo />
    <p>{text}</p>
  </div>
);
const Setup = () => (
  <div className="splash">
    <Logo />
    <h2>Connect Supabase to begin</h2>
    <p>
      Copy <code>.env.example</code> to <code>.env</code> and add your project
      URL and anonymous key.
    </p>
  </div>
);
function initials(n = "") {
  return (
    n
      .split(/\s+/)
      .map((x) => x[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "LV"
  );
}
function Tour({ role, setView, close }) {
  const [step, setStep] = useState(0);
  const base = [
    {
      view: "dashboard",
      eyebrow: "WELCOME",
      title: "Build boldly. Govern intelligently.",
      text: "The dashboard summarizes agents, skillsets, companies, accountable owners, and meaningful governance risk across Lead Ventures.",
    },
    {
      view: "agents",
      eyebrow: "OPEN CREATION",
      title: "Create agents and skillsets",
      text:
        role === "viewer"
          ? "You can inspect registered agents, skillsets, ownership, and governance status."
          : "Editors and Admins can register their own agents and reusable skillsets without a pre-build approval step.",
    },
    {
      view: "governance",
      eyebrow: "AUTOMATED GOVERNANCE",
      title: "Screen every new entry",
      text: "A secure AI assessment checks fairness, privacy, accuracy, safety, transparency, and security. Only medium, high, or critical risk is flagged for review.",
    },
    {
      view: "approvals",
      eyebrow: "RISK-BASED REVIEW",
      title: "Review only what needs attention",
      text: "Low-risk entries are cleared automatically. Flagged entries and later material prompt changes appear for Admin review.",
    },
    ...(role === "admin"
      ? [
          {
            view: "companies",
            eyebrow: "TENANT MANAGEMENT",
            title: "Add Lead Ventures companies",
            text: "Create each company under the Lead Ventures tenant. Agents, skillsets, and users can then be assigned and filtered by company.",
          },
          {
            view: "users",
            eyebrow: "ADMIN VIEW",
            title: "Manage users and access",
            text: "Only Admins see the user-access area. Assign each person to a company and change their role to Admin, Editor, or Viewer.",
          },
          {
            view: "settings",
            eyebrow: "AI SETTINGS",
            title: "Choose the governance provider",
            text: "Select Anthropic Claude, OpenAI, or Google Gemini and its model. Add the matching secret API key in Netlify so it remains server-side.",
          },
        ]
      : []),
    {
      view: "dashboard",
      eyebrow: "PERSONAL APPEARANCE",
      title: "Choose the workspace style you prefer",
      text: "Use the Appearance menu in the header to switch between Dark and Light. Your choice applies only to this browser.",
    },
    {
      view: "dashboard",
      eyebrow: "READY",
      title: "You’re ready to begin",
      text: "You can restart this walkthrough anytime from “Take a tour” in the top navigation.",
    },
  ];
  const item = base[step];
  useEffect(() => {
    setView(item.view);
  }, [step]);
  return (
    <div
      className="tour-layer"
      role="dialog"
      aria-modal="true"
      aria-label="Product tour"
    >
      <div className="tour-card">
        <button className="tour-close" onClick={close} aria-label="Close tour">
          ×
        </button>
        <div className="tour-progress">
          {base.map((_, i) => (
            <span key={i} className={i <= step ? "done" : ""} />
          ))}
        </div>
        <small>
          {item.eyebrow} · {step + 1} OF {base.length}
        </small>
        <h2>{item.title}</h2>
        <p>{item.text}</p>
        <footer>
          <button onClick={close}>Skip tour</button>
          <div>
            {step > 0 && (
              <button onClick={() => setStep(step - 1)}>Back</button>
            )}
            <button
              className="primary"
              onClick={() =>
                step === base.length - 1 ? close() : setStep(step + 1)
              }
            >
              {step === base.length - 1 ? "Finish" : "Next"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
