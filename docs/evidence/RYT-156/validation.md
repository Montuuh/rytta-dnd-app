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

## Phase 2 (2026-11-20): the column is closed to clients

- Release: the owner asked to merge the release pull request (#35, merge commit `73a367f`, CI
  green). The deployed bundle at rytta.pages.dev selects `item_definitions` only with an explicit
  column list without `value_gp`, plus `image_path` and `id`, and reads values through
  `get_item_values`.
- Migration `supabase/migrations/20261215120000_item_values_column_closed.sql`: in `public`, `pre`
  and any `pre_backup_*` schema with the table, the table-level select is revoked from
  `authenticated` and select is granted on every other column (listed per schema from
  `pg_attribute`). `docs/security.md` records that a new column needs its own column grant.
- Checked hosted before writing it: no view, realtime publication, `pg_graphql`, invoker function
  or policy on another table reads `item_definitions`; its only trigger is unaffected.

### Verification

- SQL (`tests/database/trades.test.ts` "RYT-156 closes value_gp to clients on the table, also in a
  PRE refreshed afterwards"): `authenticated` may select every column but `value_gp`; `anon` has
  nothing; the DM, a Player and an outsider are refused `value_gp` from the table and anon is
  refused the table; the Player still reads the definitions they carry; `get_item_values` still
  gives the DM the value and the Player nothing; the same holds in PRE and again after a
  `--replace-pre` refresh. `inventory.test.ts` and `scalability.test.ts` now read only granted
  columns (they asserted the old open read). All database tests: 496 passed.
- `npm run check`: 1132 tests passed. Inventory and shops browser specs at 390 px: 27 passed.
- Security review before production: go, no medium or higher finding. Applied from it: PRE backup
  schemas get the same shape, so a later restore does not reopen the column, and the migration
  notes that re-running it grants every column present at that time except `value_gp`. Known: a
  tab still running a frontend from before phase 1 gets a permission error on the inventory until
  it reloads.
- Hosted (2026-11-20): applied to `rytta-staging`, then production. Stored md5
  `7ab4eaf738444afcdf035aa0a5118d2a`, 2059 characters (the committed LF file without its final
  newline). Production `public` and `pre`: no table select for `authenticated` or `anon`, no
  `value_gp` select, every other column selectable; staging has no PRE and no backups. A check run
  as `authenticated` on production read the granted columns and was refused `value_gp` and `*`.
  Security advisors show no notice on these objects.
- Not tested: a signed-in session on rytta.pages.dev after the change (the bundle was checked, not
  driven) and PostgREST's HTTP status for a refused column.
