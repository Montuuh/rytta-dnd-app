# RYT-003 production migration

Date: 2026-10-28. The user explicitly requested the production Supabase migration.
Project: Rytta (`ekscdsmniukuxqjixapu`).

Preflight: prior migration history contained foundation and membership. Counts: zero
characters, resource records, non-divisible copper balances, duplicate assignments and
pending invitations. No existing records required conversion or cancellation.

Applied the reviewed `characters_resources` SQL using Supabase migration API. Supabase
assigned version `20261028190642`; the local file was renamed to match that history,
without changing its SQL. Postflight confirmed gold column, audit-table RLS, denial of
client resource UPDATE and anonymous character creation, and authenticated RPC grant.
Local actor-matrix and concurrency evidence remains in validation.md. Hosted multi-account
Auth/PostgREST behavior has not been tested in this migration session.

Security advisor reported INFO for RLS without policies on private.resource_requests,
which intentionally denies direct access, and warnings for authenticated SECURITY DEFINER
RPCs, which are intentional API entrypoints with explicit authorization checks. It also
reported leaked-password protection disabled; the application uses Google sign-in.
These advisories are not a substitute for a hosted two-account authorization test.
