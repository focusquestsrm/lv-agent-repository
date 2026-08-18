# The Hub – Powering Lead Ventures

A production-oriented Netlify + Supabase application and centralized source of truth for Lead Ventures Agents, Skillsets, Platforms, Products, operational lifecycles, governance, stewardship, duplicate review, and access.

> The agents, skillsets, platforms, lifecycle maps, and related information contained in The Hub are proprietary to and owned by Lead Ventures. Access and use are limited to authorized users.

This package contains no demonstration records. `danielle@focusquest.com` and the first person who creates an account become administrators; every later account starts as an editor.

## Included

- Email/password authentication
- Self-service account creation and password recovery
- Direct creation of Agents, Skillsets, Platforms, and Products by Admins and Editors
- Deterministic Start Here classification guidance without an external AI API
- Lead Ventures Product Suite with card/table views, filters, comparisons, and a relationship map
- Flexible database-driven linear, circular, phased, nested, and hybrid operational lifecycles
- FocusQuest and D9 Network optional starter templates derived from the supplied references (the reference HTML is never served)
- Lifecycle versioning, archival/restoration, safe mapped-stage deletion, access management, and graphical/list views
- Deterministic URL/keyword duplicate detection and a separate Potential Duplicates queue
- Company Stewardship verification, creator attribution, hosting/admin control, integrations, and review dates
- Admin-managed Lead Ventures companies
- Admin-managed departments and categories with active/inactive controls
- Personalized **My Resources** discovery
- Platform vendor, license, access-request, support, data-restriction, approved/prohibited-use, and renewal details
- Admin-controlled owner, individual, company, Admin-only, and team-wide resource access
- Effective and expiration dates with access audit history
- Editable suggested entry names and default accountable ownership
- Field-level registration guidance
- Required company selection during agent intake
- Company assignment for users
- Portfolio dashboard for agents, skillsets, platforms, companies, departments, categories, access scopes, owners, renewals, risk, and governance
- Deterministic, versioned governance questionnaire with category-weighted scoring and mandatory risk overrides
- Optional Admin-initiated AI advisory through Anthropic Claude, OpenAI, or Google Gemini; official scores and decisions never depend on AI
- Risk-based escalation: only medium, high, or critical results are flagged
- Per-user appearance choice: Dark or Light
- Immutable prompt-version records
- Two-person approval control: authors cannot approve their own change
- Governance categories for fairness, privacy, accuracy, safety, transparency, and security
- Admin, Editor, and Viewer database permissions
- User-role administration
- Supabase Row Level Security
- Netlify SPA routing and serverless invitation and governance endpoints
- Official Lead Ventures branding
- Role-aware guided product tour for first-time users

## 1. Create Supabase

1. Create a Supabase project.
2. Open **SQL Editor**, paste `supabase/schema.sql`, and run it once.
3. If `schema.sql` completed successfully, run migrations `006` through `024` in numeric order, except `004` and `005`. The newest Hub migrations must run in this order: `018_hub_resource_stewardship.sql`, `019_operational_lifecycles.sql`, `020_lifecycle_security_templates.sql`, `021_product_suite.sql`, `022_resource_department_access.sql`, `023_start_here_assessment_workflow.sql`, then `024_operational_lifecycle_builder.sql`.
4. Under **Authentication → URL Configuration**, add your Netlify production URL and local URL (`http://localhost:5173`) as allowed redirect URLs.
5. Under **Authentication → Providers → Email**, enable email/password. Decide whether your team must confirm email addresses.
6. Copy the Project URL and anonymous/public key from **Project Settings → API**.

The service-role key must never be placed in a browser variable, committed, or prefixed with `VITE_`.

## 2. Run locally

```bash
cp .env.example .env
npm install
npm run dev
```

Fill `.env` with:

```text
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
ANTHROPIC_API_KEY=your_anthropic_api_key
ANTHROPIC_MODEL=claude-sonnet-4-20250514
OPENAI_API_KEY=your_openai_api_key
GEMINI_API_KEY=your_gemini_api_key
```

The service-role and Anthropic variables are server-only. Never prefix them with `VITE_`. When using plain `vite`, Netlify functions are unavailable; use Netlify local development to test invitations and governance screening.

## 3. Deploy to Netlify

1. Push this folder to a private Git repository.
2. In Netlify, choose **Add new project → Import an existing project**.
3. Netlify will use `npm run build` and publish `dist` from `netlify.toml`.
4. Add these environment variables in **Project configuration → Environment variables**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` — scope to Functions when your Netlify plan supports scopes
   - `ANTHROPIC_API_KEY` — optional server-only AI advisory key
   - `ANTHROPIC_MODEL` — optional model override
   - `OPENAI_API_KEY` — required only when OpenAI is selected
   - `GEMINI_API_KEY` — required only when Google Gemini is selected
5. Deploy the site.
6. Return to Supabase and add the final Netlify URL to Authentication redirect URLs.

## 4. Create the first administrator

Use **Join workspace** in the deployed application. The database trigger assigns `danielle@focusquest.com` and the first registered account the `admin` role. Sign out and back in if the role does not appear immediately.

If you already ran the original schema, run these migrations in order in the Supabase SQL Editor:

1. `supabase/migrations/002_self_service_auth.sql`
2. `supabase/migrations/003_companies_dashboard.sql`
3. `supabase/migrations/006_open_creation_governance_scan.sql`
4. `supabase/migrations/007_sync_users_and_admins.sql`
5. `supabase/migrations/008_ai_provider_settings.sql`
6. `supabase/migrations/009_departments_and_categories.sql`
7. `supabase/migrations/010_agent_access_control.sql`
8. `supabase/migrations/011_platform_resources.sql`
9. `supabase/migrations/012_agent_technical_fields.sql`
10. `supabase/migrations/013_resource_insert_policy.sql`
11. `supabase/migrations/014_governance_workflow_and_prompt_reviews.sql`
12. `supabase/migrations/015_deterministic_governance_and_advisory.sql`
13. `supabase/migrations/016_likert_risk_scoring_and_threshold.sql`
14. `supabase/migrations/017_directory_preferences_and_governance_followup.sql`
15. `supabase/migrations/018_hub_resource_stewardship.sql`
16. `supabase/migrations/019_operational_lifecycles.sql`
17. `supabase/migrations/020_lifecycle_security_templates.sql`
18. `supabase/migrations/021_product_suite.sql`
19. `supabase/migrations/022_resource_department_access.sql`
20. `supabase/migrations/023_start_here_assessment_workflow.sql`
21. `supabase/migrations/024_operational_lifecycle_builder.sql`

Do not rerun `schema.sql` on an existing installation. Migrations 004 and 005 are intentionally skipped. After migration 003, open **Companies** as an Admin and add each company under the Lead Ventures tenant. Existing resources and users can then be assigned to the appropriate company. Company assignment supports organization and filtering; it does not restrict resource access unless an Admin explicitly chooses **Selected Companies**. The directory includes a company dropdown, including companies that do not yet have a resource.

Migration 006 retires the pre-build authorization workflow from the live application. Existing request data remains in the database for audit history, but users create agents and skillsets directly. Each new entry must complete the governance API screening. Low-risk entries are cleared automatically; only medium, high, or critical results are flagged.

Migration 007 backfills `public.profiles` from existing Supabase Authentication users and repairs the signup trigger for future accounts. It also grants Admin access to Danielle, Sean (`sean@focusquest.com`), Eliana (`eliana@lead-ventures.com`), and Mariano (`mcarcamo@back2learn.com`). You can change any person between Admin, Editor, and Viewer from **Admin → Users & Access**.

The **Users & Access** page also reconciles Authentication users with access profiles whenever an administrator opens it. This server-side repair requires `SUPABASE_SERVICE_ROLE_KEY` in Netlify and preserves existing roles and company assignments.

Migration 008 introduced provider settings now located under **Admin → AI Settings**. Choose Anthropic Claude, OpenAI (ChatGPT), or Google Gemini only for optional Admin-initiated advisory assessments. Add the matching API key in Netlify environment variables; keys are never stored in Supabase or exposed to the browser.

Migration 009 adds managed departments and categories. It imports distinct department and category text from existing agents without modifying those records, prevents case-insensitive duplicate names, and seeds these default categories: Customer Service; Marketing and Content; Sales and Lead Generation; Data and Analytics; Research; Process Automation; Finance; Human Resources; Compliance and Risk; Education and Student Support; Software Development; and General Productivity. Run this migration in Supabase before deploying the matching application update. Admins manage all values from **Admin → Departments & Categories**; inactive values remain visible to Admins but cannot be selected for new entries.

Migration 010 adds personalized resource access and must be run before deploying the matching application update. Existing agents and skillsets are preserved and default to **Admins Only**. It adds accountable-owner references, timed user/company assignments, case-safe constraints, indexes, RLS enforcement, inherited prompt/governance visibility, and audit triggers. Editor-created resources are forced to **Owner Only** until an Admin changes access. Admins manage assignments from **Admin → Access Management**. The migration is compatible with installations that skipped the retired migrations 004 and 005; it configures `approval_assignments` only when that legacy table exists.

Migration 011 safely expands the existing resource-type constraint to include **Platform** and creates the relational `platform_details` table. Existing agents and skillsets are unchanged. Platform details inherit the parent resource’s Row Level Security rules, including owner, Admin, individual, company, and team access. Run migration 011 after migration 010 because its policies use the access functions introduced there.

Migration 012 restores the four technical assessment columns used by the current resource form: `uses_database`, `uses_api`, `uses_sensitive_data`, and `crosses_departments`. They originally appeared only in retired migration 004, which existing installations correctly skip. The migration is idempotent, preserves all records, and refreshes the Supabase API schema cache.

Migration 013 corrects the resource-creation RLS policy. Admins and Editors may create only records attributed to their authenticated user ID. The migration 010 trigger continues forcing every Editor-created resource to **Owner Only**, with that Editor as accountable owner, until an Admin changes access.

Migration 014 introduces the durable governance workflow and auditable prompt-review decisions. It adds the `assessment_pending`, `cleared`, and `governance_review` workflow values without recreating the enum; backfills preserved governance results; keeps pending or flagged resources private from general audiences; creates `prompt_review_decisions`; corrects Admin prompt-version update policies; enforces two-person approval; and records approval/change-request decisions in the audit log. Run it once after migration 013 and never rerun `schema.sql` on an existing project.

Migration 015 replaces provider-dependent submission screening with the official deterministic Governance Readiness Assessment. It preserves every assessment version, category score, answer and explanation, initial risk, final risk, mandatory override, clarification, Admin decision, optional AI advisory, and remediation item. It also adds owner-response and Admin-only decision policies. Run it once after migration 014; do not rerun `schema.sql`.

Migration 016 introduces the employee-facing, plain-language Likert assessment and changes the official score to risk points, where higher percentages mean greater risk. It adds a configurable future-assessment review threshold, stores the threshold and score direction with each assessment, and keeps previous decisions unchanged. Run it once after migration 015.

Migration 017 stores per-user Directory columns with a local-storage fallback, owner assessment drafts, requests and deadlines for current owner-completed Governance Checks, and issue-focused review records. It adds indexes, owner/Admin RLS, an Admin-only request function, and automatically closes a pending owner request when the current Likert assessment is submitted. Run it once after migration 016.

Migrations 018–022 implement The Hub resource metadata, Company Stewardship, deterministic classifications and duplicate records, company lifecycle graphs and RLS, lifecycle templates/versioning/safe deletion, Product as a fourth resource type, cycle-safe Product architecture, and department-scoped access. They are additive and idempotent. Lifecycle absence, standalone Product status, and unevaluated alignment never change the governance score or independently route a resource into governance review.

Migration 023 adds the separate, auditable Start Here workflow. It stores structured assessment answers and rule versions, resumable resource-registration drafts, links submitted resources back to both records, and creates nonblocking Platform or Product Initiative awareness notifications for Sean and Danielle. Owner and tenant-Admin RLS policies protect assessments and drafts; the security-definer conversion function verifies ownership before creating a draft. Run migration 023 after migration 022 and before deploying the matching frontend.

Migration 024 replaces the user-facing lifecycle-template workflow with direct lifecycle creation and a canvas-first administrative builder. It preserves lifecycle records and mappings, translates the legacy `active` status to `published`, retains an incomplete one-stage FocusQuest record as a draft, stores node positions and richer phase/stage/connection fields, copies mappings and access rules during versioning, and adds tenant-aware lifecycle RLS. The frontend uses `@xyflow/react` for the diagram canvas and `@dagrejs/dagre` for deterministic auto-layout. Optional lifecycle suggestions reuse the configured governance provider and its existing `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GEMINI_API_KEY`; no new environment variable is required, and the manual builder remains fully functional without one.

## Operational lifecycle administration

Admins can start blank or use the optional FocusQuest/D9 templates, customize phases and stages, add parent stages and feedback connections, preview the generated graph or accessible list, publish, create a new version, archive, and restore. Lifecycle access is enforced in Supabase RLS for Admins only, the entire tenant, the lifecycle company, selected departments, or selected individuals. Active Admins—including Sean and Danielle while their profiles retain that role—always have access.

The reference files under `reference/lifecycles/` are design/data-model references only. They are not copied into `dist`, routed, embedded, or served by the application.

## Product Suite and lifecycle independence

Product is a first-class resource type. Product-suite membership, lifecycle alignment, and governance risk are separate concepts. Products may be mapped to stages, support multiple stages, support a company generally, stand alone as a Lead Ventures Product, be not applicable, or remain not yet evaluated. Only deterministic governance answers and mandatory safeguards affect governance routing.

## Company export and portability

Supabase Admins can export company-scoped records from the Table Editor or SQL using `company_id`, then include linked rows from `resource_companies`, `operational_lifecycles`, phases, stages, connections, viewers, mappings, and Product relationships. UUID relationships and explicit company ownership keep each company logically separable while allowing approved cross-company connections.

## Authentication email templates

Supabase owns authentication templates rather than this repository. In **Authentication → Email Templates**, update the sender name and subject/body copy to **The Hub – Powering Lead Ventures** for confirmation, invitation, magic-link, email-change, and password-recovery messages. Keep the generated confirmation URL token unchanged.

Resource submissions are always saved. Stronger governance controls produce fewer risk points: Strongly Agree = 0, Agree = 25, Not Sure = 50, Disagree = 75, and Strongly Disagree = 100. A justified Not Applicable response is excluded. Category risk is calculated before weights are applied. Scores of 0–19 are Low, 20–39 Moderate-Low, 40–59 Medium, 60–79 High, and 80–100 Critical. The default Admin-review threshold is 40%; Admins may change it under **Admin → AI & Governance Settings** for future assessments. Missing information produces **Assessment Pending**, and mandatory safeguards trigger review independently of the score.

Repository access controls visibility of resource records, prompts, URLs, platform details, and governance information. Availability in this repository does not automatically create a license or user account in an external platform. Follow the listed access instructions or contact the designated administrator.

The sign-in screen also includes **Forgot your password?**. It sends a Supabase recovery email back to the application, where the user chooses and confirms a new password.

For security, disable open sign-ups in Supabase after the first administrator is created if accounts should only be invitation-based. The administrator invitation function is available at `/api/invite-user` for connection to the Users screen.

## Permission model

| Capability | Admin | Editor | Viewer |
|---|:---:|:---:|:---:|
| View agents, prompts, governance, and history | ✓ | ✓ | ✓ |
| Add or edit Agents, Skillsets, Platforms, Products, and prompt versions | ✓ | ✓ | — |
| Manage operational lifecycles, access, templates, and versions | ✓ | — | — |
| Manage Product architecture and Potential Duplicates | ✓ | — | — |
| Create governance assessment records | ✓ | ✓ | — |
| Approve and publish another person’s prompt | ✓ | — | — |
| Change user roles and company assignments | ✓ | — | — |
| Add and manage companies | ✓ | — | — |
| Add, edit, activate, or deactivate departments and categories | ✓ | — | — |
| Manage resource access scopes, assignments, dates, and permissions | ✓ | — | — |
| Archive, restore, or permanently delete resources | ✓ | — | — |

## Guided tour

The tour opens automatically the first time a person enters the repository. It explains that owners complete a plain-language assessment, higher percentages mean greater risk, the default Admin threshold is 40%, lower-risk resources clear automatically, and mandatory safeguards can still require review. It also covers optional advisory AI, accountable ownership, access, clarification, remediation, and role-specific controls. Completion is stored only in that browser. Users can restart it from **Take a tour**.

Each user can choose **Dark** or **Light** from the Appearance menu. The preference is stored only in that browser and does not affect other users. Dark remains the default.

## Recommended production hardening

- Configure custom SMTP in Supabase before inviting the whole team.
- Require email confirmation and a minimum password policy.
- Disable public sign-up after the first administrator is established.
- Turn on MFA for administrators.
- Add audit-log insert triggers for regulated or higher-risk use cases.
- Keep Supabase and Netlify secrets out of source control.
- Review roles quarterly and remove inactive accounts promptly.

## Governance and optional AI advisory behavior

The official assessment evaluates Privacy and Data, Safety and Human Oversight, Security, Fairness, Accuracy, and Transparency and Accountability without calling an external provider. Four context questions reveal only relevant statements. Every statement includes plain-language help and a labeled Likert scale. The browser calculates the result for immediate feedback, and the database independently verifies it before recording the official version. The same responses, assessment version, and threshold always produce the same result. Mandatory override reasons are stored separately from the numeric risk score.

The Admin governance queue contains only current assessments at or above their stored review threshold, mandatory overrides, incomplete assessments, manual clarification flags, and reassessments requiring attention. Automatically cleared resources appear only in the separate searchable assessment history, which is an audit view rather than an approval queue.

Resource registration and editing use four steps: **Resource Information**, **Access Management**, **Governance Check**, and **Review & Submit**. The accountable owner completes the initial Governance Check; an Admin assigning another person as owner leaves the assessment pending and can send it to that owner with a response deadline. Resources created under an earlier questionnaire retain their historical records and display as **Legacy** until the owner submits the current assessment. Every resource is saved before routing.

The AI Governance page lists only unresolved **Items Requiring Attention**, such as material owner responses, missing explanations, mandatory overrides, Admin-added issues, and optional AI advisory concerns. It does not ask Admins to repeat the full owner questionnaire. AI assistance remains optional, Admin-initiated, advisory, and limited to resources already requiring review.

The Directory **Columns** menu controls which table fields are rendered. Resource is always visible; the default view also includes Type, Company, Owner, Status, Risk, and Actions. Preferences are saved to the user profile when migration 017 is installed and fall back to browser storage. Descriptions are limited to three lines with a complete details view, while small screens use resource cards instead of compressing the desktop table.

Only an active Admin can click **Run AI-Assisted Assessment** for a flagged resource. The server sends sanitized repository metadata and deterministic evidence to the configured provider, validates the structured response, and stores an immutable advisory plus editable remediation tasks. It never updates the official score, final risk, publication status, or access. With no matching server-side API key, the button is disabled and the application displays: “AI-assisted assessment is not configured. The deterministic governance assessment remains available.” Never expose provider keys through a `VITE_` variable.
