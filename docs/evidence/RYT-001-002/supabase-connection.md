# Supabase connection and hosted SQL verification

Date: 2026-10-28 (Europe/Madrid). User explicitly requested direct project connection
and queries through the Supabase MCP. No frontend publication or paid service was created.

## Target and initial state

- Project: Rytta, ref `ekscdsmniukuxqjixapu`, region `eu-west-1`, PostgreSQL 17.
- API URL: `https://ekscdsmniukuxqjixapu.supabase.co`.
- Before setup: 0 public tables, 0 migrations, 0 Auth users. The separate oak-forge-3d
  project was not modified.
- `.env.local` already contained Supabase mode, this project's URL and a modern public
  Publishable key. The actual connection was verified without printing the key. No secret
  key, database password, access token or Google Client Secret was read or persisted.

## Applied migrations and types

Applied the previously tested SQL through MCP `apply_migration`, in dependency order:

- `20261027225922_foundation.sql` (previous local filename `202610270001_foundation.sql`).
- `20261027225926_membership.sql` (previous local filename `202610270002_membership.sql`).

Renamed the local files to the remote-assigned migration versions and updated test references;
the SQL contents were preserved. This keeps local and hosted migration history aligned.
All five public application tables have RLS enabled.

Generated `database.generated.ts` from the actual hosted schema through MCP. The small
`database.types.ts` wrapper expresses the intentional NULL role argument used to deactivate
a member: PostgreSQL accepts it, while the generator reports only `string`. The CLI generator
now targets the generated file and preserves this wrapper.

## Observed verification

- `supabase/tests/membership-hosted.sql` executed successfully on actual hosted PostgreSQL.
  It covered anonymous table/RPC denial, DM bootstrap, confirmed-email invitations, wrong
  recipient denial, Player acceptance, replay rejection, Player escalation denial, cross-campaign
  DM denial, last-DM protection, handover, creator privilege loss, Player resource-write denial,
  revocation and preservation of character resources.
- The probe used PostgreSQL roles and test identities inside a transaction, then rolled back.
  A separate post-probe query confirmed 0 Auth users and 0 rows in all five application tables.
  These were not real Google accounts, sessions or JWTs.
- `npm run check:supabase`: PASS against the real API and `.env.local`.
  Auth settings return HTTP 200, Google is enabled and registration is open. Campaign and
  invitation reads, campaign listing RPC and campaign creation RPC reject anonymous access
  with PostgreSQL code 42501. Google OAuth preflight redirects to accounts.google.com with
  a configured Client ID and the expected Supabase callback.
- The OAuth preflight does not complete sign-in. It may create temporary Auth flow state,
  which expires; it creates no user or campaign. The default email provider is also enabled
  in the hosted project, although the application offers only Google. No Auth provider
  configuration was changed through SQL or by extracting MCP credentials.
- Live frontend smoke: PASS at `http://127.0.0.1:4182/`, 390px viewport, zero page errors
  and no private REST requests before sign-in. Clicking Continue with Google reached
  Google's `/v3/signin/identifier` page. No account was selected and no consent was approved.
  A read of only the recent Auth flow `referrer` field confirmed return to
  `http://127.0.0.1:4182/`. Capture: `live-sign-in-mobile.png`.
- Initial frontend probe used port 5173 and timed out waiting for the Google button. An
  HTTP title check showed that an existing Pokémon Ascendant server occupied that port;
  it was left untouched. A dedicated Rytta preview on port 4182 passed the corrected probe.
- Local `npm run check`: PASS (34 unit/SQL tests, types, lint, contracts and production build).
  `npm run format:check`, `npm run check:ui-review` and `git diff --check`: PASS.
  The unchanged rendered source retains its independent review. The earlier 73-pass browser
  fixture suite was not repeated for generated types, migration filenames and documentation.

## Advisor findings

Before setup there were no security findings. After setup, the advisor reports eight
authenticated SECURITY DEFINER RPC warnings. This is the intended explicit RPC surface:
table membership writes remain denied, functions use a fixed empty search_path and identity
or campaign-role predicates, and PUBLIC/anon execution is revoked. Hosted denial tests
exercise those boundaries. These warnings are reviewed intentional exposure, not a claim
that the advisor returned a clean report.

[SECURITY DEFINER advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Performance information: three uncovered foreign-key indexes (invitation creator/respondent
and the campaign-first resource FK), plus four unused indexes on the new empty database.
No performance changes were made from an empty workload. These are recorded for later
measurement, not interpreted as a reason to delete indexes or expand this delivery.

[Foreign-key index guidance](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys),
[unused index guidance](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

## Remaining integration boundary

Follow-up on 2026-10-28: the user confirmed completed Google sign-in on the local app.
A read-only aggregate query corroborated one Google identity in hosted Auth; no personal
account details or tokens were read. This confirms the local path, not the production callback.

Still unverified: authenticated JWT/PostgREST calls with two real Google accounts, cross-connection concurrent
last-DM changes, deployed frontend callback URLs, real mobile Safari and backup/restore.
RYT-001/RYT-002 remain in review. Character-targeted invitations from ADR 004 remain planned
for RYT-003; this connection task did not implement them.

No rendered source changed during connection setup. The previous independent UI/UX PASS
fingerprint remains `6bc82848d71c005333324b9318761b2757c56815b7ce31295b970a25831af958`.
