# RYT-156 — Players cannot read value_gp of the items they carry

Two phases with a release between them: column grants are per role, so `value_gp` can only be
closed to Players once no deployed frontend selects it from the table.

## Phase 1 (2026-11-20): a DM-only read path and a frontend that stops selecting the column

- Migration `supabase/migrations/20261214120000_item_values_dm_read.sql` adds
  `public.get_item_values(campaign)`: definition id to value for the campaign DM, an empty object
  for any other member, Forbidden for anyone else. Additive; no table, policy or grant change.
- Frontend: `src/features/inventory/data/repository.ts` no longer selects `value_gp` from
  `item_definitions`; the inventory and the catalogue read the values through the new RPC and
  merge them. The DM sees the same values as before; Players get none, as the interface already
  showed. Basic-item prices and shop prices keep their own paths.

### Verification

- SQL (`tests/database/trades.test.ts` "RYT-156 gives item values to the campaign DM only",
  public and PRE): the DM reads the potion's 50 gp; the three Players get an empty object; an
  outsider is refused, still refused once DM of their own campaign (which has no such value); a
  Player whose membership is no longer active is refused; anon is denied.
- Unit (`repository.test.ts`): the catalogue merges a value from the DM read and leaves the rest
  empty, across the paged read.
- Browser (`inventory.spec.ts` "RYT-156 no item definition read asks the table for value_gp"): a
  Player's inventory sends no `item_definitions` select with `value_gp` and reads values through
  the RPC. Inventory, shops, campaign items and trades specs at 390 and 820 px: 114 passed.
- `npm run check`: 1131 tests passed. No interface change; the UI review snapshot is unchanged.

- Security review before production: go, no high or critical finding. Applied from it: the
  cross-campaign DM and inactive-member denial tests. Recorded: Players keep seeing basic-item
  prices through `search_campaign_items`, as the ticket intends, including a price the DM edits.
  The RPC returns every valued definition of the campaign in one call (not measured at scale).
- Hosted (2026-11-20), before any frontend deploy (the client fails without the RPC): applied to
  `rytta-staging`, then production. Stored md5 `585a9ab4b3fce0c918e42136377f0c13`, 2313
  characters, equal to the committed LF file. Production has `public.get_item_values` and
  `pre.get_item_values`, security definer, execute for authenticated and not for anon; staging has
  no PRE.

## Phase 2 (after phase 1 is deployed to production)

Not started. Checklist from the review:

1. Confirm the deployed bundle (or PostgREST logs) no longer selects `value_gp` from the table.
2. In `public` and, when it exists, `pre`: revoke table select from `authenticated` and grant
   select on every other column, listed from `pg_attribute` per schema (a column-only revoke has no
   effect while the table grant exists). `anon` keeps no privilege.
3. Check that a PRE refresh (`pre:sync --replace-pre`) copies the column grants and does not restore
   the table grant; add a PGlite test for a PRE copied after the migration.
4. Contract tests: `has_column_privilege` false for `value_gp`, true for the rest; Player, outsider,
   anon and another campaign's DM get permission denied on `value_gp`; Players still read their
   definitions; the DM still gets values via `get_item_values` and `get_shop_admin`; basic-item and
   listing prices unchanged.
5. Document in `docs/security.md` that a new `item_definitions` column needs an explicit column grant
   in both schemas. Re-check no views or realtime publication cover the table; run the security
   advisors. Browser: the DM storeroom and shops still show values.
6. Apply staging, then production, recording the order.
