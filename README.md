# Lead Ventures Agent Registry

A production-oriented Netlify + Supabase application for cataloging AI agents and skillsets, preserving prompt history, screening new entries for governance risk, and enforcing Admin/Editor/Viewer access.

This package contains no demonstration records. `danielle@focusquest.com` and the first person who creates an account become administrators; every later account starts as an editor.

## Included

- Email/password authentication
- Self-service account creation and password recovery
- Direct creation of agents and reusable skillsets by Admins and Editors
- Admin-managed Lead Ventures companies
- Required company selection during agent intake
- Company assignment for users
- Portfolio dashboard for agents, companies, owners, status, risk, and governance
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
3. If `schema.sql` completed successfully, run `006_open_creation_governance_scan.sql` and `007_sync_users_and_admins.sql`. Do not run migrations 004 or 005; those belong to the retired routing and pre-build request workflows.
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

Do not rerun `schema.sql` on an existing installation. Migrations 004 and 005 are intentionally skipped. After migration 003, open **Companies** as an Admin and add each company under the Lead Ventures tenant. Existing agents and users can then be assigned to the appropriate company. The Agents & skillsets page includes an **Agents by company** dropdown, including companies that do not yet have an agent.

Migration 006 retires the pre-build authorization workflow from the live application. Existing request data remains in the database for audit history, but users create agents and skillsets directly. Each new entry must complete the governance API screening. Low-risk entries are cleared automatically; only medium, high, or critical results are flagged.

Migration 007 backfills `public.profiles` from existing Supabase Authentication users and repairs the signup trigger for future accounts. It also grants Admin access to Danielle, Sean (`sean@focusquest.com`), Eliana (`eliana@lead-ventures.com`), and Mariano (`mcarcamo@back2learn.com`). You can change any person between Admin, Editor, and Viewer from **Admin · Users & access**.

The **Users & Access** page also reconciles Authentication users with access profiles whenever an administrator opens it. This server-side repair requires `SUPABASE_SERVICE_ROLE_KEY` in Netlify and preserves existing roles and company assignments.

Migration 008 adds **Admin · AI Settings** and clears legacy low-risk pending prompts from the risk approval queue. In the application, choose Anthropic Claude, OpenAI (ChatGPT), or Google Gemini and enter the model name. Add the matching API key in Netlify environment variables; keys are never stored in Supabase or exposed to the browser.

The sign-in screen also includes **Forgot your password?**. It sends a Supabase recovery email back to the application, where the user chooses and confirms a new password.

For security, disable open sign-ups in Supabase after the first administrator is created if accounts should only be invitation-based. The administrator invitation function is available at `/api/invite-user` for connection to the Users screen.

## Permission model

| Capability | Admin | Editor | Viewer |
|---|:---:|:---:|:---:|
| View agents, prompts, governance, and history | ✓ | ✓ | ✓ |
| Add agents and prompt versions | ✓ | ✓ | — |
| Create governance assessment records | ✓ | ✓ | — |
| Approve and publish another person’s prompt | ✓ | — | — |
| Change user roles and company assignments | ✓ | — | — |
| Add and manage companies | ✓ | — | — |

## Guided tour

The tour opens automatically the first time a person enters the registry. It explains direct agent and skillset creation, automated governance screening, risk-based review, and role-specific controls. Administrators see company and user-access guidance, while editors and viewers receive instructions appropriate to their permissions. Completion is stored only in that browser. Users can restart it from **Take a tour**.

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
