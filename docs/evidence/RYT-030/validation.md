# RYT-030 verification

Date: 2026-11-03. A worktree branch on `main` at `002d7f2`.
Decision record: [ADR 016, RYT-030 amendment](../../decisions/016-shops-merchants.md).
Frontend only: no migrations, RPCs or RLS changed.

## Automated checks

| Check | Result |
| --- | --- |
| `npm run check` (typecheck, lint, contracts, unit tests, build) | Pass |
| `npx playwright test tests/e2e/shops.spec.ts` (identity desktop/tablet/mobile) | 15 passed |
| `npm run test:e2e`, full suite | 240 passed, 3 failed (see below), then 3 passed |
| Independent UI review | Pending (not run during implementation) |

A parallel run held ports 4173/4174, so the full suite ran with a temporary copy of
`playwright.config.ts` on ports 5293/5294 (deleted afterwards). Three Google sign-in tests in
`identity.spec.ts` failed only because they assert the literal `127.0.0.1:4174` callback. Once
the default ports were free, those three tests passed on the standard config.

The first shops run failed 3 times because of one new assertion. The visually hidden
mode-help description counts as visible to Playwright. The assertion now checks that there is
no paragraph and that the badge has that accessible description.

New e2e coverage in `tests/e2e/shops.spec.ts`:
- The storefront shop picker is a select-only combobox. It lists the visible shops, marks the
  current one `aria-selected` and returns focus to the trigger on Escape.
- The mode badge has a focus/Escape tooltip and an accessible description, and the help
  paragraph is gone from the Player view.
- "Eliminar tienda" uses the Trash2 icon, the confirm modal is "¿Eliminar …?" with an
  "Eliminar" button, and the notice says "eliminada". Focus returns on Escape.
- The ledger refresh control and its freshness stamp.
- Order variants:
  - a purchase shows the label "Compra", the gold stripe and "Arin pagará";
  - after a counter-offer it shows "Contraoferta de compra", the hatched violet stripe, the
    struck asked total and the new total;
  - a Player sale shows "Venta", the blue stripe and "Recibirás".

New unit coverage: `orderVariant` and `askedTotal` in `src/features/shops/domain/shops.test.ts`.

## Rendered evidence

These are full-page captures from the e2e `audit()` helper at 390×844 and 820×1180, which also
checks axe and the 44px targets.

- `storefront-mobile.png`, `storefront-tablet.png`: the shop sign with the wax seal and the
  picker name. The mode badge sits beside the name on tablet and wraps below it on phones, and
  the three tabs fit on one row on phones.
- `player-orders-mobile.png`, `player-orders-tablet.png`: a sale (blue, "Recibirás"), purchase
  requests (gold, "Pagarás", with the list price struck against the offer) and completed
  purchases ("Pagaste").
- `ledger-counter-mobile.png`, `ledger-counter-tablet.png`: the "Esperando al jugador" view.
  It shows counter-offers with the hatched stripe and the "Pedía" struck total against the
  "Contraoferta" total, plus the refresh control and its stamp.
- `ledger-history-mobile.png`, `ledger-history-tablet.png`: a reverted purchase in history.
- `admin-shops-mobile.png`, `admin-shops-tablet.png`: the DM panel with no intro paragraph and
  the Trash2 delete control.

The screenshots were inspected. One defect was found and fixed: the struck "Pedía" total was not
struck through, because `GoldAmount` is inline-flex and blocks `<del>` decoration.

## Untested layers

- Hosted Supabase: the e2e tests use routed RPC fixtures. Polling cadence was checked in code,
  not against a live project.
- Light theme screenshots: tokens are defined, but light theme was not captured.
- Real touch devices: touch was emulated with Playwright `hasTouch`, and the tooltip tap toggle
  was not exercised.
- Independent UI verdict: pending, so `docs/evidence/ui-review-current.json` was not
  updated.
