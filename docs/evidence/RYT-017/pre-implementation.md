# RYT-017: PROD-to-PRE preparation

Date: 2026-10-28. Planning evidence only; no clone, ETL implementation or PRE connection completed.

Historical planning snapshot. The subsequent user choice of a same-project PRE schema
supersedes the separate-project/Auth mapping proposal below. Current implementation and
observed results are in [validation.md](validation.md) and ADR 007.

The user requested a production-like PRE backend for localhost and an ETL tool to copy
schema and data from PROD. The hosting choice (local Supabase or hosted project) is pending.
Rytta production is ekscdsmniukuxqjixapu. No separate Rytta PRE project exists in the
connected account. No Docker/Podman executable or installation directory was found on
this Windows host; local Supabase cannot currently start. Existing local frontend and
unstaged RYT-018/doctrine changes were inspected and preserved.

## Concrete delivery

1. Provision/select PRE and record an explicit PROD/PRE identity registry. Never infer
   target from a generic linked project; reject equal source/target and any PROD write.
2. Reproduce schema, functions, grants and RLS from committed migration history; compare
   it to PROD and report drift before importing. No blind schema overwrite.
3. Export application data in a consistent read-only source transaction. Keep a manifest
   of migration versions, tables, row counts and checksums; store snapshots outside Git.
4. Use PRE-specific Auth identities and map all references (campaign owner/members,
   characters, invitation actors, audit actors). Preserve application UUID relationships.
   Exclude production sessions, provider tokens and signing secrets. Define explicit
   handling for invitation recipient emails and environment-specific idempotency state.
5. Dry-run schema, identity mapping, row counts and foreign-key checks. Import only into
   an empty, positively identified PRE target in a transaction. Replacing an existing PRE
   requires a separately requested destructive refresh, with a recoverable PRE backup.
6. Configure ignored local frontend variables to PRE; provide a development-only login
   using PRE-issued sessions so RLS is actually exercised. Do not disable RLS or fabricate
   tokens for a real backend. Google remains the production provider.
7. Verify restore, per-role denial tests and two real PRE sessions. Storage objects,
   OAuth settings, API keys and Realtime configuration are separate from SQL data copy.

## Verified references

- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- https://supabase.com/docs/guides/local-development/cli-workflows
- https://supabase.com/docs/guides/self-hosting/restore-from-platform
- https://supabase.com/docs/reference/javascript/auth-admin-createuser

CLI 2.122.0 help confirms separate schema/data dump flags and local start. Official docs
state the CLI dump uses a Docker container; a database-only embedded PostgreSQL instance
cannot supply the Auth/PostgREST stack needed for normal frontend operation. No paid
project/branch, production mutation, data export or destructive import was performed.
