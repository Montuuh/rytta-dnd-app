# RYT-125 — Player journey fixes: inventory, shops and trades

Delivered in `f34c726` (merged to main through PR 13 on 2026-11-18, live on rytta.pages.dev).

## Item value decision (J3-34)

No other decision was given by the owner, so the scoped default stands and is applied: an item's
value (`value_gp`) is shown only to the DM on the item card (`item-card.tsx`, DM-only fact), and
the Player's Sell tab speaks of the shop's offer ("La tienda ofrece {{value}} po por unidad") rather
than an item value. Hiding `value_gp` from Players at the database level is RYT-109.

## Verification

- Unit: `amount.test.ts` (the shared 44 px stepper clamps, states why and rejects separators),
  `inventory/data/repository.test.ts` and `trade.test.ts`.
- Browser: `inventory.spec.ts`, `shops.spec.ts` (cart survives reload, money errors where the
  action is, confirmations), `trades.spec.ts` and `campaign-items.spec.ts` at 390 and 820 px.

## UI review

The independent UI review of the four journey tickets ran on 2026-11-18: the first pass returned CHANGES_REQUIRED (wizard ability increases left unasked, class-loss notice out of view, item facts at 150 % text and others); the focused re-review the same day passed at 390 and 820 px in both themes and languages. Its remaining notes were minor (campfire arc rarely used, long names in rest rows).
