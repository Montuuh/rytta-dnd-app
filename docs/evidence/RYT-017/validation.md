# RYT-017: shared-project PRE and one-way ETL

Date: 2026-10-28. Requested scope: local uses PRE; production stays public; bulk schema/data copy.

## Target and impact

Project ekscdsmniukuxqjixapu was checked against hosted migration history and application
inventory before changes. No pre/pre_private schema existed. Six application tables in
public and one in private were present. Existing unstaged RYT-018 interface and doctrine
changes were preserved. No commit, push or frontend deployment was performed.

Applied hosted migrations, with matching local versions:

- 20261028215647_pre_environment_tools: owner-only maintenance functions and backup registry.
- 20261028215831_expose_pre_api: append pre to the authenticator Data API schema list.

Executed a read-only repeatable-read plan, then the initial repeatable-read copy with
refresh(false,false). Initial backupId was null because no previous PRE existed. No
production application rows were inserted, updated or deleted. Auth configuration and
identities were not modified. No real data dump was saved in the repository.

## Hosted copy and isolation

Source and destination counts at copy time:

- campaign_invitations: 2.
- campaign_members: 2.
- campaigns: 1.
- character_events: 8.
- character_resources: 2.
- characters: 2.
- private/pre_private resource_requests: 3.

Full sorted JSONB row comparisons passed for all seven table pairs, beyond count equality.
PRE has six public-facing application tables, one private table and 17 cloned functions.
The source permission model and RLS were preserved. authenticated cannot invoke maintenance,
anon cannot create characters, and authenticated cannot directly update resource rows.

Hosted actor probes used real existing actor IDs inside a transaction, with SET ROLE and
request JWT claims. A DM created a PRE character and changed PRE resources; a public RPC
rejected the PRE-only character, and a full production character snapshot was unchanged.
A Player could not create a character; an outsider could not read PRE characters. All
probe changes rolled back. These probes test database authorization, not real signed JWTs.

Anonymous HTTP probes using the public project key returned HTTP 401 / PostgreSQL 42501
for both GET campaigns and POST create_character, separately with public and pre profiles.
This confirms PRE API exposure and continued public denial. It does not prove signed-in
PostgREST access through a real Google session.

## Local verification

- npm run check: PASS, 55 tests, strict types/lint/contracts/build.
- npm run test:db: PASS, 35 tests, including seven PRE copier/isolation tests and CLI guards.
- npm run test:e2e: PASS, 105/105, including local Accept-Profile/Content-Profile assertions
  on reads and RPC writes across the three viewport projects.
- Routing unit cases keep Vite development and loopback previews on pre, hosted production
  and deceptive localhost-prefix/suffix hostnames on public.
- PGlite tests cover read-only dry-run, exact data/audit copy, DM/Player/outsider/anon and
  cross-campaign DM denials, service_role maintenance denial, PRE-only writes, explicit
  replacement, retained full backups, restore and external/unsupported dependency refusal.
- pre:plan/pre:sync/pre:restore --print-sql run without credentials and emit the bounded
  reviewed SQL. Unknown targets/SQL arguments and unsafe flag combinations are rejected.

The local ignored environment now selects supabase mode with the existing public URL/key.
The active Vite app uses PRE automatically after reload/restart. Google sign-in remains
required because Auth is shared. There is no local fake-token bypass for hosted data.

## Failures corrected and limits

The first PGlite run failed because a PL/pgSQL ACL loop record shadowed a pg_attribute
alias. Renaming the loop record fixed it before the hosted migration. An initial test
placed under scripts was not discovered by Vitest; it was moved into tests/database and
is now part of the gate. No failed checks were omitted or labeled as passing retries.
Inspection of printed CLI SQL also caught JavaScript string replacement collapsing SQL
dollar quotes in the appended exposure block. A replacement callback and regression tests
now preserve them; PGlite executes the same combined apply SQL emitted by the CLI.
The first format check also reported backlog JSON indentation; formatting was corrected
and the final check, formatting gate and unchanged UI review fingerprint all passed.

The CLI's direct Management API HTTP execution with a personal access token was not run:
the terminal has no such credential. Its generated SQL was executed through the connected
administrator/MCP connection, including the hosted dry-run and initial copy. The --print-sql
alternative is available without a token. Existing-PRE replacement and restore were tested
in PGlite; they were not exercised against the hosted PRE copy. Real two-account Google/
JWT/PostgREST verification, Safari and concurrent active-user refresh testing remain separate.

Security advisor: three RLS-without-policy informational findings are intentional closed
owner-only tables (private.resource_requests, pre_private.resource_requests, pre_admin.backups).
The 12 authenticated SECURITY DEFINER warnings in public are the existing actor-checked
transactional API; PRE clones retain that contract. The password-leak protection warning
is existing project configuration (current app signs in with Google). No maintenance
function was exposed to app roles. References for interpreting these findings:
[closed RLS](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy),
[definer APIs](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable),
[password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

This delivery changed infrastructure/configuration and doctrine, not interface source.
The existing RYT-018 independent UI verdict remains subject to its source fingerprint gate.
See ADR 007 and docs/pre-environment.md for operational limits and recovery instructions.

## Local Google redirect correction

The user reported that local Google sign-in returned to production. Hosted Dashboard
inspection confirmed Site URL was the correct production base but Redirect URLs contained
localhost:5173 only, not the active localhost:5174. The adapter already sends the current
origin and Vite base as redirectTo, so no interface code change was necessary.

An invalid-token HTTP redirect probe reproduced the failure: requesting localhost:5174
returned HTTP 303 to the production base. Added only the exact http://localhost:5174/
callback through Supabase's URL Configuration. Site URL and all existing allowed URLs were
preserved. The first addition brought the list to six entries.

After propagation, localhost:5173 and localhost:5174 both returned to their requested local
bases. An unapproved .invalid host still fell back to production. The public connection
smoke now checks the actual localhost:5174 and production bases, with and without the SDK
PKCE correlation query. This catches callback-list regressions beyond the previous Google
authorize preflight, which only verified the Google-to-Supabase callback.

The new smoke initially failed on the SDK's sb_flow_id query. The base-only entry is
insufficient because query strings participate in allowlist matching. Added the narrow
http://localhost:5174/?sb_flow_id=* and
https://montuuh.github.io/rytta-dnd-app/?sb_flow_id=* variants, preserving the existing
origins/ports/paths. The final list has eight entries. The smoke requires both callback
base equality and preservation of sb_flow_id, including on production (where fallback to
the same base could otherwise hide query loss). See oauth-local-redirect.png for the
final saved state.

Final npm run check:supabase: PASS for both callback bases and sb_flow_id variants,
Google provider/registration preflight and four anonymous API denials. Lint, documentation
contracts, diff whitespace and the unchanged RYT-018 UI fingerprint also passed.

These HTTP probes use invalid tokens, do not send email, and do not create authenticated
sessions. A fresh completed Google round trip after this correction still requires the
user's normal sign-in. Production routing/data and PRE data were not modified.
