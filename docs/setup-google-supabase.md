# Google and Supabase setup for RYT-001 / RYT-002

This is a setup reference for a new environment. The current Rytta project is already
connected, both migrations have been applied through MCP, and Google is enabled. See
[current connection evidence](evidence/RYT-001-002/supabase-connection.md); completing real
Google sign-in and multi-account integration remains a separate verification step.
The app has open Google registration with no application email allowlist. Invitations
are stored in Rytta and do not send email, so SMTP and email-service keys are unnecessary.

## 1. Create a Supabase project

1. Open <https://supabase.com/dashboard>, select your organization and choose New project.
2. Choose the project name (for example Rytta), a region and a database password.
   Keep the database password in your password manager. It does not belong in Vite or chat.
3. After provisioning, click **Connect** at the top of the project and select the React
   integration. Copy **Project URL** and **Publishable key**. The key starts `sb_publishable_`.
   The keys are also available in **Settings → API Keys**; create a publishable key there
   if one is not present. Do not choose a Secret or legacy service-role key.

## 2. Set the browser environment

Create `.env.local` at the repository root next to `package.json`:

```dotenv
VITE_DATA_MODE=supabase
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_PUBLIC_KEY
VITE_BASE_PATH=/
```

These are the only application variables required for this delivery. `.env.local` is
ignored by Git. The existing `.env` can stay in demo mode: `.env.local` overrides it.
Restart `npm run dev` after changes. Local development normally uses `http://localhost:5173/`.
The current real-backend preview uses `http://127.0.0.1:4182/` because another application
already occupies 5173. Start that preview with
`npm run build` then `npm run preview -- --host 127.0.0.1 --port 4182 --strictPort`.
For project Pages, build with `/rytta-dnd-app/` (or the actual repository subpath).

All `VITE_` values are shipped to the browser. Never add Google Client Secret, database
password, Supabase personal access token, `sb_secret_` or `service_role` to these variables.

## 3. Configure Google OAuth

1. Open <https://console.cloud.google.com/> and select or create a project.
2. Open **Google Auth Platform** (older consoles: APIs & Services → OAuth consent screen).
   Configure Branding, support/developer email and Audience. For ordinary Gmail accounts,
   choose External. Use only the `openid`, email and profile scopes; no Gmail/Drive access.
3. Under **Clients**, create an OAuth client with application type **Web application**.
4. Add **Authorized JavaScript origins**:
   - `http://localhost:5173`
   - `http://127.0.0.1:5173` if you use that host
   - Later, your actual site origin, for example `https://YOUR_USER.github.io` (no subpath).
5. In Supabase open **Authentication → Sign In / Providers → Google** (sometimes labelled
   Providers). Copy its **Callback URL**. Normally this is
   `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`.
6. Add that exact URL under Google's **Authorized redirect URIs**. This is the Supabase
   callback, not the Rytta frontend URL. Create the client.
7. Copy Google's **Client ID** and **Client Secret** directly into Supabase's Google
   provider configuration, enable the provider and save. Leave nonce checks enabled.
   Neither value is needed in the frontend `.env.local`; do not paste the secret in chat.

Google's Testing audience may require test-user configuration while developing. This is
Google's own development restriction, not an application allowlist. Check Google's audience
and publishing requirements before making the app broadly available.

## 4. Configure Supabase authentication URLs

In **Authentication → URL Configuration**:

- Local Site URL: `http://localhost:5173/`.
- Allowed Redirect URLs: `http://localhost:5173/` and `http://127.0.0.1:5173/` if used.
- For the current dedicated preview, include `http://127.0.0.1:4182/`.
- When deploying later, set Site URL to the exact deployed frontend base, for example
  `https://YOUR_USER.github.io/rytta-dnd-app/`, and allow that exact URL too.

Do not add `/#/` routes to the callback. Rytta consumes the PKCE query-string code before
rendering campaign routes and removes it from the URL. Complete login in the browser/device
where you started it. The SDK may append an `sb_flow_id` query parameter to correlate PKCE.

In Authentication configuration, keep **Allow new users to sign up** enabled. Enable Google
and disable unused sign-in providers, including email/password and anonymous sign-ins.
There is no campaign membership until the person creates a campaign or accepts an invitation.

## 5. Prepare the database separately

The reviewed migrations must be applied in timestamp order:

1. `supabase/migrations/20261027225922_foundation.sql`
2. `supabase/migrations/20261027225926_membership.sql`

Both are already applied to the current Rytta project: do not apply them again there.
Their local filenames match the versions assigned by MCP. For another environment, use
a separate staging project first. Applying a hosted migration is a separate, explicitly authorized operation;
do not run a production reset. The public URL and publishable key alone cannot migrate SQL.
CLI migration access uses your locally authenticated Supabase CLI and, where required, a
database password; keep credentials in the CLI/password manager, not in browser variables.

## 6. Verify with two Google accounts

- Account A signs in, creates a campaign and becomes DM.
- A invites B's Google email before B has an account. B signs in, accepts and becomes Player.
- A grants B DM. A may become Player or leave; B remains DM. The last DM cannot leave.
- Test cancellation, decline, expired/reused invitations, removal and reinvitation.
- Test two campaigns, sign-out, account switching and private-data/cache isolation.
- Test redirects at the actual deployed subpath and a real mobile Safari device.

Local browser fixtures and PGlite tests do not verify this hosted integration, token issuance,
PostgREST schema-cache behavior or simultaneous transactions on separate connections.

## Sources

- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase Google sign-in](https://supabase.com/docs/guides/auth/social-sign-in/auth-google)
- [Supabase PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow)
