import { useEffect, useState } from "react";
import { supabase, configured } from "./supabase";
import { ASSESSMENT_VERSION, DEFAULT_REVIEW_THRESHOLD, GOVERNANCE_CATEGORIES, LIKERT_OPTIONS, OVERRIDE_QUESTIONS, TRIGGER_QUESTIONS, evaluateGovernance, initialQuestionnaire, riskBand, riskLabel, visibleStatements } from "./governance";
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
          The Lead Ventures Agents & Platform Repository is one secure workspace
          for prompts, approvals, approved platforms, responsible AI controls, and access.
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
            : "New to the repository? Join workspace"}
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
          to the repository.
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
    [departments, setDepartments] = useState([]),
    [categories, setCategories] = useState([]),
    [userAccess, setUserAccess] = useState([]),
    [companyAccess, setCompanyAccess] = useState([]),
    [accessAudit, setAccessAudit] = useState([]),
    [assessments, setAssessments] = useState([]),
    [clarifications, setClarifications] = useState([]),
    [advisories, setAdvisories] = useState([]),
    [recommendations, setRecommendations] = useState([]),
    [savedAttentionItems, setSavedAttentionItems] = useState([]),
    [appSettings, setAppSettings] = useState({}),
    [assessmentResult, setAssessmentResult] = useState(null),
    [busy, setBusy] = useState(true),
    [modal, setModal] = useState(false),
    [editingAgent, setEditingAgent] = useState(null),
    [accessModal, setAccessModal] = useState(null),
    [companyModal, setCompanyModal] = useState(false),
    [editingCompany, setEditingCompany] = useState(null),
    [adminOpen, setAdminOpen] = useState(true),
    [toast, setToast] = useState(""),
    [theme, setTheme] = useState(
      () => localStorage.getItem("lv-agent-theme") || "current",
    ),
    [tour, setTour] = useState(
      () => localStorage.getItem("lv-agent-tour-complete") !== "yes",
    );
  const canEdit = ["admin", "editor"].includes(profile.role),
    admin = profile.role === "admin";
  const adminViews = ["users", "companies", "taxonomy", "access", "settings"];
  async function load() {
    setBusy(true);
    const [a, v, u, c, d, cat, ua, ca, audit, pd, ga, gc, aa, gr, attention, settings] = await Promise.all([
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
      supabase.from("departments").select("*").order("name"),
      supabase.from("categories").select("*").order("name"),
      supabase.from("agent_user_access").select("*").order("created_at"),
      supabase.from("agent_company_access").select("*").order("created_at"),
      supabase
        .from("audit_log")
        .select("*")
        .like("action", "access_%")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("platform_details").select("*"),
      supabase.from("governance_assessments").select("*").order("assessed_at", { ascending: false }),
      supabase.from("governance_clarifications").select("*").order("created_at", { ascending: false }),
      supabase.from("ai_advisory_assessments").select("*").order("created_at", { ascending: false }),
      supabase.from("governance_recommendations").select("*").order("created_at", { ascending: false }),
      supabase.from("governance_attention_items").select("*").order("created_at", { ascending: false }),
      supabase.from("app_settings").select("setting_key,setting_value"),
    ]);
    const details = pd.data || [];
    setAgents(
      (a.data || []).map((agent) => ({
        ...agent,
        platform_details:
          details.find((detail) => detail.agent_id === agent.id) || null,
      })),
    );
    setVersions(v.data || []);
    setUsers(u.data || []);
    setCompanies(c.data || []);
    setDepartments(d.data || []);
    setCategories(cat.data || []);
    setUserAccess(ua.data || []);
    setCompanyAccess(ca.data || []);
    setAccessAudit(audit.data || []);
    setAssessments(ga.data || []);
    setClarifications(gc.data || []);
    setAdvisories(aa.data || []);
    setRecommendations(gr.data || []);
    setSavedAttentionItems(attention.data || []);
    setAppSettings(Object.fromEntries((settings.data || []).map((item) => [item.setting_key, item.setting_value])));
    setBusy(false);
  }
  useEffect(() => {
    load();
  }, [profile.role, profile.can_assign_reviews, profile.can_approve_agents]);
  useEffect(() => {
    localStorage.setItem("lv-agent-theme", theme);
  }, [theme]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!admin && adminViews.includes(view)) setView("dashboard");
    if (admin && adminViews.includes(view)) setAdminOpen(true);
  }, [admin, view]);
  async function approvePrompt(id, status, notes) {
    try {
      const response = await fetch("/api/review-prompt", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ versionId: id, decision: status, notes }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setToast(result.message);
      await load();
    } catch (error) {
      console.error("Prompt review failed", error);
      setToast("We could not record this review decision. Please confirm that you have Admin approval access and try again.");
    }
  }
  async function retryAssessment(agent) {
    setToast("Retrying governance assessment…");
    try {
      const version = versions.find((item) => item.agent_id === agent.id);
      const response = await fetch("/api/governance-check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...agent, prompt: version?.prompt_text || "" }),
      });
      const assessment = await response.json();
      if (!response.ok) throw new Error(assessment.error);
      const status = agent.status === "retired" ? "retired" : assessment.flagged ? "governance_review" : "approved";
      const { error } = await supabase
        .from("agents")
        .update({
          risk_level: assessment.risk_level,
          governance_score: assessment.governance_score,
          governance_flagged: assessment.flagged,
          governance_summary: assessment.summary,
          governance_checked_at: new Date().toISOString(),
          governance_provider: assessment.provider,
          governance_status: assessment.flagged ? "governance_review" : "cleared",
          status,
        })
        .eq("id", agent.id);
      if (error) throw error;
      if (assessment.checks?.length) {
        await supabase.from("governance_reviews").insert(
          assessment.checks.map((check) => ({
            agent_id: agent.id,
            prompt_version_id: version?.id || null,
            category: check.category,
            score: check.score,
            status: check.status,
            findings: check.findings,
            reviewer_id: session.user.id,
          })),
        );
        if (!assessment.flagged && version?.status === "pending")
          await supabase.from("prompt_versions").update({ status: "approved" }).eq("id", version.id);
      }
      setToast(assessment.flagged ? "Assessment completed and routed for Admin review." : "Assessment completed and resource cleared.");
      await load();
    } catch (error) {
      console.error("Governance retry failed", error);
      setToast("The assessment is still unavailable. The resource remains saved and pending review.");
    }
  }
  async function manageAgent(id, action) {
    setToast("");
    try {
      const response = await fetch("/api/manage-agent", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id, action }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Unable to update agent.");
      setToast(
        action === "delete"
          ? `${result.agent.name} permanently deleted.`
          : action === "archive"
            ? `${result.agent.name} archived.`
            : `${result.agent.name} restored as a draft.`,
      );
      await load();
    } catch (error) {
      console.error("Resource management action failed", error);
      setToast("We could not update this resource. Confirm your Admin access and try again.");
    }
  }
  const nav = [
    ["dashboard", "▥", "Dashboard"],
    ["my-agents", "★", "My Agents & Platforms"],
    ["agents", "▦", "Agents & Platform Directory"],
    ["approvals", "✓", "Prompt Approvals"],
    ["governance", "◇", "AI Governance"],
  ];
  const adminNav = [
    ["users", "♙", "Users & Access"],
    ["companies", "◫", "Companies"],
    ["taxonomy", "●", "Departments & Categories"],
    ["access", "◆", "Access Management"],
    ["settings", "⚙", "AI & Governance Settings"],
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
          {admin && (
            <div className={`admin-nav ${adminOpen ? "open" : ""}`}>
              <button
                type="button"
                className={`admin-nav-toggle ${adminViews.includes(view) ? "active-parent" : ""}`}
                aria-expanded={adminOpen}
                aria-controls="admin-navigation"
                onClick={() => setAdminOpen((current) => !current)}
              >
                <span aria-hidden="true">⚙</span><span>Admin</span><b aria-hidden="true">{adminOpen ? "−" : "+"}</b>
              </button>
              <div id="admin-navigation" hidden={!adminOpen}>
                {adminNav.map(([id, icon, label]) => (
                  <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}>
                    <span aria-hidden="true">{icon}</span><span>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
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
            Agents & Platform Repository /{" "}
            <b>
              {
                {
                  dashboard: "Dashboard",
                  agents: "Agents & Platform Directory",
                  "my-agents": "My Agents & Platforms",
                  approvals: "Prompt Approvals",
                  governance: "AI Governance",
                  companies: "Companies",
                  users: "Users & Access",
                  taxonomy: "Departments & Categories",
                  access: "Access Management",
                  settings: "AI & Governance Settings",
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
            profile={profile}
            userAccess={userAccess}
            companyAccess={companyAccess}
            canEdit={canEdit}
            open={() => {
              setEditingAgent(null);
              setModal(true);
            }}
          />
        )}{" "}
        {view === "my-agents" && (
          <MyAgents
            rows={agents}
            companies={companies}
            departments={departments}
            categories={categories}
            busy={busy}
          />
        )}{" "}
        {view === "agents" && (
          <Agents
            rows={agents}
            companies={companies}
            userId={session.user.id}
            busy={busy}
            canEdit={canEdit}
            admin={admin}
            open={() => {
              setEditingAgent(null);
              setModal(true);
            }}
            edit={(agent) => {
              setEditingAgent(agent);
              setModal(true);
            }}
            manage={manageAgent}
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
        {view === "governance" && <Governance agents={agents} assessments={assessments} clarifications={clarifications} advisories={advisories} recommendations={recommendations} attentionItems={savedAttentionItems} admin={admin} user={session.user} token={session.access_token} reload={load} notify={setToast} edit={(agent) => { setEditingAgent(agent); setModal(true); }} />}{" "}
        {admin && view === "companies" && (
          <Companies
            rows={companies}
            agents={agents}
            admin={admin}
            open={() => { setEditingCompany(null); setCompanyModal(true); }}
            edit={(company) => { setEditingCompany(company); setCompanyModal(true); }}
          />
        )}{" "}
        {admin && view === "users" && (
          <Users
            rows={users}
            companies={companies}
            admin={admin}
            session={session}
            reload={load}
          />
        )}
        {admin && view === "taxonomy" && (
          <TaxonomyAdmin
            departments={departments}
            categories={categories}
            user={session.user}
            reload={load}
          />
        )}
        {admin && view === "access" && (
          <AccessManagement
            rows={agents}
            users={users}
            companies={companies}
            userAccess={userAccess}
            companyAccess={companyAccess}
            audit={accessAudit}
            edit={setAccessModal}
          />
        )}
        {admin && view === "settings" && <AISettings user={session.user} />}
      </section>
      {accessModal && (
        <AccessEditor
          agent={accessModal}
          users={users}
          companies={companies}
          user={session.user}
          userAccess={userAccess.filter(
            (assignment) => assignment.agent_id === accessModal.id,
          )}
          companyAccess={companyAccess.filter(
            (assignment) => assignment.agent_id === accessModal.id,
          )}
          close={() => setAccessModal(null)}
          saved={() => {
            setAccessModal(null);
            setToast("Resource access updated.");
            load();
          }}
        />
      )}
        {modal && (
          <AgentForm
            user={session.user}
            currentUser={profile}
            users={users}
            companies={companies}
            departments={departments}
            categories={categories}
            userAccess={userAccess.filter(
              (assignment) => assignment.agent_id === editingAgent?.id,
            )}
            companyAccess={companyAccess.filter(
              (assignment) => assignment.agent_id === editingAgent?.id,
            )}
            admin={admin}
            agent={editingAgent}
            assessment={assessments.find((item) => item.agent_id === editingAgent?.id)}
            reviewThreshold={Number(appSettings.governance_review_threshold || DEFAULT_REVIEW_THRESHOLD)}
            prompt={
              editingAgent
                ? versions.find((version) => version.agent_id === editingAgent.id)
                    ?.prompt_text || ""
                : ""
            }
            close={() => {
              setModal(false);
              setEditingAgent(null);
            }}
            saved={(message, result) => {
              setModal(false);
              setToast(message || (editingAgent ? "Resource updated." : "Resource created."));
              if (result) setAssessmentResult(result);
              setEditingAgent(null);
              load();
            }}
        />
      )}
      {assessmentResult && <AssessmentResult result={assessmentResult} close={() => setAssessmentResult(null)} />}
      {companyModal && (
        <CompanyForm
          user={session.user}
          company={editingCompany}
          close={() => { setCompanyModal(false); setEditingCompany(null); }}
          saved={() => {
            setCompanyModal(false);
            setToast(editingCompany ? "Company updated." : "Company added.");
            setEditingCompany(null);
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
function Dashboard({ agents, companies, busy, canEdit, open }) {
  const approved = agents.filter(
    (resource) => resource.governance_status === "cleared" && resource.status !== "retired",
  );
  const owned = [...new Set(approved.map((resource) => resource.owner_name).filter(Boolean))];
  const recent = approved.filter(
    (resource) => new Date(resource.created_at).getTime() >= Date.now() - 30 * 86400000,
  );
  return (
    <>
      <section className="dashboard-hero">
        <div>
          <small>LEAD VENTURES AI ENABLEMENT</small>
          <h1>Build boldly. Govern intelligently.</h1>
          <p>
            Discover approved agents, skillsets, and AI platforms in one governed Lead Ventures workspace.
          </p>
          {canEdit && (
            <button className="primary" onClick={open}>
              ＋ Add resource
            </button>
          )}
        </div>
      </section>
      <Stats
        values={[
          [approved.length, "Approved resources available"],
          [approved.filter((resource) => resource.entry_type === "agent").length, "Total Agents"],
          [approved.filter((resource) => resource.entry_type === "skillset").length, "Total Skillsets"],
          [approved.filter((resource) => resource.entry_type === "platform").length, "Total Platforms"],
          [recent.length, "Recently added resources"],
        ]}
      />
      {busy ? (
        <Loading />
      ) : (
        <div className="dashboard-grid">
          <section className="panel">
            <h2>Resources by Company</h2>
            {companies.length === 0 ? (
              <p className="muted">
                Add a company to begin portfolio reporting.
              </p>
            ) : (
              companies.map((c) => {
                const count = approved.filter(
                  (a) => a.company_id === c.id,
                ).length;
                return (
                  <div className="metric-row" key={c.id}>
                    <span>{c.name}</span>
                    <div>
                      <i
                        style={{
                          width: `${approved.length ? Math.max(4, (count / approved.length) * 100) : 4}%`,
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
                Accountable owners will appear when approved resources are available.
              </p>
            ) : (
              owned.slice(0, 6).map((o) => (
                <div className="owner-row" key={o}>
                  <i>{initials(o)}</i>
                  <span>{o}</span>
                  <b>
                    {approved.filter((resource) => resource.owner_name === o).length} resource{approved.filter((resource) => resource.owner_name === o).length === 1 ? "" : "s"}
                  </b>
                </div>
              ))
            )}
          </section>
          <section className="panel wide">
            <h2>Recently Added Resources</h2>
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
                  {recent.slice(0, 10).map((a) => (
                    <tr key={a.id}>
                      <td>
                        <b>{a.name}</b>
                      </td>
                      <td>{a.entry_type || "agent"}</td>
                      <td>{a.companies?.name || "Unassigned"}</td>
                      <td>{a.owner_name}</td>
                      <td>{a.entry_type === "platform" ? a.platform_details?.vendor || a.platform : a.platform}</td>
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
const ACCESS_SCOPE_LABELS = {
  owner_only: "Owner Only",
  specific_people: "Specific People",
  admins_only: "Admins Only",
  selected_companies: "Selected Companies",
  entire_team: "Entire Team",
};
function MyAgents({ rows, companies, departments, categories, busy }) {
  const [search, setSearch] = useState(""),
    [filters, setFilters] = useState({
      company: "all",
      department: "all",
      category: "all",
      platform: "all",
      entryType: "all",
      accessScope: "all",
    });
  const platforms = [...new Set(rows.map((row) => row.platform_details?.vendor || row.platform).filter(Boolean))].sort();
  const query = search.trim().toLowerCase();
  const visible = rows.filter((row) => {
    const searchable = [row.name, row.description, row.owner_name, row.department, row.category]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return (
      row.status !== "retired" &&
      (!query || searchable.includes(query)) &&
      (filters.company === "all" || row.company_id === filters.company) &&
      (filters.department === "all" || row.department === filters.department) &&
      (filters.category === "all" || row.category === filters.category) &&
      (filters.platform === "all" || (row.platform_details?.vendor || row.platform) === filters.platform) &&
      (filters.entryType === "all" || row.entry_type === filters.entryType) &&
      (filters.accessScope === "all" || row.access_scope === filters.accessScope)
    );
  });
  function filter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }
  return (
    <>
      <PageHead
        tag="PERSONALIZED ACCESS"
        title="My Agents & Platforms"
        desc="Agents, reusable skillsets, and approved platforms available through team, company, ownership, role, or individual access."
      />
      <div className="resource-filters">
        <label className="resource-search">
          Search
          <input
            type="search"
            placeholder="Name, purpose, owner, department, or category"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <ResourceFilter label="Company" value={filters.company} onChange={(value) => filter("company", value)} options={companies.map((row) => [row.id, row.name])} />
        <ResourceFilter label="Department" value={filters.department} onChange={(value) => filter("department", value)} options={departments.filter((row) => row.status === "active").map((row) => [row.name, row.name])} />
        <ResourceFilter label="Category" value={filters.category} onChange={(value) => filter("category", value)} options={categories.filter((row) => row.status === "active").map((row) => [row.name, row.name])} />
        <ResourceFilter label="Platform" value={filters.platform} onChange={(value) => filter("platform", value)} options={platforms.map((value) => [value, value])} />
        <ResourceFilter label="Resource type" value={filters.entryType} onChange={(value) => filter("entryType", value)} options={[["agent", "Agent"], ["skillset", "Skillset"], ["platform", "Platform"]]} />
        <ResourceFilter label="Access scope" value={filters.accessScope} onChange={(value) => filter("accessScope", value)} options={Object.entries(ACCESS_SCOPE_LABELS)} />
      </div>
      {busy ? (
        <Loading />
      ) : visible.length === 0 ? (
        <Empty title="No available resources found" text="No agents, skillsets, or platforms match your access and filters." />
      ) : (
        <div className="table resource-table">
          <table>
            <thead>
              <tr>
                <th>Resource</th><th>Type</th><th>Company</th><th>Category / Department</th><th>Owner</th><th>Platform / Vendor</th><th>Access instructions</th><th>Access</th><th>Governance</th><th>Expiration / Renewal</th><th>Open</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id}>
                  <td><b>{row.name}</b><small>{row.description}</small></td>
                  <td>{row.entry_type || "agent"}</td>
                  <td>{row.companies?.name || "Unassigned"}</td>
                  <td>{row.category || "—"}<small>{row.department || "—"}</small></td>
                  <td>{row.owner_name || "—"}</td>
                  <td>{row.platform_details?.vendor || row.platform || "—"}</td>
                  <td>{row.entry_type === "platform" ? row.platform_details?.access_request_instructions || "Contact the designated administrator." : "—"}<small>{row.entry_type === "platform" ? row.platform_details?.support_contact || "" : ""}</small></td>
                  <td>{ACCESS_SCOPE_LABELS[row.access_scope] || "Admins Only"}<small>{row.access_permission || "view"}</small></td>
                  <td><Pill text={row.governance_flagged ? "review" : "approved"} /></td>
                  <td>{row.access_expires_at ? `Access: ${new Date(row.access_expires_at).toLocaleDateString()}` : "No access expiration"}<small>{row.platform_details?.renewal_at ? `Renewal: ${new Date(row.platform_details.renewal_at).toLocaleDateString()}` : ""}</small></td>
                  <td>{row.url ? <a className="open-resource" href={row.url} target="_blank" rel="noreferrer">Open {row.entry_type === "skillset" ? "Skillset" : row.entry_type === "platform" ? "Platform" : "Agent"} ↗</a> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="external-access-banner">Availability in this repository does not automatically create a license or user account in the external platform. Follow the listed access instructions or contact the designated administrator.</p>
    </>
  );
}
function ResourceFilter({ label, value, onChange, options }) {
  const normalized = Array.isArray(options[0]) ? options : [];
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="all">All</option>
        {normalized.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  );
}
const DIRECTORY_COLUMNS = [
  ["resource", "Resource"], ["type", "Type"], ["company", "Company"], ["owner", "Owner"],
  ["department", "Department"], ["category", "Category"], ["runsOn", "Runs On"], ["status", "Status"],
  ["risk", "Risk"], ["governance", "Governance"], ["access", "Access"], ["accessInstructions", "Access Instructions"],
  ["url", "URL"], ["actions", "Actions"],
];
const DEFAULT_DIRECTORY_COLUMNS = ["resource", "type", "company", "owner", "status", "risk", "actions"];
function Agents({ rows, companies, busy, canEdit, admin, open, edit, manage, userId }) {
  const preferenceKey = `lv-directory-columns:${userId}`;
  const [company, setCompany] = useState("all"), [status, setStatus] = useState("active"), [columnsOpen, setColumnsOpen] = useState(false), [details, setDetails] = useState(null);
  const [columns, setColumns] = useState(() => { try { const saved = JSON.parse(localStorage.getItem(preferenceKey)); return Array.isArray(saved) ? ["resource", ...saved.filter((key) => key !== "resource" && DIRECTORY_COLUMNS.some(([id]) => id === key))] : DEFAULT_DIRECTORY_COLUMNS; } catch { return DEFAULT_DIRECTORY_COLUMNS; } });
  const [draftColumns, setDraftColumns] = useState(columns);
  useEffect(() => {
    let active = true;
    supabase.from("user_preferences").select("preference_value").eq("user_id", userId).eq("preference_key", "directory_columns").maybeSingle().then(({ data }) => {
      if (!active || !Array.isArray(data?.preference_value)) return;
      const saved = ["resource", ...data.preference_value.filter((key) => key !== "resource" && DIRECTORY_COLUMNS.some(([id]) => id === key))];
      setColumns(saved); setDraftColumns(saved); localStorage.setItem(preferenceKey, JSON.stringify(saved));
    });
    return () => { active = false; };
  }, [preferenceKey, userId]);
  const visible = rows.filter((agent) => (company === "all" || agent.company_id === company) && (status === "all" || (status === "archived" ? agent.status === "retired" : agent.status !== "retired")));
  const shown = (key) => columns.includes(key);
  const risk = (agent) => agent.governance_score == null ? "Pending" : riskLabel(riskBand(agent.governance_score));
  function applyColumns() { const next = ["resource", ...draftColumns.filter((key) => key !== "resource")]; setColumns(next); localStorage.setItem(preferenceKey, JSON.stringify(next)); setColumnsOpen(false); supabase.from("user_preferences").upsert({ user_id: userId, preference_key: "directory_columns", preference_value: next, updated_at: new Date().toISOString() }).then(({ error }) => { if (error) console.info("Directory preference stored locally until the profile preference migration is available."); }); }
  function remove(agent) { if (window.confirm(`Permanently delete ${agent.name}? Its prompt versions and governance history will also be deleted. This cannot be undone.`)) manage(agent.id, "delete"); }
  const cell = (key, agent) => ({
    resource: <><b>{agent.name}</b><p className="resource-description">{agent.description}</p><button className="details-link" onClick={() => setDetails(agent)}>View Details</button></>,
    type: agent.entry_type || "agent", company: agent.companies?.name || "Unassigned", owner: agent.owner_name || "—",
    department: agent.department || "—", category: agent.category || "—",
    runsOn: <>{agent.entry_type === "platform" ? agent.platform_details?.vendor || agent.platform || "—" : agent.platform || "—"}<small>{agent.environment}</small></>,
    status: <Pill text={agent.status}/>, risk: agent.governance_score == null ? "Pending" : `${risk(agent)} · ${agent.governance_score}%`,
    governance: <Pill text={agent.governance_flagged ? "review" : "approved"}/>, access: ACCESS_SCOPE_LABELS[agent.access_scope] || "Admins Only",
    accessInstructions: agent.entry_type === "platform" ? agent.platform_details?.access_request_instructions || "Contact the designated administrator." : "—",
    url: agent.url ? <a href={agent.url} target="_blank" rel="noreferrer">Open ↗</a> : "—",
    actions: <div className="directory-actions"><button onClick={() => setDetails(agent)}>View</button>{canEdit && <button onClick={() => edit(agent)}>Edit</button>}{agent.url && <a href={agent.url} target="_blank" rel="noreferrer">Open ↗</a>}{admin && <details className="action-menu"><summary>More</summary><div><button onClick={() => manage(agent.id, agent.status === "retired" ? "restore" : "archive")}>{agent.status === "retired" ? "Restore" : "Archive"}</button><button className="danger" onClick={() => remove(agent)}>Delete</button></div></details>}</div>,
  })[key];
  return <>
    <PageHead tag="TEAM INTELLIGENCE" title="Agents & Platform Directory" desc="The governed source of truth for AI agents, reusable skillsets, and approved platforms." action={canEdit && <button className="primary" onClick={open}>＋ Add resource</button>}/>
    <div className="filterbar directory-filterbar"><label>Agents by Company<select value={company} onChange={(e) => setCompany(e.target.value)}><option value="all">All companies</option>{companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Archive status<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="active">Active entries</option><option value="archived">Archived entries</option><option value="all">All entries</option></select></label><div className="column-selector"><button aria-expanded={columnsOpen} onClick={() => { setDraftColumns(columns); setColumnsOpen((current) => !current); }}>Columns</button>{columnsOpen && <div className="column-popover"><b>Visible columns</b>{DIRECTORY_COLUMNS.map(([id, label]) => <label key={id}><input type="checkbox" disabled={id === "resource"} checked={id === "resource" || draftColumns.includes(id)} onChange={(e) => setDraftColumns((current) => e.target.checked ? [...current, id] : current.filter((key) => key !== id))}/>{label}{id === "resource" && <small>Required</small>}</label>)}<footer><button onClick={() => setDraftColumns(DIRECTORY_COLUMNS.map(([id]) => id))}>Select All</button><button onClick={() => setDraftColumns(DEFAULT_DIRECTORY_COLUMNS)}>Reset to Default</button><button className="primary" onClick={applyColumns}>Apply</button></footer></div>}</div></div>
    <Stats values={[[visible.length,"Total resources"],[visible.filter((item) => item.entry_type === "platform").length,"Platforms"],[visible.filter((item) => item.entry_type === "skillset").length,"Skillsets"],[visible.filter((item) => item.governance_flagged).length,"Governance flags"],[visible.length ? `${Math.round(visible.reduce((sum,item) => sum+(item.governance_score||0),0)/visible.length)}%` : "—","Average governance risk"]]}/>
    {busy ? <Loading/> : visible.length === 0 ? <Empty title="No resources found" text="Add an entry or select a different company." action={canEdit && <button className="primary" onClick={open}>Add resource</button>}/> : <>
      <div className="directory-table-wrapper"><table className="resource-directory-table"><thead><tr>{DIRECTORY_COLUMNS.filter(([key]) => shown(key)).map(([key,label]) => <th key={key} className={`${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}-column`}>{label}</th>)}</tr></thead><tbody>{visible.map((agent) => <tr key={agent.id}>{DIRECTORY_COLUMNS.filter(([key]) => shown(key)).map(([key]) => <td key={key} className={`${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}-column`}>{cell(key,agent)}</td>)}</tr>)}</tbody></table></div>
      <div className="directory-mobile-cards">{visible.map((agent) => <article key={agent.id}><h2>{agent.name}</h2><dl><div><dt>Type</dt><dd>{agent.entry_type || "agent"}</dd></div><div><dt>Company</dt><dd>{agent.companies?.name || "Unassigned"}</dd></div><div><dt>Owner</dt><dd>{agent.owner_name || "—"}</dd></div><div><dt>Status</dt><dd><Pill text={agent.status}/></dd></div><div><dt>Risk</dt><dd>{agent.governance_score == null ? "Pending" : `${risk(agent)} · ${agent.governance_score}%`}</dd></div></dl><footer><button onClick={() => setDetails(agent)}>View Details</button>{agent.url && <a href={agent.url} target="_blank" rel="noreferrer">Open ↗</a>}{canEdit && <button onClick={() => edit(agent)}>Edit</button>}{admin && <button onClick={() => manage(agent.id,agent.status === "retired" ? "restore" : "archive")}>{agent.status === "retired" ? "Restore" : "Archive"}</button>}{admin && <button className="danger" onClick={() => remove(agent)}>Delete</button>}</footer></article>)}</div>
    </>}
    {details && <ResourceDetails agent={details} close={() => setDetails(null)} edit={canEdit ? edit : null} />}
  </>;
}
function ResourceDetails({ agent, close, edit }) {
  return <div className="backdrop"><section className="modal compact resource-details" role="dialog" aria-modal="true" aria-labelledby="resource-details-title"><header><div><small>{agent.entry_type || "agent"} · {agent.companies?.name || "Unassigned"}</small><h2 id="resource-details-title">{agent.name}</h2></div><button onClick={close}>×</button></header><dl><div><dt>Description</dt><dd>{agent.description || "—"}</dd></div><div><dt>Owner</dt><dd>{agent.owner_name || "—"}</dd></div><div><dt>Department</dt><dd>{agent.department || "—"}</dd></div><div><dt>Category</dt><dd>{agent.category || "—"}</dd></div><div><dt>Runs on</dt><dd>{agent.platform || "—"} · {agent.environment || "—"}</dd></div><div><dt>Status</dt><dd><Pill text={agent.status}/></dd></div><div><dt>Governance Risk</dt><dd>{agent.governance_score == null ? "Pending" : `${riskLabel(riskBand(agent.governance_score))} · ${agent.governance_score}%`}</dd></div><div><dt>Access</dt><dd>{ACCESS_SCOPE_LABELS[agent.access_scope] || "Admins Only"}</dd></div><div><dt>Capabilities</dt><dd>{agent.skills_summary || "—"}</dd></div></dl><footer>{agent.url && <a href={agent.url} target="_blank" rel="noreferrer">Open resource ↗</a>}{edit && <button className="primary" onClick={() => { close(); edit(agent); }}>Edit resource</button>}<button onClick={close}>Close</button></footer></section></div>;
}
function LegacyAgents({ rows, companies, busy, canEdit, admin, open, edit, manage }) {
  const [company, setCompany] = useState("all"),
    [status, setStatus] = useState("active");
  const visible = rows.filter(
    (agent) =>
      (company === "all" || agent.company_id === company) &&
      (status === "all" ||
        (status === "archived"
          ? agent.status === "retired"
          : agent.status !== "retired")),
  );
  function remove(agent) {
    if (
      window.confirm(
        `Permanently delete ${agent.name}? Its prompt versions and governance history will also be deleted. This cannot be undone.`,
      )
    )
      manage(agent.id, "delete");
  }
  return (
    <>
      <PageHead
        tag="TEAM INTELLIGENCE"
        title="Agents & Platform Directory"
        desc="The governed source of truth for AI agents, reusable skillsets, and approved platforms."
        action={
          canEdit && (
            <button className="primary" onClick={open}>
              ＋ Add resource
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
        <label>
          Archive status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Active entries</option>
            <option value="archived">Archived entries</option>
            <option value="all">All entries</option>
          </select>
        </label>
      </div>
      <Stats
        values={[
          [visible.length, "Total resources"],
          [visible.filter((x) => x.entry_type === "platform").length, "Platforms"],
          [visible.filter((x) => x.entry_type === "skillset").length, "Skillsets"],
          [
            visible.filter((x) => x.governance_flagged).length,
            "Governance flags",
          ],
          [
            visible.length
              ? `${Math.round(visible.reduce((s, x) => s + (x.governance_score || 0), 0) / visible.length)}%`
              : "—",
            "Average governance risk",
          ],
        ]}
      />
      {busy ? (
        <Loading />
      ) : visible.length === 0 ? (
        <Empty
          title="No resources found"
          text="Add an entry or select a different company."
          action={
            canEdit && (
              <button className="primary" onClick={open}>
                Add resource
              </button>
            )
          }
        />
      ) : (
        <div className="table">
          <table>
            <thead>
              <tr>
                <th>Resource</th>
                <th>Type</th>
                <th>Company</th>
                <th>Owner</th>
                <th>Runs on</th>
                <th>Status</th>
                <th>Risk</th>
                <th>Governance</th>
                <th>Access</th>
                <th>Access instructions</th>
                <th>URL</th>
                {canEdit && <th>Actions</th>}
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
                    {a.entry_type === "platform" ? a.platform_details?.vendor || a.platform || "—" : a.platform || "—"}
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
                  <td>{ACCESS_SCOPE_LABELS[a.access_scope] || "Admins Only"}</td>
                  <td>{a.entry_type === "platform" ? a.platform_details?.access_request_instructions || "Contact the designated administrator." : "—"}</td>
                  <td>
                    {a.url ? (
                      <a href={a.url} target="_blank" rel="noreferrer">
                        Open ↗
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  {canEdit && (
                    <td>
                      <div className="agent-actions">
                        <button onClick={() => edit(a)}>Edit</button>
                        {admin && (
                          <>
                            <button
                              onClick={() =>
                                manage(
                                  a.id,
                                  a.status === "retired" ? "restore" : "archive",
                                )
                              }
                            >
                              {a.status === "retired" ? "Restore" : "Archive"}
                            </button>
                            <button className="danger" onClick={() => remove(a)}>
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  )}
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
    setForm((current) => ({ ...current, [k]: v }));
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
const NAME_STOP_WORDS = new Set([
  "about", "agent", "and", "for", "from", "into", "platform", "skillset", "that",
  "the", "their", "this", "with", "will", "users", "using",
]);
function suggestedEntryName(form) {
  const qualifier = form.category || form.department;
  const keywords = `${form.skills_summary} ${form.description}`
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter((word) => word.length > 2 && !NAME_STOP_WORDS.has(word)) || [];
  const uniqueKeywords = [...new Set(keywords)].slice(0, 2);
  const detail = uniqueKeywords
    .filter((word) => !qualifier.toLowerCase().includes(word))
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
  if (!qualifier && !detail) return "";
  const resourceLabel = form.entry_type === "skillset" ? "Skillset" : form.entry_type === "platform" ? "Platform" : "Agent";
  return `${qualifier}${qualifier && detail ? " " : ""}${detail} ${resourceLabel}`
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}
const FieldHelp = ({ children }) => <small className="field-help">{children}</small>;
function SearchableMultiSelect({ label, help, options, selected, setSelected }) {
  const [search, setSearch] = useState("");
  const visible = options.filter((option) =>
    option.searchable.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <label className="full access-multi-select">
      {label}
      <FieldHelp>{help}</FieldHelp>
      <input
        type="search"
        placeholder={`Search ${label.toLowerCase()}`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <select
        multiple
        value={selected}
        onChange={(e) =>
          setSelected(Array.from(e.target.selectedOptions, (option) => option.value))
        }
      >
        {visible.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
function AccessEditor({
  agent,
  users,
  companies,
  user,
  userAccess,
  companyAccess,
  close,
  saved,
}) {
  const [form, setForm] = useState({
      access_scope: agent.access_scope || "admins_only",
      access_permission: agent.access_permission || "view",
      access_effective_at: agent.access_effective_at?.slice(0, 10) || "",
      access_expires_at: agent.access_expires_at?.slice(0, 10) || "",
      access_notes: agent.access_notes || "",
    }),
    [authorizedPeople, setAuthorizedPeople] = useState(
      userAccess.map((assignment) => assignment.user_id),
    ),
    [authorizedCompanies, setAuthorizedCompanies] = useState(
      companyAccess.map((assignment) => assignment.company_id),
    ),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const activeUsers = users.filter((row) => row.status === "active");
  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  async function submit(e) {
    e.preventDefault();
    setError("");
    if (form.access_scope === "specific_people" && !authorizedPeople.length)
      return setError("Select at least one authorized person.");
    if (
      form.access_scope === "selected_companies" &&
      !authorizedCompanies.length
    )
      return setError("Select at least one authorized company.");
    setSaving(true);
    const effectiveAt = form.access_effective_at
        ? `${form.access_effective_at}T00:00:00.000Z`
        : null,
      expiresAt = form.access_expires_at
        ? `${form.access_expires_at}T23:59:59.999Z`
        : null;
    const { error: agentError } = await supabase
      .from("agents")
      .update({
        access_scope: form.access_scope,
        access_permission: form.access_permission,
        access_effective_at: effectiveAt,
        access_expires_at: expiresAt,
        access_notes: form.access_notes || null,
      })
      .eq("id", agent.id);
    if (agentError) {
      setSaving(false);
      return setError(agentError.message);
    }
    const [removePeople, removeCompanies] = await Promise.all([
      supabase.from("agent_user_access").delete().eq("agent_id", agent.id),
      supabase.from("agent_company_access").delete().eq("agent_id", agent.id),
    ]);
    const removalError = removePeople.error || removeCompanies.error;
    if (removalError) {
      setSaving(false);
      return setError(removalError.message);
    }
    const assignment = {
      permission_level: form.access_permission,
      effective_at: effectiveAt,
      expires_at: expiresAt,
      granted_by: user.id,
    };
    if (form.access_scope === "specific_people") {
      const { error } = await supabase.from("agent_user_access").insert(
        authorizedPeople.map((userId) => ({
          agent_id: agent.id,
          user_id: userId,
          ...assignment,
        })),
      );
      if (error) {
        setSaving(false);
        return setError(error.message);
      }
    }
    if (form.access_scope === "selected_companies") {
      const { error } = await supabase.from("agent_company_access").insert(
        authorizedCompanies.map((companyId) => ({
          agent_id: agent.id,
          company_id: companyId,
          ...assignment,
        })),
      );
      if (error) {
        setSaving(false);
        return setError(error.message);
      }
    }
    setSaving(false);
    saved();
  }
  return (
    <div className="backdrop">
      <form className="modal compact access-editor" onSubmit={submit}>
        <header>
          <div><small>ADMIN · ACCESS MANAGEMENT</small><h2>{agent.name}</h2></div>
          <button type="button" onClick={close}>×</button>
        </header>
        <p className="external-access-note full">
          Access granted in this repository does not automatically configure permissions in the external AI platform. Confirm external platform access separately.
        </p>
        <label>
          Access scope
          <FieldHelp>Choose who can discover and use this repository resource.</FieldHelp>
          <select value={form.access_scope} onChange={(e) => set("access_scope", e.target.value)}>
            <option value="owner_only">Owner Only</option><option value="specific_people">Specific People</option><option value="admins_only">Admins Only</option><option value="selected_companies">Selected Companies</option><option value="entire_team">Entire Team</option>
          </select>
        </label>
        <label>
          Permission level
          <FieldHelp>Set the permission granted to the selected audience.</FieldHelp>
          <select value={form.access_permission} onChange={(e) => set("access_permission", e.target.value)}>
            <option value="view">View</option><option value="use">Use</option><option value="manage">Manage</option>
          </select>
        </label>
        {form.access_scope === "specific_people" && (
          <SearchableMultiSelect
            label="Authorized people"
            help="Search active users and select one or more people. Hold Ctrl or Command to select multiple entries."
            options={activeUsers.map((person) => ({
              value: person.id,
              label: `${person.full_name || person.email} · ${person.email} · ${companies.find((company) => company.id === person.company_id)?.name || "Unassigned"} · ${person.role}`,
              searchable: `${person.full_name} ${person.email} ${person.role} ${companies.find((company) => company.id === person.company_id)?.name || ""}`,
            }))}
            selected={authorizedPeople}
            setSelected={setAuthorizedPeople}
          />
        )}
        {form.access_scope === "selected_companies" && (
          <SearchableMultiSelect
            label="Authorized companies"
            help="Search active companies and select one or more company audiences. Hold Ctrl or Command to select multiple entries."
            options={companies.filter((company) => company.status === "active").map((company) => ({ value: company.id, label: company.name, searchable: company.name }))}
            selected={authorizedCompanies}
            setSelected={setAuthorizedCompanies}
          />
        )}
        <label>Effective date<FieldHelp>Optionally schedule when repository access begins.</FieldHelp><input type="date" value={form.access_effective_at} onChange={(e) => set("access_effective_at", e.target.value)} /></label>
        <label>Expiration date<FieldHelp>Optionally remove repository access after this date.</FieldHelp><input type="date" min={form.access_effective_at || undefined} value={form.access_expires_at} onChange={(e) => set("access_expires_at", e.target.value)} /></label>
        <label className="full">Access notes<FieldHelp>Explain why access was granted or restricted when useful.</FieldHelp><textarea value={form.access_notes} onChange={(e) => set("access_notes", e.target.value)} /></label>
        {error && <div className="message">{error}</div>}
        <footer><button type="button" onClick={close}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving…" : "Save access"}</button></footer>
      </form>
    </div>
  );
}
function AgentForm({
  user,
  currentUser,
  users,
  companies,
  departments,
  categories,
  userAccess,
  companyAccess,
  admin,
  agent,
  assessment,
  reviewThreshold,
  prompt,
  close,
  saved,
}) {
  const activeDepartments = departments.filter((row) => row.status === "active"),
    activeCategories = categories.filter((row) => row.status === "active"),
    activeUsers = users.filter((row) => row.status === "active"),
    initialDepartmentManaged = activeDepartments.some((row) => row.name === agent?.department),
    initialCategoryManaged = activeCategories.some((row) => row.name === agent?.category);
  const [form, setForm] = useState({
      entry_type: agent?.entry_type || "agent",
      company_id: agent?.company_id || "",
      name: agent?.name || "",
      description: agent?.description || "",
      owner_name: agent?.owner_name || currentUser.full_name || currentUser.email || user.email || "",
      accountable_owner_id: agent?.accountable_owner_id || currentUser.id,
      category: agent?.category || "",
      department: agent?.department || "",
      skills_summary: agent?.skills_summary || "",
      platform: agent?.platform || "Claude",
      environment: agent?.environment || "",
      url: agent?.url || "",
      prompt: prompt || "",
      uses_database: Boolean(agent?.uses_database),
      uses_api: Boolean(agent?.uses_api),
      uses_sensitive_data: Boolean(agent?.uses_sensitive_data),
      crosses_departments: Boolean(agent?.crosses_departments),
      access_scope: agent?.access_scope || (admin ? "admins_only" : "owner_only"),
      access_permission: agent?.access_permission || "manage",
      access_effective_at: agent?.access_effective_at?.slice(0, 10) || "",
      access_expires_at: agent?.access_expires_at?.slice(0, 10) || "",
      access_notes: agent?.access_notes || "",
      vendor: agent?.platform_details?.vendor || "",
      license_type: agent?.platform_details?.license_type || "",
      access_request_instructions: agent?.platform_details?.access_request_instructions || "",
      support_contact: agent?.platform_details?.support_contact || "",
      data_classification_restrictions: agent?.platform_details?.data_classification_restrictions || "",
      approved_use_guidance: agent?.platform_details?.approved_use_guidance || "",
      prohibited_use_guidance: agent?.platform_details?.prohibited_use_guidance || "",
      renewal_at: agent?.platform_details?.renewal_at?.slice(0, 10) || "",
      platform_notes: agent?.platform_details?.notes || "",
    }),
    [error, setError] = useState(""),
    [checking, setChecking] = useState(false),
    [nameEdited, setNameEdited] = useState(Boolean(agent)),
    [departmentChoice, setDepartmentChoice] = useState(
      initialDepartmentManaged ? agent.department : agent?.department ? "__other__" : "",
    ),
    [categoryChoice, setCategoryChoice] = useState(
      initialCategoryManaged ? agent.category : agent?.category ? "__other__" : "",
    ),
    [customDepartment, setCustomDepartment] = useState(
      initialDepartmentManaged ? "" : agent?.department || "",
    ),
    [customCategory, setCustomCategory] = useState(
      initialCategoryManaged ? "" : agent?.category || "",
    ),
    [customOwner, setCustomOwner] = useState(""),
    [authorizedPeople, setAuthorizedPeople] = useState(
      userAccess.map((assignment) => assignment.user_id),
    ),
    [authorizedCompanies, setAuthorizedCompanies] = useState(
      companyAccess.map((assignment) => assignment.company_id),
    ),
    [step, setStep] = useState(1),
    [questionnaire, setQuestionnaire] = useState(() => initialQuestionnaire(assessment?.responses || {}, { accountable_owner_id: agent?.accountable_owner_id || currentUser.id }));
  const canCompleteGovernance = !admin || form.accountable_owner_id === currentUser.id;
  function set(k, v) {
    setForm((current) => ({ ...current, [k]: v }));
  }
  function answerQuestion(id, field, value) {
    setQuestionnaire((current) => ({ ...current, [id]: { ...current[id], [field]: value } }));
  }
  useEffect(() => {
    if (nameEdited) return;
    const name = suggestedEntryName(form);
    setForm((current) => (current.name === name ? current : { ...current, name }));
  }, [form.entry_type, form.description, form.skills_summary, form.category, form.department, nameEdited]);
  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!form.company_id || !form.name.trim() || !form.description.trim() || !form.department.trim() || !form.category.trim() || !form.environment.trim()) { setStep(1); return setError("Complete the required Resource Information fields before submitting."); }
    if (form.entry_type === "platform" && (!form.vendor.trim() || !form.access_request_instructions.trim())) { setStep(1); return setError("Complete the required Platform details before submitting."); }
    if (!form.prompt.trim()) { setStep(4); return setError("Add the current initial prompt before submitting."); }
    const ownerName = form.owner_name === "Other" ? customOwner.trim() : form.owner_name.trim();
    if (!ownerName) { setStep(1); return setError("Select or enter an accountable owner."); }
    const submission = { ...form, owner_name: ownerName };
    const deterministic = evaluateGovernance(questionnaire, { accountable_owner_id: form.accountable_owner_id || (!admin ? user.id : null) }, reviewThreshold);
    setChecking(true);
    function saveFailure(stage, technicalError) {
      console.error(`Resource ${stage} failed`, technicalError);
      setChecking(false);
      setError("We could not save this resource. Please refresh and try again. If the problem continues, contact an administrator.");
    }
    function savedWithAttention(stage, technicalError) {
      console.error(`Saved resource ${stage} failed`, technicalError);
      setChecking(false);
      saved("The resource was saved, but part of its setup needs Admin attention before publication.");
    }
    const accessValues = admin
      ? {
          accountable_owner_id: form.accountable_owner_id,
          access_scope: form.access_scope,
          access_permission: form.access_permission,
          access_effective_at: form.access_effective_at
            ? `${form.access_effective_at}T00:00:00.000Z`
            : null,
          access_expires_at: form.access_expires_at
            ? `${form.access_expires_at}T23:59:59.999Z`
            : null,
          access_notes: form.access_notes || null,
        }
      : agent
        ? {}
        : {
            accountable_owner_id: user.id,
            access_scope: "owner_only",
            access_permission: "manage",
          };
    const values = {
      entry_type: form.entry_type,
      company_id: form.company_id,
      name: form.name,
      description: form.description,
      owner_name: submission.owner_name,
      category: form.category || null,
      department: form.department || null,
      skills_summary: form.skills_summary || null,
      platform: form.platform,
      environment: form.environment,
      url: form.url || null,
      uses_database: false,
      uses_api: questionnaire.trigger_connection?.answer === "Yes",
      uses_sensitive_data: questionnaire.trigger_sensitive?.answer === "Yes",
      crosses_departments: questionnaire.trigger_affected?.answer === "Yes",
      risk_level: deterministic.final_risk,
      governance_score: deterministic.overall_score,
      governance_flagged: deterministic.flagged,
      governance_summary: deterministic.summary,
      governance_checked_at: new Date().toISOString(),
      governance_provider: "Deterministic LV Governance",
      governance_status: deterministic.status,
      status: agent?.status === "retired" ? "retired" : deterministic.status === "cleared" ? "approved" : deterministic.status,
      ...accessValues,
    };
    const data = { id: agent?.id || crypto.randomUUID() };
    let e1;
    if (agent) {
      const result = await supabase
        .from("agents")
        .update(values)
        .eq("id", agent.id);
      e1 = result.error;
    } else {
      // Avoid requesting the inserted row in the same command. The SELECT RLS
      // policy resolves access through the agents table and may not see a row
      // that is still inside its INSERT command.
      const result = await supabase
        .from("agents")
        .insert({ id: data.id, ...values, created_by: user.id });
      e1 = result.error;
    }
    if (e1) {
      return saveFailure("record", e1);
    }
    const platformMutation = form.entry_type === "platform"
      ? supabase.from("platform_details").upsert({
          agent_id: data.id,
          vendor: form.vendor || null,
          license_type: form.license_type || null,
          access_request_instructions: form.access_request_instructions || null,
          support_contact: form.support_contact || null,
          data_classification_restrictions: form.data_classification_restrictions || null,
          approved_use_guidance: form.approved_use_guidance || null,
          prohibited_use_guidance: form.prohibited_use_guidance || null,
          renewal_at: form.renewal_at ? `${form.renewal_at}T23:59:59.999Z` : null,
          notes: form.platform_notes || null,
        })
      : supabase.from("platform_details").delete().eq("agent_id", data.id);
    const { error: platformError } = await platformMutation;
    if (platformError) {
      return savedWithAttention("platform details", platformError);
    }
    let versionNumber = 1;
    if (agent) {
      const { data: latest, error: versionLookupError } = await supabase
        .from("prompt_versions")
        .select("version_number")
        .eq("agent_id", agent.id)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (versionLookupError) {
        return savedWithAttention("prompt history lookup", versionLookupError);
      }
      versionNumber = (latest?.version_number || 0) + 1;
    }
    const version = { id: crypto.randomUUID() };
    const { error: e2 } = await supabase
      .from("prompt_versions")
      .insert({
        id: version.id,
        agent_id: data.id,
        version_number: versionNumber,
        prompt_text: form.prompt,
        change_explanation: agent
          ? "Resource details saved and deterministically reassessed."
          : "Initial prompt saved with its deterministic governance assessment.",
        status: "pending",
        created_by: user.id,
      });
    if (e2) {
      return savedWithAttention("prompt history", e2);
    }
    if (admin) {
      const [removePeople, removeCompanies] = await Promise.all([
        supabase.from("agent_user_access").delete().eq("agent_id", data.id),
        supabase.from("agent_company_access").delete().eq("agent_id", data.id),
      ]);
      const removalError = removePeople.error || removeCompanies.error;
      if (removalError) {
        return savedWithAttention("access assignments", removalError);
      }
      const assignmentValues = {
        permission_level: form.access_permission,
        effective_at: accessValues.access_effective_at,
        expires_at: accessValues.access_expires_at,
        granted_by: user.id,
      };
      if (form.access_scope === "specific_people" && authorizedPeople.length) {
        const { error: peopleError } = await supabase
          .from("agent_user_access")
          .insert(
            authorizedPeople.map((userId) => ({
              agent_id: data.id,
              user_id: userId,
              ...assignmentValues,
            })),
          );
        if (peopleError) {
          return savedWithAttention("people access", peopleError);
        }
      }
      if (
        form.access_scope === "selected_companies" &&
        authorizedCompanies.length
      ) {
        const { error: companiesError } = await supabase
          .from("agent_company_access")
          .insert(
            authorizedCompanies.map((companyId) => ({
              agent_id: data.id,
              company_id: companyId,
              ...assignmentValues,
            })),
          );
        if (companiesError) {
          return savedWithAttention("company access", companiesError);
        }
      }
    }
    const { error: assessmentSaveError } = await supabase.rpc("record_governance_assessment", {
      target_agent: data.id,
      target_prompt_version: version.id,
      target_version: ASSESSMENT_VERSION,
      target_score: deterministic.overall_score,
      target_categories: deterministic.category_scores,
      target_responses: questionnaire,
      target_initial_risk: deterministic.initial_risk,
      target_final_risk: deterministic.final_risk,
      target_overrides: deterministic.overrides,
      target_missing: deterministic.missing,
      target_status: deterministic.status,
      target_summary: deterministic.summary,
    });
    if (assessmentSaveError) return savedWithAttention("deterministic assessment", assessmentSaveError);
    setChecking(false);
    saved(deterministic.status === "cleared" ? "Your resource was saved and cleared. Review the recommendations below to strengthen its governance." : deterministic.status === "assessment_pending" ? "Your resource was saved. Complete the missing governance information before publication." : "Your resource was saved and sent to Admin review because its risk score or a required safeguard needs attention.", deterministic);
  }
  return (
    <div className="backdrop">
      <form className="modal compact resource-form" onSubmit={submit}>
        <header>
          <div>
            <small>OPEN CREATION · GOVERNANCE MONITORED</small>
            <h2>{agent ? "Edit resource" : "Add a Resource"}</h2>
          </div>
          <button type="button" onClick={close}>
            ×
          </button>
        </header>
        <nav className="form-steps" aria-label="Resource registration steps">
          {["Resource Information", "Access Management", "Governance Check", "Review & Submit"].map((label, index) => <button key={label} type="button" className={step === index + 1 ? "active" : ""} aria-current={step === index + 1 ? "step" : undefined} onClick={() => setStep(index + 1)}><span>{index + 1}</span>{label}</button>)}
        </nav>
        {step === 1 && <>
        <label>
          Resource Type
          <FieldHelp>Select whether you are registering an AI agent, a reusable skillset, or an AI platform available to the organization.</FieldHelp>
          <select
            value={form.entry_type}
            onChange={(e) => set("entry_type", e.target.value)}
          >
            <option value="agent">Agent</option>
            <option value="skillset">Skillset</option>
            <option value="platform">Platform</option>
          </select>
        </label>
        <label>
          Company
          <FieldHelp>Select the Lead Ventures company that owns or primarily uses this resource. Company assignment supports organization and does not restrict access by itself.</FieldHelp>
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
          <FieldHelp>Enter a clear, recognizable name. A suggested name may be generated from the information you provide.</FieldHelp>
          <input
            required
            value={form.name}
            onChange={(e) => {
              setNameEdited(true);
              set("name", e.target.value);
            }}
          />
        </label>
        <label>
          Accountable owner
          <FieldHelp>Select the person responsible for this resource, including its use, maintenance, and outcomes.</FieldHelp>
          <input
            required
            list="accountable-owner-options"
            disabled={!admin}
            value={form.owner_name}
            onChange={(e) => {
              const ownerName = e.target.value;
              const matched = activeUsers.find(
                (person) =>
                  person.full_name === ownerName || person.email === ownerName,
              );
              setForm((current) => ({
                ...current,
                owner_name: ownerName,
                accountable_owner_id: matched?.id || null,
              }));
            }}
          />
          <datalist id="accountable-owner-options">
            {activeUsers.map((person) => (
              <option
                key={person.id}
                value={person.full_name || person.email}
                label={`${person.email} · ${companies.find((company) => company.id === person.company_id)?.name || "Unassigned"} · ${person.role}`}
              />
            ))}
            <option value="Other" />
          </datalist>
        </label>
        {form.owner_name === "Other" && (
          <label>
            Other accountable owner
            <input required value={customOwner} onChange={(e) => setCustomOwner(e.target.value)} />
          </label>
        )}
        <label>
          Department
          <FieldHelp>Select the business department primarily responsible for this resource.</FieldHelp>
          <select
            required
            value={departmentChoice}
            onChange={(e) => {
              const value = e.target.value;
              setDepartmentChoice(value);
              set("department", value === "__other__" ? customDepartment : value);
            }}
          >
            <option value="">Select department</option>
            {activeDepartments.map((department) => (
              <option key={department.id} value={department.name}>{department.name}</option>
            ))}
            <option value="__other__">Other</option>
          </select>
        </label>
        {departmentChoice === "__other__" && (
          <label>
            Other department
            <input
              required
              value={customDepartment}
              onChange={(e) => {
                setCustomDepartment(e.target.value);
                set("department", e.target.value);
              }}
            />
          </label>
        )}
        <label>
          Category
          <FieldHelp>Select the type of business work this resource supports.</FieldHelp>
          <select
            required
            value={categoryChoice}
            onChange={(e) => {
              const value = e.target.value;
              setCategoryChoice(value);
              set("category", value === "__other__" ? customCategory : value);
            }}
          >
            <option value="">Select category</option>
            {activeCategories.map((category) => (
              <option key={category.id} value={category.name}>{category.name}</option>
            ))}
            <option value="__other__">Other</option>
          </select>
        </label>
        {categoryChoice === "__other__" && (
          <label>
            Other category
            <input
              required
              value={customCategory}
              onChange={(e) => {
                setCustomCategory(e.target.value);
                set("category", e.target.value);
              }}
            />
          </label>
        )}
        <label className="full">
          Purpose and description
          <FieldHelp>Explain the business problem this resource addresses, who will use it, and the expected outcome.</FieldHelp>
          <textarea required value={form.description} onChange={(e) => set("description", e.target.value)} />
        </label>
        <label className="full">
          Capabilities or skills
          <FieldHelp>List the specific tasks the agent can perform. Include any tools, data sources, systems, or specialized knowledge it uses.</FieldHelp>
          <textarea value={form.skills_summary} onChange={(e) => set("skills_summary", e.target.value)} />
        </label>
        <label>
          Platform
          <FieldHelp>Select the primary AI platform used to build or run this resource.</FieldHelp>
          <select
            value={form.platform}
            onChange={(e) => set("platform", e.target.value)}
          >
            <option>Claude</option>
            <option>ChatGPT</option>
            <option>Google Gemini</option>
            <option>Microsoft Copilot</option>
            <option>UiPath</option>
            <option>Other</option>
          </select>
        </label>
        <label>
          Where it runs
          <FieldHelp>Identify where users access or operate it, such as ChatGPT, Gemini, Claude, Microsoft Copilot, a website, or an internal application.</FieldHelp>
          <input
            required
            value={form.environment}
            onChange={(e) => set("environment", e.target.value)}
          />
        </label>
        <label>
          URL
          <FieldHelp>Enter the direct link to the resource, if one is available.</FieldHelp>
          <input
            value={form.url}
            onChange={(e) => set("url", e.target.value)}
          />
        </label>
        {form.entry_type === "platform" && (
          <fieldset className="full platform-fields">
            <legend>Platform details</legend>
            <p className="field-help">Document how the approved platform is licensed, requested, supported, and used safely.</p>
            <label>
              Vendor
              <FieldHelp>Enter the company that provides the platform.</FieldHelp>
              <input required value={form.vendor} onChange={(e) => set("vendor", e.target.value)} />
            </label>
            <label>
              License type
              <FieldHelp>Describe the plan, seat, enterprise agreement, or other license model.</FieldHelp>
              <input value={form.license_type} onChange={(e) => set("license_type", e.target.value)} />
            </label>
            <label className="full">
              Access request instructions
              <FieldHelp>Explain exactly how a person requests a license or account and who approves it.</FieldHelp>
              <textarea required value={form.access_request_instructions} onChange={(e) => set("access_request_instructions", e.target.value)} />
            </label>
            <label>
              Support contact
              <FieldHelp>List the internal administrator, team, email address, or support route.</FieldHelp>
              <input value={form.support_contact} onChange={(e) => set("support_contact", e.target.value)} />
            </label>
            <label>
              Renewal or expiration date
              <FieldHelp>Track the next contract renewal, review, or expiration date.</FieldHelp>
              <input type="date" value={form.renewal_at} onChange={(e) => set("renewal_at", e.target.value)} />
            </label>
            <label className="full">
              Data classification restrictions
              <FieldHelp>State what confidential, personal, regulated, or internal data may not be entered.</FieldHelp>
              <textarea value={form.data_classification_restrictions} onChange={(e) => set("data_classification_restrictions", e.target.value)} />
            </label>
            <label className="full">
              Approved use guidance
              <FieldHelp>Describe approved teams, workflows, and business uses.</FieldHelp>
              <textarea value={form.approved_use_guidance} onChange={(e) => set("approved_use_guidance", e.target.value)} />
            </label>
            <label className="full">
              Prohibited use guidance
              <FieldHelp>Describe activities, data, or decisions that are not permitted.</FieldHelp>
              <textarea value={form.prohibited_use_guidance} onChange={(e) => set("prohibited_use_guidance", e.target.value)} />
            </label>
            <label className="full">
              Platform notes
              <FieldHelp>Add procurement, configuration, rollout, or administrative notes.</FieldHelp>
              <textarea value={form.platform_notes} onChange={(e) => set("platform_notes", e.target.value)} />
            </label>
            <p className="field-help full">Availability in this repository does not automatically create a license or user account in the external platform. Follow the listed access instructions or contact the designated administrator.</p>
          </fieldset>
        )}
        </>}
        {step === 3 && <>
        {!canCompleteGovernance && <div className="full governance-owner-note"><b>Governance Check must be completed by the accountable owner.</b><p>Admins may assign an owner and save the resource, but must not answer the owner’s initial assessment. The resource will be saved as Assessment Pending.</p></div>}
        {canCompleteGovernance && <>
        <fieldset className="full context-questions">
          <legend>Tell us how this resource will operate</legend>
          <p>Tell us how this resource will operate. Select the response that best describes it. You do not need to be a technology or governance expert. Choose “Not Sure” when you need assistance.</p>
          {TRIGGER_QUESTIONS.map(([id, label]) => <div key={id}><b>{label}</b><span>{["Yes", "No"].map((option) => <label key={option}><input type="radio" name={id} value={option} checked={questionnaire[id]?.answer === option} onChange={(e) => answerQuestion(id, "answer", e.target.value)}/>{option}</label>)}</span></div>)}
        </fieldset>
        <fieldset className="full governance-questionnaire">
          <legend>Governance readiness questionnaire</legend>
          <p className="field-help">Your resource will be saved regardless of its score. Only resources with elevated risk or missing critical safeguards are sent to Admin review.</p>
          <div className="scale-direction"><span>Greater concern</span><span>Stronger controls</span></div>
          {GOVERNANCE_CATEGORIES.map((category) => (
            <section key={category.id}>
              <header><h3>{category.label}</h3><span>{category.weight}% weight</span></header>
              {visibleStatements(category, questionnaire).map((statement) => <QuestionnaireField key={statement.id} statement={statement} value={questionnaire[statement.id]} change={answerQuestion} />)}
              {visibleStatements(category, questionnaire).length === 0 && <p className="field-help">No statements are needed based on the context answers above.</p>}
            </section>
          ))}
          <section>
            <header><h3>Safety declaration</h3><span>Mandatory safeguard</span></header>
            {OVERRIDE_QUESTIONS.map(([id, label]) => (
              <div className="safety-declaration" key={id}><b>{label}</b>{["Yes", "No"].map((option) => <label key={option}><input type="radio" name={id} checked={questionnaire[id]?.answer === option} value={option} onChange={(e) => answerQuestion(id, "answer", e.target.value)}/>{option}</label>)}</div>
            ))}
          </section>
          <p className="questionnaire-note">Incomplete answers never prevent saving. Higher percentages mean greater governance risk. The current Admin-review threshold is {reviewThreshold}%.</p>
        </fieldset>
        </>}
        </>}
        {step === 2 && <>
        <fieldset className="full access-management-fields">
          <legend>Access Management</legend>
          <p className="field-help">
            Control who can discover and use this resource. Application access does not automatically grant access inside ChatGPT, Gemini, Claude, Microsoft Copilot, or another external platform.
          </p>
          <label>
            Access scope
            <FieldHelp>Choose the audience that can discover this repository resource.</FieldHelp>
            <select
              value={form.access_scope}
              disabled={!admin}
              onChange={(e) => set("access_scope", e.target.value)}
            >
              <option value="owner_only">Owner Only</option>
              <option value="specific_people">Specific People</option>
              <option value="admins_only">Admins Only</option>
              <option value="selected_companies">Selected Companies</option>
              <option value="entire_team">Entire Team</option>
            </select>
          </label>
          <label>
            Permission level
            <FieldHelp>Set what assigned people or companies may do with the resource.</FieldHelp>
            <select
              value={form.access_permission}
              disabled={!admin}
              onChange={(e) => set("access_permission", e.target.value)}
            >
              <option value="view">View</option>
              <option value="use">Use</option>
              <option value="manage">Manage</option>
            </select>
          </label>
          {admin && form.access_scope === "specific_people" && (
            <SearchableMultiSelect
              label="Authorized people"
              help="Search active users and select one or more people. Hold Ctrl or Command to select multiple entries."
              options={activeUsers.map((person) => ({
                value: person.id,
                label: `${person.full_name || person.email} · ${person.email} · ${companies.find((company) => company.id === person.company_id)?.name || "Unassigned"} · ${person.role}`,
                searchable: `${person.full_name} ${person.email} ${person.role} ${companies.find((company) => company.id === person.company_id)?.name || ""}`,
              }))}
              selected={authorizedPeople}
              setSelected={setAuthorizedPeople}
            />
          )}
          {admin && form.access_scope === "selected_companies" && (
            <SearchableMultiSelect
              label="Authorized companies"
              help="Search active companies and select one or more company audiences. Hold Ctrl or Command to select multiple entries."
              options={companies
                .filter((company) => company.status === "active")
                .map((company) => ({
                  value: company.id,
                  label: company.name,
                  searchable: company.name,
                }))}
              selected={authorizedCompanies}
              setSelected={setAuthorizedCompanies}
            />
          )}
          <label>
            Effective date
            <FieldHelp>Optionally schedule when repository access begins.</FieldHelp>
            <input
              type="date"
              disabled={!admin}
              value={form.access_effective_at}
              onChange={(e) => set("access_effective_at", e.target.value)}
            />
          </label>
          <label>
            Expiration date
            <FieldHelp>Optionally remove repository access after this date.</FieldHelp>
            <input
              type="date"
              disabled={!admin}
              min={form.access_effective_at || undefined}
              value={form.access_expires_at}
              onChange={(e) => set("access_expires_at", e.target.value)}
            />
          </label>
          <label className="full">
            Access notes
            <FieldHelp>Explain why access was granted or restricted when useful.</FieldHelp>
            <textarea
              disabled={!admin}
              value={form.access_notes}
              onChange={(e) => set("access_notes", e.target.value)}
            />
          </label>
          {!admin && (
            <p className="access-lock-note">
              Editor-created resources remain Owner Only until an Admin changes access.
            </p>
          )}
          <p className="external-access-note">
            Access granted in this repository does not automatically configure permissions in the external AI platform. Confirm external platform access separately.
          </p>
        </fieldset>
        </>}
        {step === 4 && <>
        <label className="full">
          Initial prompt
          <FieldHelp>Enter the current system instructions or primary prompt. Do not include passwords, API keys, confidential customer information, or other secrets.</FieldHelp>
          <textarea
            required
            value={form.prompt}
            onChange={(e) => set("prompt", e.target.value)}
          />
        </label>
        <section className="full review-summary">
          <h3>Review before submitting</h3>
          <dl><div><dt>Resource</dt><dd>{form.name || "Not provided"}</dd></div><div><dt>Type</dt><dd>{form.entry_type}</dd></div><div><dt>Company</dt><dd>{companies.find((company) => company.id === form.company_id)?.name || "Not selected"}</dd></div><div><dt>Owner</dt><dd>{form.owner_name || "Not selected"}</dd></div><div><dt>Access</dt><dd>{ACCESS_SCOPE_LABELS[form.access_scope] || "Owner Only"}</dd></div><div><dt>Governance Check</dt><dd>{canCompleteGovernance ? "Owner responses will be scored deterministically" : "Assessment Pending — send to owner"}</dd></div></dl>
          <p>Every resource is saved. Resources at or above {reviewThreshold}% risk, or with a mandatory override, are routed to Admin review.</p>
        </section>
        </>}
        {error && <div className="message">{error}</div>}
        <footer>
          <button type="button" onClick={close}>
            Cancel
          </button>
          {step > 1 && <button type="button" onClick={() => setStep((current) => current - 1)}>Back</button>}
          {step < 4 && <button type="button" className="primary" onClick={() => setStep((current) => current + 1)}>Continue</button>}
          {step === 4 && <button className="primary" disabled={checking}>
            {checking
              ? "Saving and assessing…"
              : agent
                ? "Save & assess"
                : "Save resource & assess"}
          </button>}
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
          text="Only prompts attached to a governance-flagged resource appear here."
        />
      ) : (
        <div className="cards">
          {pending.map((v) => (
            <ApprovalCard key={v.id} version={v} admin={admin} approve={approve} />
          ))}
        </div>
      )}
    </>
  );
}
function ApprovalCard({ version, admin, approve }) {
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  async function decide(decision) {
    setSubmitting(true);
    await approve(version.id, decision, notes);
    setSubmitting(false);
  }
  return (
    <article>
      <div>
        <small>{version.agents?.name} · v{version.version_number}</small>
        <h3>{version.change_explanation}</h3>
        <pre>{version.prompt_text}</pre>
      </div>
      {admin && (
        <label className="review-notes">
          Decision notes <span>(optional)</span>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add context for the author or audit history." />
        </label>
      )}
      <footer>
        {admin ? (
          <>
            <button disabled={submitting} onClick={() => decide("changes_requested")}>Request changes</button>
            <button className="primary" disabled={submitting} onClick={() => decide("approved")}>Approve & publish</button>
          </>
        ) : <span>Admin approval required</span>}
      </footer>
    </article>
  );
}
function LikertScale({ name, label, value, disabled = false, onChange }) {
  return <>
    <div className="likert-scale" role="radiogroup" aria-label={label}>
      {LIKERT_OPTIONS.slice(0, 5).map((option) => <label className={value === option.value ? "selected" : ""} key={option.value}><input type="radio" name={name} value={option.value} disabled={disabled} checked={value === option.value} aria-checked={value === option.value} onChange={(event) => onChange(event.target.value)}/><span>{option.value}</span><b aria-hidden="true">{value === option.value ? "✓" : "○"}</b></label>)}
    </div>
    {!disabled && <label className={`not-applicable-option ${value === "Not Applicable" ? "selected" : ""}`}><input type="radio" name={name} value="Not Applicable" checked={value === "Not Applicable"} aria-checked={value === "Not Applicable"} onChange={(event) => onChange(event.target.value)}/><span>Not Applicable</span><b aria-hidden="true">{value === "Not Applicable" ? "✓ Selected" : "○"}</b></label>}
  </>;
}
function QuestionnaireField({ statement, value = {}, change }) {
  const explanationRequired = ["Not Sure", "Disagree", "Strongly Disagree", "Not Applicable"].includes(value.answer);
  return (
    <div className={`likert-statement ${statement.automatic ? "automatic" : ""}`}>
      <div><b>{statement.label}</b><p>{statement.help}</p>{statement.automatic && <small>Automatically confirmed from repository records</small>}</div>
      <LikertScale name={statement.id} label={statement.label} value={value.answer} disabled={Boolean(statement.automatic)} onChange={(answer) => change(statement.id, "answer", answer)} />
      {(explanationRequired || value.explanation) && (
        <label className="likert-explanation">Please briefly explain your response so the Admin can understand what assistance or follow-up may be needed. {explanationRequired && <span>(required)</span>}
          <textarea value={value.explanation || ""} onChange={(e) => change(statement.id, "explanation", e.target.value)} />
        </label>
      )}
    </div>
  );
}
function AssessmentResult({ result, close }) {
  const cleared = result.status === "cleared";
  return <div className="backdrop"><section className="modal compact assessment-result" role="dialog" aria-modal="true" aria-labelledby="assessment-result-title">
    <header><div><small>GOVERNANCE ASSESSMENT COMPLETE</small><h2 id="assessment-result-title">{result.overall_score}% {riskLabel(result.risk_band)} Risk</h2></div><button onClick={close}>×</button></header>
    <div className={`result-banner ${cleared ? "cleared" : "review"}`}>{cleared ? "Your resource was saved and cleared. Review the recommendations below to strengthen its governance." : result.status === "assessment_pending" ? "Your resource was saved. Additional information is needed before publication." : "Your resource was saved and sent to Admin review because its risk score or a required safeguard needs attention."}</div>
    <div className="category-score-grid">{GOVERNANCE_CATEGORIES.map((category) => <span key={category.id}><b>{category.label}</b>{result.category_scores[category.id]}% risk</span>)}</div>
    <section><h3>Responses that increased the score</h3>{result.drivers.length ? <ul>{result.drivers.map((driver) => <li key={driver.id}><b>{driver.response} · {driver.points} points</b> — {driver.statement}</li>)}</ul> : <p>No responses increased the risk score.</p>}</section>
    <section><h3>Required actions</h3>{result.overrides.length ? <ul>{result.overrides.map((item) => <li key={item.id}>{item.reason}</li>)}</ul> : <p>No mandatory safeguard actions were triggered.</p>}</section>
    <section><h3>Recommended improvements</h3>{result.recommendations.length ? <ul>{result.recommendations.map((item) => <li key={item}>{item}</li>)}</ul> : <p>Continue maintaining the documented safeguards.</p>}</section>
    <section><h3>Next step</h3><p>{result.status === "assessment_pending" ? "Complete the missing responses or explanations and resubmit the resource." : cleared ? "The resource is published according to its repository access settings." : "An Admin will review the assessment and may request clarification or changes."}</p></section>
    <footer><button className="primary" onClick={close}>Done</button></footer>
  </section></div>;
}
function Governance({ agents, assessments, clarifications, advisories, recommendations, attentionItems, admin, user, token, reload, notify, edit }) {
  const [ai, setAi] = useState({ loading: true, configured: false });
  const [historySearch, setHistorySearch] = useState("");
  useEffect(() => {
    if (!admin) return;
    fetch("/api/ai-advisory", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => ({ ok: response.ok, ...(await response.json()) }))
      .then((result) => setAi({ loading: false, ...result, configured: result.ok && result.configured }))
      .catch(() => setAi({ loading: false, configured: false }));
  }, [admin, token]);
  const latest = assessments.filter((item, index, all) => all.findIndex((candidate) => candidate.agent_id === item.agent_id) === index);
  const queue = agents.filter((agent) => {
    const item = latest.find((candidate) => candidate.agent_id === agent.id);
    return !item || item.assessment_version !== ASSESSMENT_VERSION || agent.manual_governance_flag || ["assessment_pending", "governance_review", "clarification_requested", "changes_requested"].includes(item?.review_status || agent.governance_status);
  });
  async function requireReassessment(agentId) {
    const { error } = await supabase.rpc("request_governance_reassessment", { target_agent: agentId });
    if (error) return notify("We could not request reassessment. Confirm your Admin access and try again.");
    notify("The resource was added to the governance queue for reassessment.");
    await reload();
  }
  return <>
    <PageHead tag="RESPONSIBLE AI" title="AI Governance" desc="Deterministic readiness scoring, mandatory overrides, Admin review, clarification, and advisory remediation. AI never changes the official result." />
    {admin && !ai.loading && !ai.configured && <div className="admin-message">AI-assisted assessment is not configured. The deterministic governance assessment remains available.</div>}
    {queue.length === 0 ? <Empty title="Governance queue is clear" text="No medium, high, critical, pending, or manually flagged resources currently require review." /> : <div className="governance-flags">{queue.map((agent) => <GovernanceCard key={agent.id} agent={agent} assessment={latest.find((item) => item.agent_id === agent.id)} history={assessments.filter((item) => item.agent_id === agent.id)} clarifications={clarifications.filter((item) => item.agent_id === agent.id)} advisories={advisories.filter((item) => item.agent_id === agent.id)} recommendations={recommendations.filter((item) => item.agent_id === agent.id)} savedAttentionItems={attentionItems.filter((item) => item.agent_id === agent.id)} admin={admin} user={user} token={token} ai={ai} reload={reload} notify={notify} edit={edit} />)}</div>}
    {admin && <section className="assessment-history"><header><div><small>AUDIT, NOT AN APPROVAL QUEUE</small><h2>Assessment history</h2></div><input type="search" value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} placeholder="Search resources or owners"/></header><div className="table embedded"><table><thead><tr><th>Resource</th><th>Owner</th><th>Assessment</th><th>Risk score</th><th>Risk level</th><th>Threshold used</th><th>Outcome</th><th>Date</th><th>Audit action</th></tr></thead><tbody>{assessments.filter((item) => { const agent = agents.find((candidate) => candidate.id === item.agent_id); return `${agent?.name || ""} ${agent?.owner_name || ""}`.toLowerCase().includes(historySearch.toLowerCase()); }).map((item) => { const agent = agents.find((candidate) => candidate.id === item.agent_id); const isLatest = latest.some((candidate) => candidate.id === item.id); return <tr key={item.id}><td><b>{agent?.name || "Deleted resource"}</b></td><td>{agent?.owner_name || "—"}</td><td>{item.assessment_version} · v{item.assessment_number}</td><td>{item.overall_score}%</td><td>{riskLabel(item.risk_band || (item.overall_score < 20 ? "low" : item.overall_score < 40 ? "moderate_low" : item.final_risk))}</td><td>{item.review_threshold ?? "Legacy"}</td><td><Pill text={item.review_status}/></td><td>{new Date(item.assessed_at).toLocaleDateString()}</td><td>{isLatest && item.review_status === "cleared" && !agent?.manual_governance_flag ? <button onClick={() => requireReassessment(item.agent_id)}>Require reassessment</button> : "—"}</td></tr>; })}</tbody></table></div></section>}
    <section className="standard"><h2>Lead Ventures Resource Standard</h2><div>{["Clear approved purpose","Named accountable owner","Human review for high-impact decisions","Grounded outputs and uncertainty labels","Representative bias evaluation","Data minimization and retention rules","Failure, escalation, and rollback plan","Quarterly access review"].map((item) => <span key={item}>✓ {item}</span>)}</div></section>
  </>;
}
function governanceAttentionItems(assessment, advisories = [], savedItems = []) {
  if (!assessment) return [];
  const statements = GOVERNANCE_CATEGORIES.flatMap((category) => category.statements.map((statement) => ({ ...statement, category: category.label })));
  const points = Object.fromEntries(LIKERT_OPTIONS.map((option) => [option.value, option.points]));
  const responses = assessment.responses || {};
  const items = statements.flatMap((statement) => {
    const response = responses[statement.id] || {};
    const contribution = points[response.answer];
    const explanationMissing = ["Strongly Disagree", "Disagree", "Not Sure", "Not Applicable"].includes(response.answer) && !response.explanation?.trim();
    const material = ["Strongly Disagree", "Disagree", "Not Sure"].includes(response.answer) || contribution >= 50 || explanationMissing;
    if (!material) return [];
    return [{ id: statement.id, category: statement.category, statement: statement.label, response: response.answer || "Missing", explanation: response.explanation || "No explanation provided", points: response.answer === "Not Applicable" ? "Excluded only with valid justification" : `${contribution ?? 0} points`, action: explanationMissing ? "Ask the owner to provide the required explanation or justification." : "Ask the owner to document or strengthen this safeguard." }];
  });
  (assessment.missing_information || []).forEach((id) => {
    const baseId = id.replace(":explanation", ""), statement = statements.find((item) => item.id === baseId);
    if (!items.some((item) => item.id === id)) items.push({ id, category: statement?.category || "Assessment", statement: statement?.label || "Required governance information", response: responses[baseId]?.answer || "Missing", explanation: responses[baseId]?.explanation || "No explanation provided", points: "Pending", action: "Ask the owner to complete the missing information." });
  });
  (assessment.mandatory_overrides || []).forEach((override) => items.push({ id: `override:${override.id}`, category: "Mandatory override", statement: override.reason, response: "Override triggered", explanation: override.evidence || "", points: `Minimum ${riskLabel(override.minimum_risk)} Risk`, action: "Resolve the safeguard gap or document the Admin decision." }));
  advisories.flatMap((item) => item.output?.concerns || []).forEach((concern, index) => items.push({ id: `ai:${index}`, category: "AI-assisted analysis", statement: typeof concern === "string" ? concern : concern.concern || JSON.stringify(concern), response: "Advisory", explanation: "AI-identified issue; Admin verification required.", points: "Does not affect deterministic score", action: "Review the evidence and decide whether owner clarification is needed." }));
  savedItems.filter((item) => item.status !== "resolved").forEach((item) => items.push({ id: `saved:${item.id}`, category: item.category || "Admin issue", statement: item.statement, response: item.owner_response || "Awaiting owner response", explanation: item.owner_explanation || "No owner explanation recorded", points: item.risk_points == null ? "Admin-added issue" : `${item.risk_points} points`, action: item.recommended_action || "Respond to the Admin’s clarification request." }));
  return items;
}
function GovernanceCard({ agent, assessment, history, clarifications, advisories, recommendations, savedAttentionItems, admin, user, token, ai, reload, notify, edit }) {
  const [form, setForm] = useState({ notes: "", conditions: "", clarification: "", deadline: "" });
  const attentionItems = governanceAttentionItems(assessment, advisories, savedAttentionItems);
  const [selectedQuestions, setSelectedQuestions] = useState(() => governanceAttentionItems(assessment, advisories, savedAttentionItems).map((item) => item.id));
  const [customQuestion, setCustomQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const legacy = !assessment || assessment.assessment_version !== ASSESSMENT_VERSION;
  const decisionAllowed = assessment && ["governance_review", "clarification_requested", "changes_requested"].includes(assessment.review_status);
  const changesAllowed = assessment && ["governance_review", "clarification_requested", "changes_requested", "assessment_pending"].includes(assessment.review_status);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  async function decide(decision) {
    if (!assessment) return notify("Complete the deterministic assessment before recording a decision.");
    if (decision === "approved_with_conditions" && !form.conditions.trim() && !form.notes.trim()) return notify("Add approval conditions or Admin notes before approving with conditions.");
    if (["request_changes", "rejected", "accepted_residual_risk"].includes(decision) && !form.notes.trim()) return notify("Add Admin notes before recording this decision.");
    setBusy(true);
    const { error } = await supabase.rpc("decide_governance_assessment", { target_assessment: assessment.id, target_decision: decision, decision_notes: form.notes || null, decision_conditions: form.conditions || null });
    setBusy(false);
    if (error) return notify(error.message.includes("own resource") ? "Resource authors cannot approve their own resource. A different Admin must record approval." : "We could not record this governance decision. Confirm your Admin access and try again.");
    notify("Governance decision recorded in the audit history."); await reload();
  }
  async function requestClarification() {
    if (!assessment || !form.clarification.trim() || (!selectedQuestions.length && !customQuestion.trim())) return notify("Select at least one issue or add a custom question, then add clarification instructions.");
    setBusy(true);
    const questionIds = [...new Set(selectedQuestions)];
    if (customQuestion.trim()) {
      const { data: customItem, error: customError } = await supabase.from("governance_attention_items").insert({ assessment_id: assessment.id, agent_id: agent.id, source: "admin", category: "Admin clarification", statement: customQuestion.trim(), recommended_action: form.clarification.trim(), status: "clarification_requested", created_by: user.id }).select("id").single();
      if (customError) { setBusy(false); return notify("We could not save the custom clarification issue. Confirm migration 017 is installed and try again."); }
      questionIds.push(`custom:${customItem.id}`);
    }
    const { error } = await supabase.from("governance_clarifications").insert({ assessment_id: assessment.id, agent_id: agent.id, requested_by: user.id, question_ids: questionIds, instructions: form.clarification.trim(), due_at: form.deadline ? `${form.deadline}T23:59:59.999Z` : null });
    setBusy(false);
    if (error) return notify("We could not send the clarification request. Confirm your Admin access and try again.");
    notify("Clarification request sent to the accountable owner."); await reload();
  }
  async function sendOwnerCheck() {
    if (!agent.accountable_owner_id) return notify("Assign an accountable owner before sending the Governance Check.");
    setBusy(true);
    const { error } = await supabase.rpc("request_owner_governance_check", { target_agent: agent.id, target_due_at: form.deadline ? `${form.deadline}T23:59:59.999Z` : null });
    setBusy(false);
    if (error) return notify("We could not send the Governance Check. Confirm the migration is installed and try again.");
    notify("Governance Check sent to the accountable owner."); await reload();
  }
  async function runAI() {
    setBusy(true);
    try {
      const response = await fetch("/api/ai-advisory", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ assessmentId: assessment?.id }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      notify("AI advisory saved. The official score, risk, and publication status were not changed."); await reload();
    } catch (error) { console.error("AI advisory failed", error); notify("The optional AI-assisted assessment could not be completed. Confirm its configuration and try again."); } finally { setBusy(false); }
  }
  return <article>
    <header><div><small>{agent.entry_type || "agent"} · {agent.companies?.name || "Unassigned company"} · assessment v{assessment?.assessment_number || "—"}</small><h2>{agent.name}</h2></div><span className="risk-flag">⚑ {riskLabel(assessment?.risk_band || assessment?.final_risk)} Risk</span></header>
    <dl><div><dt>Accountable owner</dt><dd>{agent.owner_name || "Unassigned"}</dd></div><div><dt>Governance Risk Score</dt><dd>{assessment?.overall_score ?? "—"}%</dd></div><div><dt>Risk level</dt><dd>{riskLabel(assessment?.risk_band || assessment?.final_risk)}</dd></div><div><dt>Review threshold used</dt><dd>{assessment?.review_threshold ?? "Legacy"}{assessment?.review_threshold != null ? "%" : ""}</dd></div><div><dt>Review status</dt><dd><Pill text={assessment?.review_status || agent.governance_status} /></dd></div><div><dt>Date assessed</dt><dd>{assessment?.assessed_at ? new Date(assessment.assessed_at).toLocaleDateString() : "Pending"}</dd></div></dl>
    {assessment && <><section><h3>Category scores</h3><div className="category-score-grid">{GOVERNANCE_CATEGORIES.map((category) => <span key={category.id}><b>{category.label}</b>{assessment.category_scores?.[category.id] ?? "—"}%</span>)}</div></section><section><h3>Mandatory overrides</h3>{assessment.mandatory_overrides?.length ? <ul>{assessment.mandatory_overrides.map((item) => <li key={item.id}><b>{item.minimum_risk}</b> · {item.reason}</li>)}</ul> : <p>No mandatory overrides applied.</p>}</section></>}
    {clarifications.length > 0 && <details><summary>Clarification history ({clarifications.length})</summary>{clarifications.map((item) => <div className="history-item" key={item.id}><b>{item.status}</b><p>{item.instructions}</p>{item.owner_response && <p><strong>Owner:</strong> {item.owner_response}</p>}<small>{new Date(item.created_at).toLocaleString()}</small></div>)}</details>}
    {advisories.length > 0 && <details open><summary>AI advisory history ({advisories.length})</summary>{advisories.map((item) => <Advisory key={item.id} item={item} recommendations={recommendations.filter((recommendation) => recommendation.advisory_id === item.id)} admin={admin} reload={reload} notify={notify} />)}</details>}
    {history.length > 1 && <details><summary>Assessment history ({history.length})</summary>{history.map((item) => <div className="history-item" key={item.id}>v{item.assessment_number} · {item.overall_score}% · {item.final_risk} · {new Date(item.assessed_at).toLocaleString()}</div>)}</details>}
    {agent.manual_governance_flag && <div className="reassessment-notice"><b>Reassessment requested</b><span>Open the resource, confirm the current answers, and save a new assessment version.</span><button className="primary" onClick={() => edit(agent)}>Reassess resource</button></div>}
    {admin ? <div className="governance-actions">
      {legacy ? <section className="legacy-governance"><h3>Current Governance Check Required</h3><p>This resource was created before the current governance assessment. Send the Governance Check to the accountable owner to establish its current risk score.</p><label>Response deadline<input type="date" value={form.deadline} onChange={(e) => set("deadline", e.target.value)} /></label><div>{!agent.accountable_owner_id && <button onClick={() => edit(agent)}>Assign Owner</button>}<button className="primary" disabled={busy || !agent.accountable_owner_id} onClick={sendOwnerCheck}>Send Governance Check to Owner</button><details><summary>View Historical Governance Information</summary>{history.length ? history.map((item) => <p key={item.id}>{item.assessment_version || "Legacy"} · {item.overall_score ?? "—"}% · {new Date(item.assessed_at).toLocaleString()}</p>) : <p>No historical assessment record is available.</p>}</details></div></section> : <>
      <label>Admin notes<textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} /></label><label>Approval conditions<textarea value={form.conditions} onChange={(e) => set("conditions", e.target.value)} /></label>
      <section className="attention-items"><h3>Items Requiring Attention</h3>{attentionItems.length ? attentionItems.map((item) => <article key={item.id}><label className="attention-selector"><input type="checkbox" checked={selectedQuestions.includes(item.id)} onChange={(event) => setSelectedQuestions((current) => event.target.checked ? [...new Set([...current, item.id])] : current.filter((id) => id !== item.id))}/><span>Request Clarification</span></label><small>{item.category}</small><h4>{item.statement}</h4><dl><div><dt>Owner response</dt><dd>{item.response}</dd></div><div><dt>Owner explanation</dt><dd>{item.explanation}</dd></div><div><dt>Risk contribution</dt><dd>{item.points}</dd></div><div><dt>Required or recommended action</dt><dd>{item.action}</dd></div></dl></article>) : <p>No clarification is currently required.</p>}</section>
      <label>Add a custom clarification question<input value={customQuestion} onChange={(event) => setCustomQuestion(event.target.value)} placeholder="Ask about a specific unresolved concern" /></label><label>Clarification instructions<textarea value={form.clarification} onChange={(e) => set("clarification", e.target.value)} /></label><label>Response deadline<input type="date" value={form.deadline} onChange={(e) => set("deadline", e.target.value)} /></label><div><button disabled={busy || !changesAllowed || (!selectedQuestions.length && !customQuestion.trim())} onClick={requestClarification}>Request Clarification</button><button disabled={busy || !ai.configured || !assessment || !agent.governance_flagged} onClick={runAI}>Run AI-Assisted Assessment</button><button disabled={busy || !changesAllowed} onClick={() => decide("request_changes")}>Request Changes</button><button disabled={busy || !decisionAllowed} onClick={() => decide("rejected")}>Reject</button><button disabled={busy || !decisionAllowed} onClick={() => decide("accepted_residual_risk")}>Accept Residual Risk</button><button disabled={busy || !decisionAllowed} onClick={() => decide("approved_with_conditions")}>Approve With Conditions</button><button className="primary" disabled={busy || !decisionAllowed} onClick={() => decide("approved")}>Approve</button></div>{!ai.loading && !ai.configured && <p className="field-help">AI-assisted assessment is not configured. This optional advisory action does not affect the deterministic score or prevent saving.</p>}</>}
    </div> : clarifications.filter((item) => item.status === "open").map((item) => <OwnerClarification key={item.id} item={item} user={user} reload={reload} notify={notify} />)}
  </article>;
}
function OwnerClarification({ item, user, reload, notify }) {
  const [response, setResponse] = useState("");
  async function send() { const { error } = await supabase.rpc("respond_governance_clarification", { target_clarification: item.id, target_response: response }); if (error) return notify("We could not send your clarification response. Confirm that you are the accountable owner and try again."); notify("Clarification response sent."); await reload(); }
  return <div className="clarification-response"><b>{item.instructions}</b>{item.due_at && <small>Due {new Date(item.due_at).toLocaleDateString()}</small>}<textarea value={response} onChange={(e) => setResponse(e.target.value)} placeholder="Provide evidence and context."/><button className="primary" onClick={send}>Send response</button></div>;
}
function Advisory({ item, recommendations, admin, reload, notify }) {
  const comparison = item.output?.comparison;
  return <div className="advisory-view"><div className="advisory-guardrail">AI-generated recommendations are advisory and require review by an authorized Admin. They do not constitute legal, regulatory, privacy, security, or compliance certification.</div><h3>{item.executive_summary}</h3><p><b>Advisory score:</b> {item.advisory_score ?? "—"}% · <b>Advisory risk:</b> {item.advisory_risk || "—"} · <b>Residual risk:</b> {item.output?.residual_risk || "—"} · <b>Recommended decision:</b> {item.recommended_decision || "—"}</p>{["concerns","evidence","missing_information","clarification_questions"].map((key) => item.output?.[key]?.length ? <section key={key}><h4>{key.replaceAll("_", " ")}</h4><ul>{item.output[key].map((value, index) => <li key={`${key}-${index}`}>{typeof value === "string" ? value : JSON.stringify(value)}</li>)}</ul></section> : null)}{comparison && <><h4>Reassessment comparison</h4><div className="category-score-grid">{["resolved","reduced","unchanged","new"].map((key) => <span key={key}><b>{key}</b>{comparison[key]?.length || 0}</span>)}</div></>}{recommendations.map((recommendation) => <Remediation key={recommendation.id} item={recommendation} admin={admin} reload={reload} notify={notify} />)}</div>;
}
function Remediation({ item, admin, reload, notify }) {
  const [form, setForm] = useState({ owner_decision: item.owner_decision || "", owner_response: item.owner_response || "", action_owner: item.action_owner || "", target_date: item.target_date || "", status: item.status, evidence: item.evidence || "", admin_notes: item.admin_notes || "" });
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  async function save(verify = false) { const { error } = await supabase.rpc("update_governance_recommendation", { target_recommendation: item.id, target_owner_decision: form.owner_decision || null, target_owner_response: form.owner_response || null, target_action_owner: form.action_owner || null, target_due_date: form.target_date || null, target_status: form.status, target_evidence: form.evidence || null, target_admin_notes: admin ? form.admin_notes || null : null, target_verify: Boolean(admin && verify) }); if (error) return notify("We could not update this remediation item. Confirm your access and try again."); notify(verify ? "Recommendation verified and closed by Admin." : "Remediation item updated."); await reload(); }
  return <div className="recommendation"><header><b>{item.priority}</b><span>{item.category} · {item.plan_phase}</span></header><h4>{item.concern}</h4><p>{item.recommended_action}</p><small>{item.impact} · Evidence: {item.evidence_required || "Not specified"} · Expected improvement: {item.expected_score_improvement || 0} points</small><div><select value={form.owner_decision} onChange={(e) => set("owner_decision", e.target.value)}><option value="">Accept or dispute</option><option value="accepted">Accept</option><option value="disputed">Dispute</option></select><select value={form.status} onChange={(e) => set("status", e.target.value)}>{["Not Started","In Progress","Completed","Accepted Risk","Not Applicable","Awaiting Verification"].map((status) => <option key={status}>{status}</option>)}</select><input value={form.action_owner} onChange={(e) => set("action_owner", e.target.value)} placeholder="Action owner"/><input type="date" value={form.target_date} onChange={(e) => set("target_date", e.target.value)}/><textarea value={form.owner_response} onChange={(e) => set("owner_response", e.target.value)} placeholder="Owner response"/><textarea value={form.evidence} onChange={(e) => set("evidence", e.target.value)} placeholder="Evidence or link"/>{admin && <textarea value={form.admin_notes} onChange={(e) => set("admin_notes", e.target.value)} placeholder="Admin verification or residual-risk note"/>}<button onClick={() => save(false)}>Save remediation</button>{admin && <button className="primary" onClick={() => save(true)}>Verify & close</button>}</div></div>;
}
function LegacyGovernance({ agents, admin, review, retry }) {
  const flagged = agents.filter((agent) => agent.governance_flagged);
  const pending = agents.filter((agent) => agent.governance_status === "assessment_pending");
  return (
    <>
      <PageHead
        tag="RESPONSIBLE AI"
        title="AI Governance"
        desc="Automated screening across fairness, privacy, accuracy, safety, transparency, and security. Only meaningful risk is flagged."
      />
      {admin && pending.length > 0 && (
        <section className="assessment-alerts" aria-label="Pending governance assessments">
          <div><b>Assessment attention needed</b><span>{pending.length} saved resource{pending.length === 1 ? " is" : "s are"} waiting for an AI assessment.</span></div>
          {pending.map((agent) => <button key={agent.id} onClick={() => retry(agent)}>Retry {agent.name}</button>)}
        </section>
      )}
      {flagged.length === 0 ? (
        <Empty
          title="No governance risks flagged"
          text="Registered agents, skillsets, and platforms have either cleared the automated assessment or have not yet been evaluated."
        />
      ) : (
        <div className="governance-flags">
          {flagged.map((agent) => (
            <article key={agent.id}>
              <header>
                <div>
                  <small>{agent.entry_type || "agent"} · {agent.companies?.name || "Unassigned company"}</small>
                  <h2>{agent.name}</h2>
                </div>
                <span className="risk-flag">⚑ {agent.risk_level} risk</span>
              </header>
              <dl>
                <div><dt>Accountable owner</dt><dd>{agent.owner_name || "Unassigned"}</dd></div>
                <div><dt>Governance score</dt><dd>{agent.governance_score ?? "—"}{agent.governance_score != null ? "%" : ""}</dd></div>
                <div><dt>AI provider</dt><dd>{agent.governance_provider || "Automated assessment"}</dd></div>
                <div><dt>Date assessed</dt><dd>{agent.governance_checked_at ? new Date(agent.governance_checked_at).toLocaleDateString() : "Pending"}</dd></div>
                <div><dt>Review status</dt><dd><Pill text={agent.governance_status || "governance_review"} /></dd></div>
              </dl>
              <section><h3>Governance summary</h3><p>{agent.governance_summary || "Admin review is required before publication."}</p></section>
              <footer>
                {admin && <button className="primary" onClick={review}>Review Resource</button>}
                {agent.url && <a className="open-resource" href={agent.url} target="_blank" rel="noreferrer">Open Resource ↗</a>}
              </footer>
            </article>
          ))}
        </div>
      )}
      <section className="standard">
        <h2>Lead Ventures Resource Standard</h2>
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
function Companies({ rows, agents, admin, open, edit }) {
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
                <button className="company-edit" onClick={() => edit(c)}>Edit company</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
function CompanyForm({ user, company, close, saved }) {
  const [form, setForm] = useState({
      name: company?.name || "",
      description: company?.description || "",
      website: company?.website || "",
      status: company?.status || "active",
    }),
    [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    const values = { ...form, website: form.website || null };
    const { error } = company
      ? await supabase.from("companies").update(values).eq("id", company.id)
      : await supabase.from("companies").insert({ ...values, created_by: user.id });
    if (error) {
      console.error("Company save failed", error);
      setError("We could not save this company. Confirm your Admin access and try again.");
    }
    else saved();
  }
  return (
    <div className="backdrop">
      <form className="modal compact" onSubmit={submit}>
        <header>
          <div>
            <small>ADMINISTRATION</small>
            <h2>{company ? "Edit company" : "Add a company"}</h2>
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
        <label>
          Status
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        {error && <div className="message">{error}</div>}
        <footer>
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button className="primary">{company ? "Save company" : "Add company"}</button>
        </footer>
      </form>
    </div>
  );
}
function accessTiming(row) {
  const now = Date.now();
  if (row.access_effective_at && new Date(row.access_effective_at).getTime() > now)
    return "scheduled";
  if (row.access_expires_at && new Date(row.access_expires_at).getTime() < now)
    return "expired";
  return "active";
}
function AccessManagement({
  rows,
  users,
  companies,
  userAccess,
  companyAccess,
  audit,
  edit,
}) {
  const [search, setSearch] = useState(""),
    [filters, setFilters] = useState({
      company: "all", user: "all", role: "all", entryType: "all",
      scope: "all", permission: "all", timing: "all",
    });
  const query = search.trim().toLowerCase();
  function setFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }
  const visible = rows.filter((row) => {
    const people = userAccess.filter((item) => item.agent_id === row.id);
    const audiences = companyAccess.filter((item) => item.agent_id === row.id);
    const assignedUsers = people.map((item) => users.find((user) => user.id === item.user_id)).filter(Boolean);
    const searchable = [
      row.name,
      row.owner_name,
      ...assignedUsers.flatMap((user) => [user.full_name, user.email]),
      ...audiences.map((item) => companies.find((company) => company.id === item.company_id)?.name),
    ].filter(Boolean).join(" ").toLowerCase();
    return (
      (!query || searchable.includes(query)) &&
      (filters.company === "all" || row.company_id === filters.company || audiences.some((item) => item.company_id === filters.company)) &&
      (filters.user === "all" || row.accountable_owner_id === filters.user || people.some((item) => item.user_id === filters.user)) &&
      (filters.role === "all" ||
        assignedUsers.some((user) => user.role === filters.role) ||
        users.find((user) => user.id === row.accountable_owner_id)?.role === filters.role) &&
      (filters.entryType === "all" || row.entry_type === filters.entryType) &&
      (filters.scope === "all" || row.access_scope === filters.scope) &&
      (filters.permission === "all" || row.access_permission === filters.permission || people.some((item) => item.permission_level === filters.permission) || audiences.some((item) => item.permission_level === filters.permission)) &&
      (filters.timing === "all" || accessTiming(row) === filters.timing)
    );
  });
  return (
    <>
      <PageHead
        tag="ADMINISTRATION"
        title="Access Management"
        desc="Control repository discovery and usage for every agent, skillset, and platform."
      />
      <div className="external-access-banner">
        <b>Registry access is separate from platform access.</b>
        Access granted in this repository does not automatically configure permissions in the external AI platform. Confirm external platform access separately.
      </div>
      <div className="resource-filters access-filters">
        <label className="resource-search">Search<input type="search" placeholder="Resource, user, owner, or company" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        <ResourceFilter label="Company" value={filters.company} onChange={(value) => setFilter("company", value)} options={companies.map((row) => [row.id, row.name])} />
        <ResourceFilter label="User" value={filters.user} onChange={(value) => setFilter("user", value)} options={users.map((row) => [row.id, row.full_name || row.email])} />
        <ResourceFilter label="Role" value={filters.role} onChange={(value) => setFilter("role", value)} options={[["admin", "Admin"], ["editor", "Editor"], ["viewer", "Viewer"]]} />
        <ResourceFilter label="Type" value={filters.entryType} onChange={(value) => setFilter("entryType", value)} options={[["agent", "Agent"], ["skillset", "Skillset"], ["platform", "Platform"]]} />
        <ResourceFilter label="Scope" value={filters.scope} onChange={(value) => setFilter("scope", value)} options={Object.entries(ACCESS_SCOPE_LABELS)} />
        <ResourceFilter label="Permission" value={filters.permission} onChange={(value) => setFilter("permission", value)} options={[["view", "View"], ["use", "Use"], ["manage", "Manage"]]} />
        <ResourceFilter label="Timing" value={filters.timing} onChange={(value) => setFilter("timing", value)} options={[["active", "Active"], ["expired", "Expired"], ["scheduled", "Scheduled"]]} />
      </div>
      <div className="table access-table">
        <table>
          <thead><tr><th>Resource</th><th>Scope</th><th>People</th><th>Companies</th><th>Permission</th><th>Timing</th><th>Last changed</th><th>Action</th></tr></thead>
          <tbody>
            {visible.map((row) => {
              const people = userAccess.filter((item) => item.agent_id === row.id);
              const audiences = companyAccess.filter((item) => item.agent_id === row.id);
              const latest = audit.find((item) => item.entity_id === row.id);
              const timing = accessTiming(row);
              const expiresSoon = row.access_expires_at && new Date(row.access_expires_at).getTime() >= Date.now() && new Date(row.access_expires_at).getTime() <= Date.now() + 30 * 86400000;
              const actor = users.find((user) => user.id === latest?.actor_id);
              return (
                <tr key={row.id}>
                  <td><b>{row.name}</b><small>{row.entry_type || "agent"} · {row.companies?.name || "Unassigned"}</small></td>
                  <td>{ACCESS_SCOPE_LABELS[row.access_scope] || "Admins Only"}</td>
                  <td>{people.length ? people.map((item) => users.find((user) => user.id === item.user_id)?.full_name || users.find((user) => user.id === item.user_id)?.email).filter(Boolean).join(", ") : "—"}</td>
                  <td>{audiences.length ? audiences.map((item) => companies.find((company) => company.id === item.company_id)?.name).filter(Boolean).join(", ") : "—"}</td>
                  <td>{row.access_permission || "view"}</td>
                  <td><Pill text={timing} />{expiresSoon && <small>Expires within 30 days</small>}{row.access_expires_at && <small>{new Date(row.access_expires_at).toLocaleDateString()}</small>}</td>
                  <td>{latest ? <>{actor?.full_name || actor?.email || "Admin"}<small>{new Date(latest.created_at).toLocaleString()}</small></> : "No recorded change"}</td>
                  <td><button onClick={() => edit(row)}>Edit access</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
function TaxonomyAdmin({ departments, categories, user, reload }) {
  return (
    <>
      <PageHead
        tag="ADMINISTRATION"
        title="Departments & Categories"
        desc="Manage the active business classifications available during resource registration."
      />
      <div className="taxonomy-grid">
        <TaxonomyList
          title="Departments"
          table="departments"
          rows={departments}
          user={user}
          reload={reload}
        />
        <TaxonomyList
          title="Categories"
          table="categories"
          rows={categories}
          user={user}
          reload={reload}
        />
      </div>
    </>
  );
}
function TaxonomyList({ title, table, rows, user, reload }) {
  const [name, setName] = useState(""),
    [editing, setEditing] = useState(null),
    [message, setMessage] = useState("");
  const singular = table === "categories" ? "Category" : "Department";
  async function save(e) {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return;
    setMessage("");
    const request = editing
      ? supabase.from(table).update({ name: cleanName }).eq("id", editing.id)
      : supabase
          .from(table)
          .insert({ name: cleanName, status: "active", created_by: user.id });
    const { error } = await request;
    if (error) return setMessage(error.code === "23505" ? `${singular} already exists.` : error.message);
    setName("");
    setEditing(null);
    setMessage(editing ? "Name updated." : `${singular} added.`);
    await reload();
  }
  async function toggle(row) {
    setMessage("");
    const status = row.status === "active" ? "inactive" : "active";
    const { error } = await supabase.from(table).update({ status }).eq("id", row.id);
    setMessage(error ? error.message : `${row.name} ${status === "active" ? "activated" : "deactivated"}.`);
    if (!error) await reload();
  }
  return (
    <section className="taxonomy-panel">
      <header>
        <h2>{title}</h2>
        <span>{rows.filter((row) => row.status === "active").length} active</span>
      </header>
      <form onSubmit={save}>
        <label>
          {editing ? `Edit ${singular.toLowerCase()}` : `Add ${singular.toLowerCase()}`}
          <input required value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button className="primary">{editing ? "Save" : "Add"}</button>
        {editing && (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setName("");
            }}
          >
            Cancel
          </button>
        )}
      </form>
      {message && <div className="message">{message}</div>}
      <div className="taxonomy-rows">
        {rows.map((row) => (
          <div key={row.id}>
            <span>
              <b>{row.name}</b>
              <Pill text={row.status} />
            </span>
            <span>
              <button
                onClick={() => {
                  setEditing(row);
                  setName(row.name);
                }}
              >
                Edit
              </button>
              <button onClick={() => toggle(row)}>
                {row.status === "active" ? "Deactivate" : "Activate"}
              </button>
            </span>
          </div>
        ))}
      </div>
    </section>
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
  const [reviewThreshold, setReviewThreshold] = useState(DEFAULT_REVIEW_THRESHOLD);
  const [message, setMessage] = useState("");
  useEffect(() => {
    supabase.from("app_settings").select("setting_key,setting_value").then(({ data }) => {
      const values = Object.fromEntries((data || []).map((x) => [x.setting_key, x.setting_value]));
      const selected = values.governance_provider || "anthropic";
      setProvider(selected);
      setModel(values.governance_model || defaults[selected]);
      setReviewThreshold(Number(values.governance_review_threshold || DEFAULT_REVIEW_THRESHOLD));
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
      { setting_key: "governance_review_threshold", setting_value: String(reviewThreshold), updated_by: user.id, updated_at: new Date().toISOString() },
    ]);
    setMessage(error ? error.message : "Optional AI advisory provider saved.");
  }
  return (
    <>
      <PageHead tag="ADMINISTRATION" title="AI & Governance Settings" desc="Set the future-assessment review threshold and optionally configure advisory AI. Previous assessments keep the threshold and decision used at the time." />
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
        <label className="full">Admin-review threshold
          <input type="number" min="0" max="100" step="1" required value={reviewThreshold} onChange={(e) => setReviewThreshold(Math.round(Math.max(0, Math.min(100, Number(e.target.value)))))} />
          <span className="field-help">Future assessments scoring at or above this percentage enter Admin review. Default: 40%. Existing decisions do not change until reassessment.</span>
        </label>
        <div className="secret-note">
          <b>API Key Location</b>
          <p>Add the corresponding secret in Netlify → Project configuration → Environment variables: <code>{provider === "anthropic" ? "ANTHROPIC_API_KEY" : provider === "openai" ? "OPENAI_API_KEY" : "GEMINI_API_KEY"}</code>.</p>
          <p>Keys are intentionally never entered or displayed in this application. Official scoring, overrides, routing, and review remain available without one.</p>
        </div>
        {message && <div className="message">{message}</div>}
        <button className="primary">Save Governance Settings</button>
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
    alt="Lead Ventures Agents & Platform Repository"
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
      text: "The Dashboard focuses on approved resources available to you, totals by resource type, company distribution, accountable ownership, and recently added resources—not access-administration metrics.",
    },
    {
      view: "agents",
      eyebrow: "OPEN CREATION",
      title: "Add a Resource",
      text:
        role === "viewer"
          ? "You can inspect registered agents, reusable skillsets, approved platforms, ownership, access, and governance status."
          : "Choose Agent, Skillset, or Platform. Editors and Admins receive field-level guidance, an editable suggested name, and their own name as the default accountable owner.",
    },
    {
      view: "my-agents",
      eyebrow: "PERSONALIZED ACCESS",
      title: "Your available AI resources",
      text: "My Agents & Platforms contains resources available to you based on your role, ownership, and explicit access assignments. Availability does not create a license or user account in an external platform; follow its access instructions.",
    },
    {
      view: "agents",
      eyebrow: "SOURCE OF TRUTH",
      title: "Agents & Platform Directory",
      text: "Use Columns to choose the fields shown in your directory; the preference follows your user profile with a browser fallback. Resource descriptions stay compact, and mobile screens use cards with the essential actions.",
    },
    {
      view: "governance",
      eyebrow: "DETERMINISTIC GOVERNANCE",
      title: "Score every resource consistently",
      text: "Resource owners complete the Governance Check using plain-language Likert statements. Higher percentages mean greater risk. The default review threshold is 40%, every resource is saved, and only elevated-risk exceptions go to Admin review. Legacy resources must be sent to their owner for a current assessment.",
    },
    {
      view: "approvals",
      eyebrow: "RISK-BASED REVIEW",
      title: "Review only what needs attention",
      text: "Admins see only unresolved Items Requiring Attention, can request clarification, and can record valid review decisions. Optional AI assistance is Admin-initiated and advisory; it never changes the official deterministic result.",
    },
    ...(role === "admin"
      ? [
          {
            view: "users",
            eyebrow: "ADMIN NAVIGATION",
            title: "Expand the Admin section",
            text: "Admins can expand or collapse one organized navigation section containing Users & Access, Companies, Departments & Categories, Access Management, and AI & Governance Settings. The default review threshold is 40% and affects future assessments only.",
          },
          {
            view: "users",
            eyebrow: "ADMIN VIEW",
            title: "Manage users and access",
            text: "Only Admins see the user-access area. Assign each person to a company and change their role to Admin, Editor, or Viewer.",
          },
          {
            view: "companies",
            eyebrow: "TENANT MANAGEMENT",
            title: "Add Lead Ventures companies",
            text: "Create each company under the Lead Ventures tenant. Resources and users can be assigned and filtered by company without making company assignment an access restriction.",
          },
          {
            view: "taxonomy",
            eyebrow: "CONSISTENT CLASSIFICATION",
            title: "Manage departments and categories",
            text: "Add, rename, activate, or deactivate the department and category choices used in resource registration. Existing values remain preserved.",
          },
          {
            view: "access",
            eyebrow: "RESOURCE ACCESS",
            title: "Control discovery and use",
            text: "Access Management allows you to make a resource available to the entire team, all Admins, selected companies, or specific people. External platform permissions must still be confirmed separately.",
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
      aria-label="Agents and Platform Repository tour"
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
