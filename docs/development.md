# Local development

Node 24.13+ within 24.x; .nvmrc selects the major. npm ci uses the lockfile and installs
Git hooks. npm run dev starts Vite. .env.local is ignored. Demo needs no credentials.

All VITE_ variables are public. Copy .env.example and restart Vite after changes.
Use modern sb_publishable_ keys; legacy JWT and secret keys are rejected.
VITE_BASE_PATH is read from the environment or .env.local; for a one-off build use
`npm run build -- --base=/rytta-dnd-app/`.

## Local backend

Install Docker and the supported [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started).

```sh
supabase start
supabase db reset
supabase status
npm run db:types
```

db reset destroys the local database; never target production for this workflow.
Signup is disabled; create test users in local Studio when testing auth.
Do not commit real campaign data/passwords. The committed database contract is
handwritten bootstrap typing, explicitly marked until CLI-generated types are available.
Type generation preserves the file on CLI failure.

No sign-in UI exists yet. Supabase mode reports a signed-out error pointing to RYT-001,
rather than falling back to demo. Complete that ticket before using a real account.

## Tests and dependencies

npm run check is the local gate. npm run test:db executes policy tests without Docker.
Install Chromium with `npx playwright install chromium` before npm run test:e2e.
Tests build at the Pages subpath and require free port 4173; an unknown server is never reused.
Raw reports go to ignored test-results/ and playwright-report/. Preserve selected evidence
under docs/evidence/. Real Supabase and Safari testing are separate integration gates.

Use npm/package-lock.json. Mantine Form/Notifications are present for upcoming UI work;
avoid duplicate kits/state/form tools. Revalidate major upgrades. npm audit is a dependency
signal, not a security certification.
