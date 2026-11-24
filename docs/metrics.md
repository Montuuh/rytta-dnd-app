# Activation and return figures

RYT-147. Rytta has no analytics scripts. The owner measures whether tables start playing and come
back with one read-only, aggregate query over the service data:
[`scripts/reports/activation-return.sql`](../scripts/reports/activation-return.sql).

## Definitions

- **Cohort**: campaigns created since the launch (2026-11-18), grouped by the UTC week (Monday) of
  their creation.
- **Activated**: within 14 days of its creation, the campaign started an encounter (initiative or
  active) at a moment when it already had a second member.
- **Solo preparation**: an encounter started within those 14 days, but always with the DM alone.
  Counted apart, never as activation.
- **Returned**: an activated campaign whose DM did something on another UTC day within 28 days of
  the activation. DM activity is any campaign, character, inventory or encounter event, encounter,
  item definition, scene, invitation or glossary entry authored by a DM of that campaign.
- **Settled**: a cohort's activation figure counts only campaigns whose 14 days have passed;
  return counts only activations whose 28 days have passed. `returned_so_far` counts returns that
  already happened in open windows.

## Exclusions

- Demo content never reaches the database (the demo runs in the browser).
- Test accounts (`raw_user_meta_data.rytta_test_account`, see [test accounts](test-accounts.md)).
- The owner's own accounts, marked with `raw_app_meta_data.rytta_internal = true` in Auth (only
  the project owner can set app metadata). Campaigns owned by, or with a DM that is, an excluded
  account are left out.
- Campaigns created before the launch.

## Running it

1. Open the production project as the owner (database connector or SQL editor).
2. Run the file as it is. To evaluate it at another moment, run
   `select set_config('rytta.report_now', '2026-12-31T00:00:00Z', false)` first in the same session.
3. Keep only the result table: one row per cohort week and a `total` row with counts, denominators
   and percentages. It never holds an id, a name or an address.

It creates nothing: no table, function, view or grant, and no migration. Nothing is exposed to
`anon` or `authenticated` callers. `tests/database/activation-report.test.ts` checks the
definitions with known campaigns.

## Limits

- Event tables kept short by retention (`private.prune_stale_rows`, when scheduled) can hide old DM
  activity; the 28-day window is within the shortest retention.
- Members who left and were removed no longer count as the second member.
- Very small cohorts make percentages unstable; read them with their denominators.
