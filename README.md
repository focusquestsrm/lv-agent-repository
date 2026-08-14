# Lead Ventures Agent Registry

A clean, production-oriented Netlify + Supabase application for cataloging AI agents, preserving prompt history, managing approvals, evaluating responsible-AI controls, and enforcing Admin/Editor/Viewer access.

This package contains no demonstration records. `danielle@focusquest.com` and the first person who creates an account become administrators; every later account starts as an editor.

## Included

- Email/password authentication
- Self-service account creation and password recovery
- Empty agent directory with governed intake
- Admin-managed Lead Ventures companies
- Required company selection during agent intake
- Company assignment for users
- Portfolio dashboard for agents, companies, owners, status, risk, and governance
- Immutable prompt-version records
- Two-person approval control: authors cannot approve their own change
- Governance categories for fairness, privacy, accuracy, safety, transparency, and security
- Admin, Editor, and Viewer database permissions
- User-role administration
- Supabase Row Level Security
- Netlify SPA routing and serverless invitation endpoint
- Official Lead Ventures branding
- Role-aware guided product tour for first-time users

## 1. Create Supabase

1. Create a Supabase project.
2. Open **SQL Editor**, paste `supabase/schema.sql`, and run it once.
3. Under **Authentication → URL Configuration**, add your Netlify production URL and local URL (`http://localhost:5173`) as allowed redirect URLs.
4. Under **Authentication → Providers → Email**, enable email/password. Decide whether your team must confirm email addresses.
5. Copy the Project URL and anonymous/public key from **Project Settings → API**.

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
```

The service-role variable is used only by the invitation function. When using plain `vite`, that function is unavailable; use Netlify local development if testing invitations.

## 3. Deploy to Netlify

1. Push this folder to a private Git repository.
2. In Netlify, choose **Add new project → Import an existing project**.
3. Netlify will use `npm run build` and publish `dist` from `netlify.toml`.
4. Add these environment variables in **Project configuration → Environment variables**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` — scope to Functions when your Netlify plan supports scopes
5. Deploy the site.
6. Return to Supabase and add the final Netlify URL to Authentication redirect URLs.

## 4. Create the first administrator

Use **Join workspace** in the deployed application. The database trigger assigns `danielle@focusquest.com` and the first registered account the `admin` role. Sign out and back in if the role does not appear immediately.

If you already ran the original schema, run these migrations in order in the Supabase SQL Editor:

1. `supabase/migrations/002_self_service_auth.sql`
2. `supabase/migrations/003_companies_dashboard.sql`

Do not rerun `schema.sql` on an existing installation. After migration 003, open **Companies** as an Admin and add each Lead Ventures company. Existing agents and users can then be assigned to the appropriate company.

The sign-in screen also includes **Forgot your password?**. It sends a Supabase recovery email back to the application, where the user chooses and confirms a new password.

For security, disable open sign-ups in Supabase after the first administrator is created if accounts should only be invitation-based. The administrator invitation function is available at `/api/invite-user` for connection to the Users screen.

## Permission model

| Capability | Admin | Editor | Viewer |
|---|:---:|:---:|:---:|
| View agents, prompts, governance, and history | ✓ | ✓ | ✓ |
| Add agents and prompt versions | ✓ | ✓ | — |
| Complete governance reviews | ✓ | ✓ | — |
| Approve and publish another person’s prompt | ✓ | — | — |
| Change user roles and company assignments | ✓ | — | — |
| Add and manage companies | ✓ | — | — |

## Guided tour

The tour opens automatically the first time a person enters the registry. Its steps adapt to the signed-in role: administrators see company and user-access guidance, while editors and viewers receive instructions appropriate to their permissions. Completion is stored only in that browser as a UI preference. Users can restart it from **Take a tour** in the application header.

## Recommended production hardening

- Configure custom SMTP in Supabase before inviting the whole team.
- Require email confirmation and a minimum password policy.
- Disable public sign-up after the first administrator is established.
- Turn on MFA for administrators.
- Add audit-log insert triggers for regulated or higher-risk use cases.
- Keep Supabase and Netlify secrets out of source control.
- Review roles quarterly and remove inactive accounts promptly.

## Claude change explanations

The schema stores `change_explanation` on every prompt version. The included UI asks the editor for the explanation. To automate this with Claude, add a server-side Netlify function that receives the old and proposed prompts, calls Claude using a server-only API key, and writes the returned explanation. Never expose the Claude API key through a `VITE_` variable.
