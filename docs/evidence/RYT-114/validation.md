# Delivery RYT-114: scalability, indexes, policy cost, retention and request volume

Status: in progress (2026-11-17; was review). The migration is applied, but part of the
implementation is missing: polling back-off for trades, rest and campaigns, and the browser
spec counting Storage requests. Not Done.

## Outcome

Migration `20261123120000_scalability_indexes_policies_retention.sql` (hosted version
`20261117012908`):

- 76 indexes; the hosted database reports 0 of 87 foreign keys without a covering index.
- 29 read policies rewritten to set-based helpers with identical visibility; an independent
  review compared the old and new predicates.
- `created_at` on the idempotency tables.
- `private.prune_stale_rows` is not executable by API roles and is not scheduled, because
  `pg_cron` is not installed.

Client: signed URLs are requested in batches with a 1 h lifetime, the catalogue is read in
pages, the glossary is no longer polled and combat polls every 20 s while realtime is
subscribed.

## Acceptance

| Criterion | Result |
| --- | --- |
| Supporting indexes; no unindexed foreign key on hosted | Met (0 of 87; still none reported after the second rollout recreated the keys to `auth.users`) |
| Rewritten policies return the same rows | Met by the existing denial tests, an independent predicate comparison and the hosted PRE row checks in RYT-119 |
| `created_at` on idempotency tables and a scheduled prune | Partly met: columns added; the prune is not scheduled and its first run needs owner approval (RYT-119) |
| Batched signing verified by a browser spec counting storage requests | Partly met: batching implemented; the counting spec is not written |
| Back-off for combat, trades and rest while realtime is connected | Partly met: combat only; trades, rest and campaign polling have no back-off yet |
| PRE then production migration verified | Met: applied to production on 2026-11-17 together with the RYT-113 migrations and mirrored to PRE with baseline row counts unchanged |

## Verification

Final run on the current tree, 2026-11-17: `npm run check` passed (627 unit and database tests,
build), format check clean, `npm run test:e2e` 680 passed, 59 skipped, 0 failed.

## Not done

Back-off for trades, rest and campaign polling; a browser spec counting Storage requests; the
first run of `private.prune_stale_rows`, which needs owner approval.
