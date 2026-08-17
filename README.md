# Lead Ventures Agents & Platform Repository

A production-oriented Netlify + Supabase application for cataloging AI agents, reusable skillsets, and approved platforms; preserving prompt history; screening resources for governance risk; and enforcing Admin/Editor/Viewer access.

This package contains no demonstration records. `danielle@focusquest.com` and the first person who creates an account become administrators; every later account starts as an editor.

## Included

- Email/password authentication
- Self-service account creation and password recovery
- Direct creation of agents, reusable skillsets, and approved platforms by Admins and Editors
- Admin-managed Lead Ventures companies
- Admin-managed departments and categories with active/inactive controls
- Personalized **My Agents & Platforms** discovery
- Platform vendor, license, access-request, support, data-restriction, approved/prohibited-use, and renewal details
- Admin-controlled owner, individual, company, Admin-only, and team-wide resource access
- Effective and expiration dates with access audit history
- Editable suggested entry names and default accountable ownership
- Field-level registration guidance
- Required company selection during agent intake
- Company assignment for users
- Portfolio dashboard for agents, skillsets, platforms, companies, departments, categories, access scopes, owners, renewals, risk, and governance
- Automated governance screening through a server-side AI provider call
- Admin-selectable governance provider: Anthropic Claude, OpenAI, or Google Gemini
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
3. If `schema.sql` completed successfully, run migrations `006`, `007`, `008`, `009`, `010`, and `011` in numeric order. Do not run migrations 004 or 005; those belong to the retired routing and pre-build request workflows.
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
   - `ANTHROPIC_API_KEY` — server-only governance assessment key
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

Do not rerun `schema.sql` on an existing installation. Migrations 004 and 005 are intentionally skipped. After migration 003, open **Companies** as an Admin and add each company under the Lead Ventures tenant. Existing resources and users can then be assigned to the appropriate company. Company assignment supports organization and filtering; it does not restrict resource access unless an Admin explicitly chooses **Selected Companies**. The directory includes a company dropdown, including companies that do not yet have a resource.

Migration 006 retires the pre-build authorization workflow from the live application. Existing request data remains in the database for audit history, but users create agents and skillsets directly. Each new entry must complete the governance API screening. Low-risk entries are cleared automatically; only medium, high, or critical results are flagged.

Migration 007 backfills `public.profiles` from existing Supabase Authentication users and repairs the signup trigger for future accounts. It also grants Admin access to Danielle, Sean (`sean@focusquest.com`), Eliana (`eliana@lead-ventures.com`), and Mariano (`mcarcamo@back2learn.com`). You can change any person between Admin, Editor, and Viewer from **Admin · Users & access**.

The **Users & Access** page also reconciles Authentication users with access profiles whenever an administrator opens it. This server-side repair requires `SUPABASE_SERVICE_ROLE_KEY` in Netlify and preserves existing roles and company assignments.

Migration 008 adds **Admin · AI Settings** and clears legacy low-risk pending prompts from the risk approval queue. In the application, choose Anthropic Claude, OpenAI (ChatGPT), or Google Gemini and enter the model name. Add the matching API key in Netlify environment variables; keys are never stored in Supabase or exposed to the browser.

Migration 009 adds managed departments and categories. It imports distinct department and category text from existing agents without modifying those records, prevents case-insensitive duplicate names, and seeds these default categories: Customer Service; Marketing and Content; Sales and Lead Generation; Data and Analytics; Research; Process Automation; Finance; Human Resources; Compliance and Risk; Education and Student Support; Software Development; and General Productivity. Run this migration in Supabase before deploying the matching application update. Admins manage all values from **Admin · Departments & Categories**; inactive values remain visible to Admins but cannot be selected for new entries.

Migration 010 adds personalized resource access and must be run before deploying the matching application update. Existing agents and skillsets are preserved and default to **Admins Only**. It adds accountable-owner references, timed user/company assignments, case-safe constraints, indexes, RLS enforcement, inherited prompt/governance visibility, and audit triggers. Editor-created resources are forced to **Owner Only** until an Admin changes access. Admins manage assignments from **Admin · Access Management**. The migration is compatible with installations that skipped the retired migrations 004 and 005; it configures `approval_assignments` only when that legacy table exists.

Migration 011 safely expands the existing resource-type constraint to include **Platform** and creates the relational `platform_details` table. Existing agents and skillsets are unchanged. Platform details inherit the parent resource’s Row Level Security rules, including owner, Admin, individual, company, and team access. Run migration 011 after migration 010 because its policies use the access functions introduced there.

Repository access controls visibility of resource records, prompts, URLs, platform details, and governance information. Availability in this repository does not automatically create a license or user account in an external platform. Follow the listed access instructions or contact the designated administrator.

The sign-in screen also includes **Forgot your password?**. It sends a Supabase recovery email back to the application, where the user chooses and confirms a new password.

For security, disable open sign-ups in Supabase after the first administrator is created if accounts should only be invitation-based. The administrator invitation function is available at `/api/invite-user` for connection to the Users screen.

## Permission model

| Capability | Admin | Editor | Viewer |
|---|:---:|:---:|:---:|
| View agents, prompts, governance, and history | ✓ | ✓ | ✓ |
| Add or edit agents, skillsets, platforms, and prompt versions | ✓ | ✓ | — |
| Create governance assessment records | ✓ | ✓ | — |
| Approve and publish another person’s prompt | ✓ | — | — |
| Change user roles and company assignments | ✓ | — | — |
| Add and manage companies | ✓ | — | — |
| Add, edit, activate, or deactivate departments and categories | ✓ | — | — |
| Manage resource access scopes, assignments, dates, and permissions | ✓ | — | — |
| Archive, restore, or permanently delete resources | ✓ | — | — |

## Guided tour

The tour opens automatically the first time a person enters the repository. It explains Agents, Skillsets, Platforms, the directory as the governed source of truth, personalized resources, suggested names, accountable ownership, field-level guidance, managed classifications, access scope, external-license separation, automated governance screening, risk-based review, and role-specific controls. Administrators also see company, classification, user, and resource-access guidance. Completion is stored only in that browser. Users can restart it from **Take a tour**.

Each user can choose **Dark** or **Light** from the Appearance menu. The preference is stored only in that browser and does not affect other users. Dark remains the default.

## Recommended production hardening

- Configure custom SMTP in Supabase before inviting the whole team.
- Require email confirmation and a minimum password policy.
- Disable public sign-up after the first administrator is established.
- Turn on MFA for administrators.
- Add audit-log insert triggers for regulated or higher-risk use cases.
- Keep Supabase and Netlify secrets out of source control.
- Review roles quarterly and remove inactive accounts promptly.

## Governance API behavior

The governance function evaluates fairness, privacy, accuracy, safety, transparency, and security. Creation fails closed if the assessment service is unavailable, so an unchecked entry is not silently added. Keep the Anthropic API key in Netlify Functions only and never expose it through a `VITE_` variable.
