---
name: rytta-supabase
description: Build or review Rytta Supabase schema, RLS policies and transactional RPCs. Use when a delivery changes data ownership, backend operations or permissions.
---

Read `supabase/AGENTS.md`, `docs/security.md`, current migrations and the assigned backlog item.
Define the actor/action matrix before SQL. Use auth.uid(), fixed search_path and explicit function grants.
Protect campaign relationships with composite keys. Separate DM-only content from shared records.
Economic writes must run atomically with server-derived values, idempotency keys and revision checks.
Test anon, unaffiliated user, player, own DM and other-campaign DM directly against SQL policies.
Run `npm run test:db`; if local Supabase is available, reset the local stack and verify Auth/PostgREST too.
Run `npm run db:types` against local Supabase after schema changes; never overwrite types on CLI failure.
Record integration gaps explicitly. Apply necessary non-destructive hosted changes and migrations
within the requested delivery without separate approval after checking target, migration history,
data impact, access policies and recovery options. Verify hosted results and report them separately.
Destructive resets, imports or data deletion still require explicit authorization.

For Rytta local work use pre and pre_private; deployed production uses public and private.
Use pre:plan/pre:sync for public-to-pre copies, not ad hoc SQL renames or browser ETL.
Validate cloned helpers/RLS/audit targets and preserve prior PRE before explicit replacement.
Keep pre_admin owner-only; application sessions must never receive maintenance credentials.
