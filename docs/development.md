# Local development

Node 24.13+ within 24.x; .nvmrc selects the major. npm ci uses the lockfile and installs
Git hooks. npm run dev starts Vite. .env.local is ignored. Demo needs no credentials.

All VITE_ variables are public. Copy .env.example and restart Vite after changes.
Use modern sb_publishable_ keys; legacy JWT and secret keys are rejected.
VITE_BASE_PATH is read from the environment or .env.local; for a one-off build use
`npm run build -- --base=/rytta-dnd-app/`.

## Shared-project PRE backend

The normal localhost backend is the existing Rytta Supabase project with schema `pre`.
Use the public URL/key in ignored `.env.local` and `VITE_DATA_MODE=supabase`; `npm run dev`
uses PRE automatically. Hosted production uses `public`. A built preview on localhost also
uses PRE. There is no editable VITE_ schema override. Auth and accounts are shared: Google
sign-in is still required, and allowed local callback URLs must be configured for the port.

See [PRE workflow](pre-environment.md) for the one-way ETL, backups and restore. Docker is
not required for this shared-project setup. The optional local container stack below remains
useful for offline schema rehearsals; it is not the active PRE environment.

## Optional local backend

Install Docker and the supported [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started).

```sh
supabase start
supabase db reset
supabase status
npm run db:types
```

db reset destroys the local database; never target production for this workflow.
Signup is enabled with no application email allowlist. Configure Google separately when
testing OAuth; [the setup guide](setup-google-supabase.md) covers hosted setup.
Do not commit real campaign data/passwords. The committed database contract is
generated typing lives in `src/shared/api/database.generated.ts`, initially generated from
the hosted Rytta schema through MCP. `database.types.ts` adds one explicit nullable RPC
argument contract. `npm run db:types` regenerates the generated file from a local stack
and preserves the existing file on CLI failure.

Supabase mode offers Google sign-in, then My campaigns, creation and pending invitations.
It never silently falls back to demo. Apply reviewed migrations in staging and verify two
Google accounts before real campaign use. The Rytta backend is now connected; see the
[hosted connection report](evidence/RYT-001-002/supabase-connection.md).

`npm run check:supabase` checks the configured real public URL/key, Auth settings, Google
authorization redirect, accepted localhost/production callback URLs and anonymous REST denials.
Pass a different callback base as `npm run check:supabase -- http://localhost:5174/`.
The allowlist probe uses an intentionally invalid token without completing a session.
It does not create accounts or campaign
data; the authorization preflight can create temporary Auth flow state. It is optional and
is not part of offline CI. `supabase/tests/membership-hosted.sql` is a separate transactional
role/RLS probe intended only for a user-authorized staging project; all fixtures roll back.

## Tests and dependencies

npm run check is the local gate. npm run test:db executes policy tests without Docker.
Install Chromium with `npx playwright install chromium` before npm run test:e2e.
Tests build demo and Supabase-contract variants at the Pages subpath and require free ports
4173 and 4174; an unknown server is never reused. The latter uses intercepted HTTP fixtures
and never signs in to Google or connects to hosted Supabase.
Raw reports go to ignored test-results/ and playwright-report/. Preserve selected evidence
under docs/evidence/. Real Supabase and Safari testing are separate integration gates.

Use npm/package-lock.json. Mantine Form/Notifications are present for upcoming UI work;
avoid duplicate kits/state/form tools. Revalidate major upgrades. npm audit is a dependency
signal, not a security certification.
