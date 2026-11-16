# Delivery RYT-104: decimal gold, weight units, translations, catalogue import, containers and food

Status: done (2026-11-16; part 2 applied to production with the release). Decision record: ADR 043. Delivered together with RYT-102, RYT-103,
RYT-105, RYT-106 and RYT-107 in one integration; this file holds the shared database rollout,
checks and untested layers that the other five files reference.

## Outcome

Money is gp with two decimals in prices, listings, orders, sales, trades and character gold.
Weights are entered and shown in lb or kg (1 lb = 0.5 kg) with a per-account unit preference
(kg in Spanish, lb in English or "By language"). Items carry an optional hand-typed second
language. The DM imports the bilingual basic catalogue as campaign items and flags own items as
templates; the static template list is gone. Carried containers lighten the load and food and
drink add rations or water with undo.

## Scope and ownership

Migrations `supabase/migrations/20261120120000_items_decimal_catalogue_proposals.sql` (part 1)
and `20261121120000_items_player_authoring_close.sql` (part 2), the PRE maintenance file
`supabase/maintenance/items-player-authoring-close-pre.sql`, `src/shared/lib/{money,weight,
translations}.ts`, `src/shared/ui/decimal-draft.ts`, `src/features/inventory/**`, money fields
in `shops`, `trades` and `characters`, the Settings weight section and their tests. Non-goals
kept: online translation, a pp/sp/cp purse, autonomous release.

## Acceptance

| Criterion | Result |
| --- | --- |
| Whole-gold values read the same; two decimals end to end; more precision or negative refused | Met in code and SQL tests. Hosted part 1: 88 definitions intact and no fractional gold in production. Cents are accepted only after part 2 (`money_scale()` 2); production is still at 0 |
| 1 lb shows as 0.5 kg and back; three decimals round-trip; preference persists per user, defaults by language | Met. The preference is stored on the device per signed-in account, not in the database (ADR 043) |
| Second-language name and description with fallback; no translation request | Met; no translation service exists in the code |
| Import twice creates once and updates by key; static templates gone; helper offers imported and template items | Met. Update changes catalogue fields only, never price, image or the template flag (decision during delivery) |
| Worn backpack applies capacity and reduction; carried but not worn does not | Changed by decision: a container works while carried (it has no equipment slot); only the container that saves most applies; equipped gear and the container itself are never reduced. Acceptance amended in the backlog |
| Food or drink adds rations or water once per idempotency key; undo restores item and supply | Met, with two recorded rules: supplies come only from `dm` or `shop` stacks, and undo raises `Undo conflict` once the supply was spent |
| Denial tests for anon, outsider, Player and cross-campaign DM on every new table, column, storage path and RPC | Met on PGlite (`tests/database/items-economy.test.ts` and the updated inventory, item-lifecycle, shops, trades, characters and PRE suites) |
| PRE migration and tests before the production migration; production verified afterwards | Met. Part 1 applied ahead of the release; part 2 applied with it on 2026-11-16 and its switches verified in production (see Handoff) |
| 390px and 820px, both themes, both languages, keyboard and Escape, axe; independent UI review PASS | Met. Captures and axe clean; independent UI review PASS on the current source in round 2 (see below) |

## Verification

Commands and results reported by the integration on 2026-11-16 (not rerun while writing this
record).

Earlier run, before the design critique and UI review fixes:

- `npm run check`: passed. 65 unit test files, 501 tests; SQL suite on PGlite 25 files, 207 tests.
- `npm run test:e2e` (full): 599 passed, 0 failed, 53 skipped (configured viewport skips). This
  ran before a last small change to the trade gold field; afterwards the trades, shops,
  campaign-items, inventory and preferences specs were rerun: 126 passed.

Final checks on the reviewed source:

- `npm run check`: passed. 65 unit test files, 501 tests; SQL suite on PGlite 207 tests.
- `npm run test:e2e` (full): 605 passed, 0 failed, 53 skipped (configured viewport skips). This
  ran before two small character-sheet follow-ups; afterwards the character-sheet spec was
  rerun: 33 passed.
- More than 260 captures at 390px and 820px, Hearth with Spanish and Parchment with English,
  also at 150 % text size: axe clean and no horizontal overflow. They are kept with the local UI
  review record and are not part of the repository.

## Design critique and independent UI review

Design critique on the rendered result, 8 fixes: the supplies line is hidden on self-added
stacks; clearer "give an existing item" labels; danger colour contrast in the light theme; a
primary action in the no-match add state; two wrapped texts; two merely informative strings
removed; singular and plural of "add it".

Independent UI review, round 1: CHANGES_REQUIRED with 4 major and 8 minor findings. Major:

1. The once-per-turn mark read backwards (RYT-102).
2. Focus fell to the document body after "add them", "new turn" (RYT-102) and proposal step
   changes (RYT-105).
3. Spend options at zero uses looked active (RYT-102).
4. The shop add-items search was unusable at 150 % text size on 390px (RYT-107).

All 12 findings were fixed. Round 2 on the current source: PASS, with two new non-blocking
notes carried to RYT-108: "show all" in the shop add-items dock leaves focus on the document
body, and notification close buttons have no accessible name across the app (pre-existing).

Hosted rollout:

1. A rehearsal of part 1 ran in a rolled-back transaction.
2. Part 1 was applied to production and PRE in one transaction on 2026-11-16 (hosted history
   version `20261116002653`; the repository file keeps its `20261120120000` name).
3. Verified in production: 88 definitions intact, no fractional gold, `private.money_scale()`
   returns 0 and Player authoring is open, so the deployed frontend keeps working.
4. PRE additionally received the part-2 switches through the maintenance file (cents on, Player
   authoring closed). A `pre:sync` resets PRE to part-1 behaviour until the file is rerun.
5. Supabase security advisors after the apply: no errors; expected warnings for the security
   definer RPCs granted to `authenticated` and for `item_proposals` having RLS without
   policies (by design: RPC access only).

## Handoff and review

Security review findings fixed before the hosted apply: fractional amounts gated by
`private.money_scale()` instead of accepted at once; supplies no longer minted from
Player-sourced stacks; accepted proposals owned by the DM; Player edits frozen on items the DM
touched; undo conflict when supplies were spent; resale rounds down; explicit quantities for
proposal resolution; bounded proposal lists; SHA-256 of the import payload as idempotency key.

Known and accepted: Players can read `value_gp` of definitions they carry directly from the
table (pre-existing RLS read, not shown by the client); a merge performed before the release
would write a `merge` ledger kind the deployed frontend cannot parse (only the new interface
offers merging).

Untested layers: screen readers, iOS Safari and a real long-press, real Storage uploads and
signed URLs (shop images), PostgREST serialisation of `numeric` amounts, the new flows with real
accounts on hosted PRE and production, light themes other than Parchment, 1440px, and real
concurrency. PGlite runs real SQL, grants and RLS with an `auth.uid` shim only.

Part 2 (`20261121120000_items_player_authoring_close.sql`) was applied to production on 2026-11-16
(hosted version `20261116081923`) right after the pull request merged, and the frontend deployed
from main with the Quality workflow green. Verified in production: `money_scale()` returns 2,
Player authoring is closed, `anon` and `authenticated` cannot execute either switch and the 88
existing item definitions are unchanged.
Not exercised in production with real accounts: a Player `save_item_definition` call and a
catalogue import with cent prices; both are covered by the SQL tests and by PRE.
