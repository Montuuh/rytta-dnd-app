# RYT-119 — Hosted verification of open-sign-up hardening

Date: 2026-11-17. Target: hosted database, **PRE schema only** (`pre` / `pre_private`),
**transactions rolled back**. Covers migrations `20261122120000`, `20261123120000` and
`20261124120000`.

## Method

- Every batch that could write ran as a single anonymous block that collects its findings and
  ends by raising them as an exception, so the whole batch rolls back by itself. Nothing was
  committed. Nothing was written to `public`, `private`, `auth` or `storage`, not even inside a
  rolled-back transaction (`auth.users` was only read to build the simulated claims).
- Actors were simulated inside the transaction with the `authenticated` / `anon` role and
  `request.jwt.claims` of real accounts:
  - **DM of A** and **Player of A**: the two members of the only PRE campaign (campaign A).
  - **DM of B**: a real account that is not a member of A. PRE holds a single campaign, so this
    actor created campaign B (with a character, an encounter, a scene and a shop) through the
    application RPCs inside the rolled-back transaction.
  - **Outsider**: a real account that is a member of no PRE campaign.
  - **anon**: the `anon` role without a subject.
- Fixtures that PRE lacked were created inside the rolled-back transaction. Through application
  RPCs as the acting DM: campaign B and its rows, a hidden combatant (`add_combatants`), the
  encounter status changes, shops and a shop modifier. By direct statement as table owner: one
  item definition, inventory item and glossary entry per campaign, one trade in A (pool character
  with the Player's character), the quota limit values in `pre_private.quota_limits`, and the
  active turn pointing at the hidden combatant (no RPC ever gives a hidden combatant the turn).
- `prune_stale_rows` was not executed. The storage check is a plain `EXPLAIN` (no `ANALYZE`).

## Results

Counts are written `visible rows / visible rows of campaign A`.

| # | Check | Actor | Expected | Observed | Result |
|---|-------|-------|----------|----------|--------|
| 1 | `pre.encounters` select (A draft, then initiative, then active) | Player of A | 0 rows | 0/0 in all three states | PASS |
| 1 | `pre.encounters` select | DM of A | rows of A | 1/1 | PASS |
| 1 | `pre.encounters` select | DM of B | none of A | 1/0 (own B encounter only) | PASS |
| 1 | `pre.encounters` select | Outsider | 0 rows | 0/0 | PASS |
| 1 | `pre.encounters` select | anon | permission denied | `42501 permission denied for table encounters` | PASS |
| 1 | `pre.encounters` update | Player of A | refused | `42501 permission denied for table encounters` | PASS |
| 1 | `pre.encounter_signals` select, A in draft | Player of A | 0 rows (drafts are DM-only) | 0/0 | PASS |
| 1 | `pre.encounter_signals` select, A and B in initiative | Player of A | A only | 1/1 (owner sees 2/1); status `initiative`, later `active` | PASS |
| 1 | `pre.encounter_signals` columns | Player of A | no combat secret | `encounter_id, campaign_id, status, revision, updated_at` — no name, summary or active turn | PASS |
| 1 | `pre.encounter_signals` insert / update / delete | Player of A | refused | `42501 permission denied for table encounter_signals` for each | PASS |
| 1 | `pre.encounter_signals` select | DM of A / DM of B / Outsider / anon | A / B only / none / denied | 1/1, 1/0, 0/0, `42501 permission denied` | PASS |
| 2 | `get_combat_state` (encounter id and null), initiative | Player of A | data without the hidden combatant | role `player`, 6 combatants; hidden name absent; hidden id absent | PASS |
| 2 | `get_combat_state` | DM of A | hidden combatant included | 7 combatants; hidden name present | PASS |
| 2 | `list_encounters` | Player of A / DM of A | count excludes hidden / includes it | 6 / 7 combatants | PASS |
| 2 | `get_combat_state`, hidden combatant holds the turn | Player of A | `active_combatant` null, nothing marked active | `active_combatant` null; 0 combatants flagged active; hidden id and name absent | PASS |
| 2 | `get_combat_state`, hidden combatant holds the turn | DM of A (full view / table view) | id visible / masked | hidden id returned / null and name absent | PASS |
| 2 | Combat RPC result (`set_initiative`) | Player of A | secret-free result | `{status: initiative, round: 0, revision: 7, active_combatant: null}` | PASS |
| 2 | `pre_private.combat_result` with a hidden active turn | Player claims (helper called as owner) | `active_combatant` null | null; Player has no execute on the helper | PASS |
| 2 | `list_encounters` / `get_combat_state` on campaign B | Player of A | refused | `42501 Forbidden` for both | PASS |
| 2 | `list_encounters` | anon | refused | `42501 permission denied for function list_encounters` | PASS |
| 3 | `set_shop_modifier(B, shop of A, character of A, 0)` | DM of B | refused | `42501 Shop unavailable` | PASS |
| 3 | `set_shop_modifier(B, shop of A, character of A, 25)` | DM of B | refused | `42501 Shop unavailable` | PASS |
| 3 | `set_shop_modifier(A, shop of A, character of A, 0 and 25)` | DM of B | refused | `42501 Forbidden` for both | PASS |
| 3 | `set_shop_modifier(B, shop of B, character of A, 0 and 25)` | DM of B | refused | `42501 Character unavailable` for both | PASS |
| 3 | `set_shop_modifier(A, ...)` | Outsider / Player of A | refused | `42501 Forbidden` for both | PASS |
| 3 | Modifier of A after all attempts | — | unchanged (10 %) | still one row, campaign A, 10 % | PASS |
| 3 | Control: own shop and character | DM of B | accepted | accepted (15 %) | PASS |
| 4 | `create_campaign`, limit = owned + 1 | DM of A | first accepted, second refused | created, then `P0001 Campaign limit` | PASS |
| 4 | `create_campaign` while DM of A is at the limit | Outsider | unaffected | created | PASS |
| 4 | `save_tabletop_scene` (new), limit = scenes + 1 | DM of A | first accepted, second refused | created, then `P0001 Scene limit` | PASS |
| 4 | `invite_campaign_member`, seats = members + 1 | DM of A | first accepted, second refused | created, then `P0001 Member limit` | PASS |
| 4 | `invite_campaign_member`, hourly limit = sent this hour | DM of A | refused | `P0001 Too many invitations` | PASS |
| 4 | `invite_campaign_member`, pending-per-inviter = pending | DM of A | refused | `P0001 Too many invitations` | PASS |
| 4 | `invite_campaign_member`, pending-per-recipient = 1, same address already invited to A | DM of B | refused; another address accepted | `P0001 Recipient invitation limit`; other address created | PASS |
| 4 | `create_own_character`, per-user limit = live characters + 1 | Player of A | accepted, then refused | created, then `P0001 Character limit` | PASS |
| 4 | Archive one character, create again | Player of A | accepted (archived rows are not counted) | archived, then created (rows: live, archived, live) | PASS |
| 4 | `create_character`, per-campaign limit = current count (archived included) | DM of A | refused | `P0001 Character limit` | PASS |
| 4 | `pre_private.quota_limits` table privileges | anon / authenticated | none | none | PASS |
| 5 | campaigns | DM A / Player A / DM B / Outsider | A / A / B only / 0 | 1/1, 1/1, 1/0, 0/0 | PASS |
| 5 | campaign_members | same | all of A / own row / B only / 0 | 2/2, 1/1, 1/0, 0/0 | PASS |
| 5 | characters | same | all of A / own / B only / 0 | 2/2, 1/1, 1/0, 0/0 | PASS |
| 5 | character_sheets | same | all of A / own / B only / 0 | 2/2, 1/1, 1/0, 0/0 | PASS |
| 5 | item_definitions (seeded) | same | A / none (not carried, not authored) / B only / 0 | 1/1, 0/0, 1/0, 0/0 | PASS |
| 5 | inventory_items (seeded on the pool character) | same | A / none / B only / 0 | 1/1, 0/0, 1/0, 0/0 | PASS |
| 5 | trades (seeded, Player's character is a party) | same | A / own trade / 0 / 0 | 1/1, 1/1, 0/0, 0/0 | PASS |
| 5 | tabletop_scenes | same | A / none (DM-only table) / B only / 0 | 2/2, 0/0, 1/0, 0/0 | PASS |
| 5 | glossary_entries (seeded; glossary module is off for players in A) | same | A / none / B only / 0 | 1/1, 0/0, 1/0, 0/0 | PASS |
| 5 | All eleven tables above plus encounters and signals | anon | permission denied | `42501 permission denied for table ...` on every table | PASS |
| 6 | `private.prune_stale_rows()` execute privilege (not executed) | anon / authenticated / service_role | false | false / false / false (ACL: owner only) | PASS |
| 6 | `pre_private.prune_stale_rows()` execute privilege (not executed) | anon / authenticated / service_role | false | false / false / false (ACL: owner only) | PASS |
| 7 | `private.storage_quota_ok(text, text)` execute privilege | anon / authenticated | false / true (storage policy helper) | false / true; service_role false | PASS |
| 7 | Per-campaign count and byte query plan | — | no sequential scan | Index Scan on `objects_bucket_id_name_version_key` with a range condition on `bucket_id` and the name prefix | PASS |
| 7 | Per-owner byte query plan (`name like any(prefixes)`) | — | no sequential scan | Bitmap Index Scan on `objects_bucket_id_name_version_key` by `bucket_id` only; the prefixes are applied as a filter | PASS (see note) |
| 8 | Security advisors | — | no ERROR | 0 ERROR. WARN: `authenticated_security_definer_function_executable` 141 (all `public`), `auth_leaked_password_protection` 1. INFO: `rls_enabled_no_policy` 43 | PASS |
| 8 | Performance advisors | — | no ERROR | 0 ERROR, 0 WARN. INFO: `unused_index` 159 | PASS |

Notes:

- Check 1: a draft encounter produces no signal row for Players by policy; the signal became
  visible to the Player as soon as the DM moved the encounter to initiative.
- Check 7: `storage.objects` holds 22 rows, so the planner's choice is only indicative. The
  per-campaign query is bounded by the name prefix. The per-owner query is bounded by the five
  application buckets but not by the prefixes, so its cost grows with the total number of objects
  in those buckets, not with one owner's objects.
- Check 8: the 141 warnings are the application RPCs that signed-in users are meant to call; the
  43 notices are RPC-only tables with RLS enabled and no policy.

## Unchanged data

Row counts before and after the verification:

| Table | `pre` before | `pre` after | `public` before | `public` after |
|-------|-----|-----|-----|-----|
| campaigns | 1 | 1 | 3 | 3 |
| campaign_members | 2 | 2 | 11 | 11 |
| characters | 2 | 2 | 15 | 15 |
| encounters | 1 | 1 | 3 | 3 |
| campaign_invitations | 2 | 2 | 11 | 11 |
| tabletop_scenes | 2 | 2 | 1 | 1 |

Also confirmed after the run: every `pre_private.quota_limits` value is back at its default, the
PRE encounter is still `draft` at revision 4, and no probe combatant, shop, item definition or
glossary entry remains.

## Not verified by this method

- Realtime delivery filtering (only the table policy and columns of `encounter_signals` were
  checked, not what a subscribed client receives).
- The rejection text of a real Storage upload over a quota; only the helper's privileges and
  query plans were inspected, and the helper was not exercised against real objects.
- True concurrency of the advisory locks: all checks ran in one session, so quota races between
  simultaneous transactions were not reproduced.
- The masked result of a Player-called combat RPC while a hidden combatant holds the turn was
  checked through the shared result helper under the Player's claims, not through a Player RPC
  call in that state.
- Production (`public` / `private`) behaviour was not exercised; only row counts, function
  privileges and advisors were read there.

## Second rollout (account deletion, alias masking)

Applied to the hosted project on 2026-11-17, in order, each file passed unchanged and each apply
transactional. All four succeeded on the first attempt.

| Hosted version | Name |
|----------------|------|
| 20261117063453 | account_deletion_export |
| 20261117063556 | table_view_class_key_alias_mask |
| 20261117063639 | tabletop_alias_mask |
| 20261117063840 | account_deletion_prepare_combat_leave_mask |

Before the first apply the migration history ended with `open_signup_hardening`,
`scalability_indexes_policies_retention` and `quota_bytes_invitation_caps_combat_mask`.

### Catalog checks after each apply

1. `account_deletion_export`
   - `export_my_data`, `account_deletion_blockers`, `account_storage_paths` and `delete_my_account`
     exist in `public` and `pre`, all security definer with `search_path = ""`; EXECUTE is false
     for `anon` and true for `authenticated`.
   - Foreign keys to `auth.users` by delete action, before -> after: `public` and `pre` each went
     from 15 NO ACTION / 1 CASCADE / 6 SET NULL to 0 NO ACTION / 2 CASCADE / 20 SET NULL;
     `private` and `pre_private` keep 1 CASCADE each. No NO ACTION key to `auth.users` remains in
     `public`, `pre`, `private` or `pre_private`.
   - `campaigns.owner_id`, `campaign_invitations.created_by` and `item_proposals.proposed_by` are
     nullable in `public` and `pre`; so are `rest_requests.requested_by` and `rest_votes.voted_by`.
   - `account_deletion_requests` (`private` and `pre_private`) has RLS enabled and no grants to
     `anon`, `authenticated`, `service_role` or PUBLIC. The `members_release_characters` trigger
     exists on `campaign_members` in both environments.
2. `table_view_class_key_alias_mask`
   - `get_combat_state` in `public` and `pre` contains `class_key`; EXECUTE `anon` false,
     `authenticated` true.
   - `combat_log` exists in `private` and `pre_private`, records `target_alias`, and has no
     EXECUTE for `anon` or `authenticated`.
3. `tabletop_alias_mask`
   - The definition of `get_tabletop` changed in `public` and `pre` (definition hash differs before
     and after); EXECUTE is granted to `authenticated` only (not `anon`, not `service_role`).
4. `account_deletion_prepare_combat_leave_mask`
   - `prepare_account_deletion` exists in `public` and `pre` (`search_path = ""`, EXECUTE
     `authenticated` true, `anon` false).
   - `prune_stale_rows` (`private` and `pre_private`) has no EXECUTE for `anon`, `authenticated` or
     `service_role` (owner only) and its definition mentions `account_deletion_requests`.
   - `account_deletion_requests.result` is nullable and `prepared_campaigns` exists, both
     environments. No scheduler extension and no cron job exist.

After every apply the row counts of campaigns, campaign_members, characters, encounters,
campaign_invitations and tabletop_scenes in `public` and `pre`, the Auth user count (7) and the
Storage object count (22) were identical to the baseline.

### Actor checks (hosted PRE only, each in one rolled-back block)

Actors were simulated with the `authenticated` role and the request claims of an existing PRE
member; `auth.uid()` on hosted reads `request.jwt.claim.sub` first and `request.jwt.claims` second,
and both were set. Every block ended with a raised exception, so nothing was kept.

- a. Export, PRE Player: PASS. Format `rytta-account-export`, environment `pre`, nothing truncated.
  Rows per section: memberships 1, characters 1, invitations 2, character_events 1; inventory,
  shop_orders, trades, item_proposals, rest_requests, inventory_events, combat_events,
  item_definitions, glossary_entries and content_packs 0. The profile is the caller's; no other
  Auth user's id or email, no other member's membership, no pool character and no `value_gp` or
  `dm_notes` key appear anywhere in the payload. As `anon`: `42501 permission denied for function
  export_my_data`.
- b. Blocked deletion, PRE DM (only DM, one other active member): PASS.
  `account_deletion_blockers()` lists the PRE campaign with 1 other member.
  `prepare_account_deletion` returns 1 blocker, 0 campaigns, 0 storage paths, 0 revoked
  invitations; the invitation rows are identical before and after and no request row was
  written (0 -> 0). `delete_my_account('DELETE', same id)` raises `P0001 Account deletion blocked`.
- c. Deletion, PRE Player: PASS. Wrong confirmation word raises `22023 Confirmation required`; an
  unprepared request raises `22023 Account deletion not prepared`. After prepare (0 blockers,
  0 campaigns) the deletion returns `deleted = true`, `data_deleted = true`, environment `pre`,
  `auth_user = 'shared'`, 0 campaigns deleted, 1 campaign left. Inside the block afterwards: the
  Player has 0 membership rows (PRE members 2 -> 1), their 1 character is back in the pool and
  active (0 archived, 0 still owned), the 2 invitations addressed to their email are gone
  (2 -> 0), PRE campaigns stay at 1 and characters at 2, no audit row still names them as actor.
  Every counted `public` table (campaigns, members, characters, encounters, invitations, scenes,
  profiles, character events, inventory items, deletion requests) is unchanged, the Auth user
  count stays at 7 and the Player's Auth user still exists.
- d. Alias masking in PRE: PASS. Setup inside the block: PRE has a single draft encounter whose
  only character combatant was a pool character, and the map is not a Player module there, so the
  owner connection added a second Player member, enabled the map module for Players, gave the
  Player's character (class monk) a portrait path, and linked the existing combatant (which already
  has a token on a PRE scene) to that character with a public alias. The alias was set by a direct
  owner update because `update_combatant` rejects `public_name` for character combatants. The DM
  then opened initiative and put the scene live through the application functions
  (`set_encounter_status`, `set_tabletop_live`).
  - Another Player, player view and table view: the combat row shows the alias as name and has no
    `image_path`, no `class_key`, no `character_id`, no hit points or armor class, band `unknown`;
    the real name appears nowhere in the combat payload. The token label equals the alias,
    `character_id` is null, `controllable` false, no `srd_id`; neither the real name nor the
    character id appears anywhere in the map payload.
  - DM on the table screen and the owning Player on the table screen: same masked result (the
    owner's token stays `controllable`).
  - Owning Player off the table screen: own row with `class_key = monk`, portrait, `character_id`
    and vitals; token with the real name and `character_id`.
  - DM full view: real name, `class_key = monk`, portrait, `character_id`, hit points and armor
    class in combat; the map returns all 8 stored items (7 for the other viewers) in their stored
    form, including the token's combatant link.

After the four blocks the baseline was re-read and is identical: table counts `public` 40 and
`pre` 40 (unchanged), `private` and `pre_private` 11 (10 before; the new
`account_deletion_requests` table), policies 36 and 36, all row counts as in the table above, Auth
users 7, Storage objects 22. The PRE encounter is still `draft` at revision 4, no combatant has an
alias, no scene is live, Players' modules are unchanged, no portrait path is set and both
`account_deletion_requests` tables are empty.

### Advisors

- Security: no ERROR. `authenticated_security_definer_function_executable` WARN 146 (intended RPC
  design; it lists the new `export_my_data`, `account_deletion_blockers`, `account_storage_paths`,
  `delete_my_account`, `prepare_account_deletion` and the replaced `get_combat_state` and
  `get_tabletop`), `rls_enabled_no_policy` INFO 45 (includes both `account_deletion_requests`
  tables, which are owner-only by design), `auth_leaked_password_protection` WARN 1.
- Performance: no ERROR or WARN. `unused_index` INFO 140, including the new
  `account_deletion_requests_created_at` index in both environments. No unindexed foreign key is
  reported after the keys to `auth.users` were recreated.

### Not verified in the second rollout

- Production (`public` / `private`) behaviour of the new functions: only catalog state, privileges,
  row counts and advisors were read there. In particular the removal of the Auth user by
  `public.delete_my_account` (results `deleted`, `disabled`, `kept`) was never exercised.
- A deletion that removes a solo campaign, the revocation of its pending invitations by
  `prepare_account_deletion`, `account_storage_paths` with real objects, ownership hand-over to
  another DM, request replay and the `Request mismatch` path (PRE has one campaign with two
  members and no solo campaign).
- The browser-side Storage cleanup, and `storage_quota_ok` for a campaign without owner.
- Deleting an Auth user directly (cascade, set null and the release trigger on real rows).
- The combat log rules for combatants removed while hidden or under an alias, and
  `prune_stale_rows`, which was not executed.
- Calls through the HTTP API with real tokens, realtime delivery, and concurrent transactions; all
  checks ran as SQL in a single session with simulated claims.

## Status

In progress (2026-11-17). Hosted PRE actor checks and the production catalog checks are done
for both rollouts. Still open against the acceptance criteria: realtime delivery filtering for a
subscribed Player, the rejection text of a real Storage upload over the byte quota, true
concurrency at the seat cap, a recorded decision or accepted risk for the per-recipient
invitation flood trade-off, and scheduling or a first run of `private.prune_stale_rows`
(`pg_cron` is absent; the first run needs owner approval). Production Auth-user removal by
`delete_my_account` is also unverified (see RYT-115 and the launch checklist RYT-122).
