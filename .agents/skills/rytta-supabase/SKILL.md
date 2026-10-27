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
Record integration gaps explicitly. Production migrations, destructive imports and live data changes
require their own authorization; planning or SQL tests do not supply it.
