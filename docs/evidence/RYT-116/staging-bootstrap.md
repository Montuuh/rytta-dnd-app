# RYT-116 — Staging database bootstrap

Date: 2026-11-17. Target: Supabase project `rytta-staging` (ref `lynyorwnfpzhvlyjqqxr`, free plan,
eu-west-1, PostgreSQL 17.12). API URL: `https://lynyorwnfpzhvlyjqqxr.supabase.co`. Browser keys
available: the legacy `anon` key and the publishable key named `default` (values not recorded here).
The production project was not read or written at any point.

## Preconditions checked before the first write

- Project name `rytta-staging`, status `ACTIVE_HEALTHY`.
- `public` had 0 tables, the migration history was empty, `auth.users` had 0 rows.
- Schemas present were only the platform ones (`auth`, `storage`, `realtime`, `extensions`,
  `graphql`, `graphql_public`, `vault`, `pgbouncer`, `public`).

## What was applied

All 51 files in `supabase/migrations`, in filename order, from `20261027225922_foundation.sql` to
`20261201120000_schedule_pruning.sql`. Each file was sent unmodified as one migration (no edits, no
splitting; line endings normalised to LF) and **every one applied without error on the first
attempt**. This is the first replay of the full migration series from zero on hosted Supabase, and
it succeeded.

Integrity check: for each migration, the MD5 of the statement stored in
`supabase_migrations.schema_migrations` was compared with the MD5 of the LF-normalised local file.
51 of 51 match.

### Hosted versions

The migration tool assigns the version at apply time, so the hosted history does not carry the
filename timestamps. Names match the files; versions run from `20261117191414` (`foundation`) to
`20261117222748` (`schedule_pruning`) and sort in the same order as the files. Any tooling that
compares local and hosted history by version (for example the CLI migration list) will report all
51 as different; compare by name, or repair the history versions before using the CLI against
staging.

### PRE tooling on staging

Staging is a single-environment database. The PRE mirroring blocks inside the migrations are
guarded on the existence of PRE objects and were skipped: there is no `pre` and no `pre_private`
schema. Two migrations deal with PRE tooling directly:

- `pre_environment_tools` creates its tooling unconditionally. On staging it created the schema
  `pre_admin` with one empty table (`pre_admin.backups`, RLS enabled, 0 rows) and four functions
  (`remap(text)`, `refresh(boolean, boolean)`, `snapshot()`, `restore(uuid)`). They are security
  invoker, executable only by `postgres`; `anon`, `authenticated` and `service_role` have no USAGE
  on the schema. It is inert unless someone runs `pre_admin.refresh` as the owner.
- `expose_pre_api` did nothing: with no `pre` schema the `authenticator` role keeps its default
  settings (no `pgrst.db_schemas` override), so the API exposes the default schemas only.

## Verification (read-only queries after the last migration)

| Check | Result |
| --- | --- |
| Migrations recorded | 51 |
| Schemas added | `private`, `pre_admin`, `cron` (no `pre`, no `pre_private`) |
| Tables | `public` 43, `private` 12, `pre_admin` 1 |
| Tables without RLS (`public`, `private`, `pre_admin`) | none |
| Policies | `public` 39, `storage` 15 (`cron` 2 come with pg_cron) |
| RLS tables with no policy (deny-all, reached through RPCs) | 11 in `public` (`shops`, `shop_access`, `listing_access`, `shop_modifiers`, `shop_listings`, `shop_orders`, `shop_order_lines`, `profiles`, `content_packs`, `content_entries`, `item_proposals`), 12 in `private` |
| Functions | `public` 150, `private` 165, `pre_admin` 4 |
| SECURITY DEFINER functions | 270, none without a fixed `search_path` (no function at all lacks one) |
| EXECUTE for `anon` on `public` functions | none (also none in `private` / `pre_admin`) |
| EXECUTE for `PUBLIC` on `public` functions | none; `authenticated` can execute all 150 |
| Table privileges for `anon` | none |
| Foreign keys | 100, 0 without a covering index |
| Indexes (`public` + `private`) | 198 |
| Triggers on `auth.users` | none |
| `supabase_realtime` publication | `public.trades`, `public.tabletop_live`, `public.rest_requests`, `public.encounter_signals`, `public.campaign_roll_signals` |
| Storage buckets (all private) | `character-portraits`, `item-images`, `creature-images`, `shop-images` at 1 MiB (webp/png/jpeg); `tabletop-media` at 20 MiB (images plus mpeg/ogg/mp4/webm audio) |
| Storage objects | 0 |
| pg_cron | installed (1.6.4) by `schedule_pruning` |
| Scheduled job | `rytta-prune-stale-rows`, `23 4 * * *`, active, runs as `postgres` |
| `auth.users` | 0 rows |
| Application data | none, except 17 configuration rows in `private.quota_limits` inserted by the migrations themselves |

No data was inserted by hand, and Auth settings, API settings and secrets were not touched.

## Advisors

Security:

| Lint | Level | Count |
| --- | --- | --- |
| `authenticated_security_definer_function_executable` | WARN | 150 (every `public` RPC; expected, the API surface is security-definer RPCs granted to `authenticated`) |
| `rls_enabled_no_policy` | INFO | 24 (11 `public`, 12 `private`, 1 `pre_admin`; deny-all by design) |

Performance:

| Lint | Level | Count |
| --- | --- | --- |
| `unused_index` | INFO | 105 (expected on an empty database with no traffic) |

No ERROR-level finding in either category. No `anon`-executable security-definer function, no
mutable `search_path`, no unindexed foreign key and no RLS-disabled table were reported.
Remediation references:
<https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable>,
<https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy>,
<https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index>.

## Not tested

- No request went through the REST, Realtime, Storage or Auth APIs; only database-level checks.
- No role-based denial test was run against staging (there are no users or rows yet).
- The scheduled job has not fired yet; its first run is the next 04:23 UTC.

## What staging still needs

- **Auth**: a Google OAuth client for staging, the provider enabled in the project, and the Site
  URL / redirect URLs of the staging site. Open-signup settings should mirror production.
- **Synthetic seed**: users, campaigns, characters and catalogue content designed for staging;
  never production data.
- **Frontend build** pointed at the staging URL and publishable key, deployed to its own site, and
  confirmation that the runtime schema selector resolves to `public` there.
- **CI job** that applies new migrations to staging before production and runs the hosted checks.
- **Migration history versions**: decide whether to align the hosted versions with the filename
  timestamps so version-based tooling works against staging.
- **Decision on `pre_admin`**: keep it as inert history-parity tooling or remove it with a
  staging-only step.
- Free-plan limits apply (project pauses after inactivity, no backups beyond the plan default).

## First production backup (2026-11-18)

- The Backup workflow ran on main (run 44362679087) and stored roles, schema and data as a 14-day
  artifact with a checksum manifest (data 7.9 MB, schema 1.5 MB).
- Checksums verified after download; the local copy was deleted afterwards.
- Row counts of the 70 non-empty application, auth and storage tables in the dump equal production
  at the time. The platform-managed `auth.schema_migrations` and `storage.migrations` tables are
  not part of the dump.
- Not done: a restore rehearsal. It needs a staging database connection.

## Progress 2026-11-22

- **Headers on the live site (criterion 5).** `curl -I` on `https://rytta.pages.dev/`,
  `/version.json`, `/manifest.webmanifest` and a hashed `/assets/index-*.js`: every response has
  `Content-Security-Policy` with `frame-ancestors 'none'` and the backend as the only data origin,
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security`,
  `Permissions-Policy` and `Cross-Origin-Opener-Policy`; `/` and `version.json` are `no-cache`;
  hashed assets are `public, max-age=31536000, immutable`.
- **Browser run without CSP violations.** Chrome on the live site, signed out: landing, the email
  sign-in sheet with the Turnstile widget loaded, the three views of the sample game (DM, Player,
  shared screen), privacy and terms. A `securitypolicyviolation` listener recorded none, and the
  console showed no CSP message (only an unrelated browser-extension error). Not covered: signed-in
  screens (backend requests, signed images, realtime socket).
- **Encrypted backup (criterion 7).** `.github/workflows/backup.yml` now encrypts the dump with age
  to `BACKUP_AGE_RECIPIENT` inside the runner, deletes the plain files, refuses to upload anything
  but `backup.tar.age` and its checksum, and does nothing without the key. Not run yet: the
  workflow stays disabled until the owner creates the key and adds the variable
  (docs/deployment.md, "Backups").
- **Still open, owner side.** Google sign-in on staging; the restore rehearsal (staging is
  synthetic only, so loading a production dump there is the owner's decision); the CI promotion
  workflow, which first needs the decision on staging's migration history versions (a `db push`
  against today's staging history would try to re-apply every migration); PRE removal after
  staging sign-in and frontend exist; the ADR on the hosting decision.
