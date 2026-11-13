# RYT-005 verification: shops, purchases, sales and revert

Delivery of ADR 016 on top of the merged RYT-004 inventory (ADR 014).

## Process note

The first implementation pass was planned on a local `main` 17 commits behind `origin/main`
and duplicated RYT-004 with a different schema. It was found before any hosted change, backed
up outside the repository and discarded. Shops were rebuilt on the RYT-004 tables. Every delivery now starts with
`git fetch` + `git pull --ff-only` and a hosted migration-history check before planning.

## Local verification

- `npm run check`: typecheck, lint, architecture, docs contracts, 17 unit/SQL files with
  102 tests, production build.
- `tests/database/shops.test.ts` (PGlite, 9 tests): denial matrix for anon, outsider, other
  Player and cross-campaign DM on every read and write RPC and on direct table access; hidden
  shops, hidden listings and other characters' exclusives absent; `value_gp` not returned to
  Players; server prices with modifiers; idempotent retry and request mismatch; insufficient
  gold rolls back; last unit cannot be bought twice; approval → counter-offer → accept, DM
  approval re-validates gold, reject and cancel move nothing; sales only of loose dm/shop units
  (a Player-made item cannot be sold or listed); purchase events are not undoable from the
  inventory; revert of a partly used and equipped purchase refunds the remaining shop units and
  restocks, and a second revert is rejected.
- `tests/database/pre.test.ts`: the PRE ETL clones the 22 tables including the shop tables.
- Unit tests (`src/features/shops/domain/shops.test.ts`): modifier rounding, cart totals with
  offers, weight in tenths, cart reconciliation with stock, effective line price, filters,
  ownership and sellable units.
- `tests/e2e/shops.spec.ts` (HTTP fixture over the RYT-004 inventory fixture) at 390, 820 and
  1440 px: Player cart purchase with gold before→after and the bought stacks in the inventory
  satchel and ledger; approval shop counter-offer accept, request with offer and message, sale
  proposal; Player without the module; DM shop creation with per-character access, adding stock
  from the catalog, counter-offer, revert. Each audited screen checks axe (WCAG 2.1 AA), 44px
  targets and no horizontal overflow.
- Full `npx playwright test`: 189/192 on the first run. The 3 failures were one RYT-025
  assertion that "Tiendas" is not a navigation item (it was a planned module and is now
  implemented); the assertion now uses Misiones and passes.

## Hosted Supabase (`ekscdsmniukuxqjixapu`)

- Before: history ended at `inventory_equipment`; production held 5 item definitions and 4
  stacks, PRE none; no shop tables in either schema. `inventory_events_kind_check` had the same
  name in `public` and `pre`.
- PRE first: the migration was applied to `pre`/`pre_private` through `pre_admin.remap`.
  Rolled-back probe: `shops=1 listings=1 buy=completed gold 50→40 second=Out of stock
  undo=Not undoable direct=permission denied outsider=Forbidden revert=reverted refunded=10
  gold_final=50`.
- PROD: applied migration `shops` (non-destructive: new tables and functions, widened check).
  The stored statements match the repository file (md5 `fc42b4e3e75e4916d308728356202264`,
  49 500 bytes). Rolled-back probe: `shops=1 listings=1 buy=completed gold_delta=40
  second=Out of stock undo=Not undoable direct=permission denied outsider=Forbidden
  anon=permission denied revert=reverted refunded=10 gold_final_delta=50`. Afterwards both
  schemas hold 0 shops and no probe definitions.
- Security advisors: only accepted patterns (intentional `security definer` RPCs callable by
  `authenticated`, RPC-only tables with RLS and no policies, Auth leaked-password protection).

## Not verified

- Real concurrent transactions on hosted Postgres (PGlite runs them sequentially; the campaign
  row lock serializes them by design).
- Two real Google accounts buying and approving on hosted Supabase; realtime (RYT-013) — new
  requests appear through 20 s polling; iOS Safari.

## UI review

Independent UI review (report: `reviewer/review.md`, screenshots alongside):

1. Initial review: CHANGES_REQUIRED. Majors: focus dropped to the body after the shop editor,
   counter-offer and revert; one-tap archive without confirmation; zero-gold sales allowed;
   "you own N" was not a link to the inventory; the cart showed only the load after buying;
   the ledger heading and tab badge counted different things. Minors: titles ignored the order
   status, missing plurals, a clipped duplicate cart button at 150% text, hard-to-read price
   hints, no scroll fade on the phone shop switcher, an unused character picker and a global
   alert close-button override.
2. All findings fixed; `tests/e2e/shops.spec.ts` now also asserts focus after archive, counter
   and revert, the archive confirmation with Escape, the inventory link and the zero-gold
   exclusion (12/12 on desktop, tablet and mobile, three consecutive runs).
3. Focused re-review: **PASS** at 390 and 820 px (source digest
   `43c33bd0b257ee6e41e67c1c63c15648e98a6998d63a48e0911571939161eab1`), recorded in
   `docs/evidence/ui-review-current.json`. Non-blocking leftovers: after a counter-offer or
   revert focus returns to the page heading rather than near the order (R1), and the cart row
   label still reads "Load after buying" although it shows before → after (R2).

The reviewer's fixture crash when listing orders of an archived shop was a fixture gap (the
SQL ledger joins archived shops); the fixture now keeps archived shops for the ledger.

4. DM UX pass (user request: easy shop creation, access and visibility, item assignment,
   price/stock/name edits, ledger revert and counter-offers with modern widgets). The panel
   was redesigned around inline auto-saving controls (ADR 016 §5). Review: CHANGES_REQUIRED
   (auto-save could drop rapid changes and the resale slider could show an unsaved value;
   off-screen feedback; focus lost opening inline panels; overflow at 150% on phones; minors).
   Fixes: coalescing auto-save (`use-auto-save.ts`), a fixed save pill, inline panel focus and
   Escape, wrapping segments, hidden no-value items, labelled sliders, kept unsaved edits and a
   two-tap reject. Re-review: CHANGES_REQUIRED (reject confirmation focus and contrast; pill
   height; counter focus timing), fixed. Re-review 2: **PASS** (digest
   `1a0e3f0b23fdad52ec31db0fc41a69227268aa843eaf4aca5673bc5ff92a47b2`). Non-blocking: the
   pill briefly covers the bottom of the page on phones and truncates long messages to one
   line (the live region carries the full text).

## Full browser suite

`npx playwright test` on the final source: 195/195 (`npm run check`: 102 tests and build).
An earlier run had one failure in `characters.spec.ts:193` (profile menu Escape focus on
`identity-tablet`) that also failed on a clean `origin/main`; it is intermittent and outside
RYT-005.
