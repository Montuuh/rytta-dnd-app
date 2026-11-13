# RYT-032 verification

Date: 2026-11-03. A worktree branch, based on `main` after
merging RYT-028..030. Decision record: [ADR 017, RYT-032 amendment](../../decisions/017-campaign-items.md).
Migration: `supabase/migrations/20261103140000_item_lifecycle.sql` (not applied to hosted
Supabase in this delivery).

## Automated checks

| Check | Result |
| --- | --- |
| `npm run check` (typecheck, lint, contracts, 112 unit/SQL tests, build) | Pass |
| `tests/database/item-lifecycle.test.ts` (PGlite, 5 tests) | Pass on first run |
| Full e2e on a temporary config (ports 4373/4374) | 264 passed, 3 failed (see below) |
| `identity.spec.ts` Google sign-in test on the standard config (4174) | 3 passed |
| Independent UI review | Pending (not run during implementation) |

The three failures on the temporary config are the Google sign-in tests that assert the
literal `127.0.0.1:4174` callback; they pass on the standard ports. The temporary config was
deleted afterwards.

Initial RYT-032 e2e failures, fixed before the final run: the drawer-placement assertion did
not allow for the stable scrollbar gutter; the open-order copy uses the plural for the two
fixture orders; the modal close buttons shared the "Conservar" / "Mantener precios" names
with the action buttons (now "Cerrar"); and the filled red delete button failed axe contrast
in the dark theme (now `--danger` with `--app-on-accent` text).

## SQL coverage (PGlite)

- Denial: anon gets `permission denied` on all three RPCs; outsider, same-campaign Player
  and other-campaign DM get `Forbidden`; another DM passing their own campaign id with this
  campaign's definition gets `Item unavailable` / `Invalid request`. Nothing changes.
- Archive: impact lists both shops with prices, one holder, two units; stale revision is
  refused; archive replays with the same key; a second archive is refused; both listings are
  archived with revision bumps; `grant_item` and `save_listing` refuse the item;
  `get_shop_admin` and the storefront hide it; the Player still reads their stack.
- Open orders: a pending purchase blocks archiving until the DM rejects it.
- Edits after archive keep `archived = true`.
- Price sync: only chosen listings change; replay returns the same result; a repeat with a
  new key updates 0 rows; a key reused with another price is a `Request mismatch`; a foreign
  listing, unknown id, negative price, empty list or archived listing rejects the whole call.
- PRE mirror: after a PRE refresh, the guarded block recreates the functions with
  `pre` / `pre_private` references only, anon is denied, a Player is `Forbidden`, and a DM
  sync changes `pre.shop_listings` but not `public.shop_listings`.

## Browser coverage (`tests/e2e/campaign-items.spec.ts`, desktop, 820px and 390px)

- Delete: blocked by open orders (button disabled, Escape returns focus), impact summary,
  axe, focus on "Conservar", archive, row removed, focus to "Nuevo objeto", holdings kept.
- Price sync: preview follows the value, the dialog lists both shops, unchecking one, a 503
  retry reuses the request id, one listing updated at 60 po.
- Add-to-shop drawer: right edge on desktop/tablet, bottom sheet on phone.
- Forge: live preview, radio category and rarity with ArrowRight, steppers, axe and 44px
  targets.
- DM "Añadir objeto": choice step, Escape returns focus, existing item with search and
  stepper, a 503 retry reuses the grant key, and "Crear nuevo" lands in Arin's satchel.
- Player: the satchel still opens the price-free forge directly.

Screenshots (390px and 820px): `forge`, `delete-impact`, `price-sync`, `shop-picker`,
`add-choose`, `add-existing` in this folder.

## Not tested

- Hosted Supabase (PRE or PROD): the migration has not been applied; PostgREST, real Auth
  sessions and the hosted PRE mirror block are untested. Generated types were not
  regenerated; `src/shared/api/item-functions.ts` is a reviewed overlay.
- Drag-and-drop onto the image drop zone was only exercised through the file input.
- Light theme and English were not captured in RYT-032 screenshots; i18n parity is covered
  by the unit catalog test.
