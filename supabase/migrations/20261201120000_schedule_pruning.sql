-- RYT-114: schedule the retention job. The owner approved automatic nightly pruning on
-- 2026-11-17 after a dry run on the hosted project that removed nothing (every idempotency row
-- is younger than 30 days and no encounter has been closed for 30 days).
--
-- What runs: private.prune_stale_rows() (and pre_private.prune_stale_rows() when PRE exists),
-- daily at 04:23 UTC. The function is security definer, has no EXECUTE for anon, authenticated or
-- service_role, and only removes what its own header lists (20261123120000, 20261128120000):
-- idempotency rows older than 30 days, snapshots of events in encounters closed for more than
-- 30 days beyond the 60 most recent, and account-deletion requests older than 7 days. It never
-- touches characters, sheets, inventory, campaigns, sheet history or the ledger.
--
-- Security: pg_cron runs the job as the owning role inside the database; nothing is exposed
-- through the API and no grant changes. The `cron` schema is not in the exposed schemas.
--
-- Environments: one global job covers production and PRE. The block is skipped where pg_cron is
-- not available (local PGlite tests), so the migration applies everywhere. Re-running it replaces
-- the job of the same name instead of adding a second one.

do $schedule$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    return;
  end if;
  create extension if not exists pg_cron;
  perform cron.schedule('rytta-prune-stale-rows', '23 4 * * *', $job$do $run$
begin
  perform private.prune_stale_rows();
  if to_regprocedure('pre_private.prune_stale_rows()') is not null then
    execute 'select pre_private.prune_stale_rows()';
  end if;
end
$run$$job$);
end
$schedule$;
