# RYT-109 — Trade members see the pictures and descriptions on the table

The value_gp protection that started in this ticket moved to RYT-156 on 2026-11-20: revoking the
column breaks the deployed frontend (the DM reads values through the same table select), so it
needs a release between its two phases.

## Change

Migration `supabase/migrations/20261213120000_trade_partner_item_pictures.sql` (additive; the
frontend in production ignores the new keys):

- `private.trade_items_json`: every offered item also carries `image_path` and `description`.
  It feeds `get_trade_state`, which returns only trades of the caller's character.
- `private.can_read_item_image` (the storage read rule for `item-images`): a campaign member may
  also sign the picture of a definition whose item is on the table of an invited or open,
  unexpired trade one of their own characters takes part in.

Frontend (owner choice 2026-11-20): the partner's slots are buttons; tapping one opens a read-only
sheet with the picture (which opens the shared image viewer; without one, the category icon),
name, amount and rarity, and the description. The trade window stays open while the sheet is up
and focus returns to the slot. Both sides' slots show the picture from the trade state.

## Verification

- SQL (`tests/database/trades.test.ts`, public and PRE) "RYT-109 shows both trade members the
  pictures and descriptions on the table, and nobody else": before the trade Arin may not sign
  the rope's picture; once Bea offers it, Arin reads it with picture and description and may sign
  it; Cato (no trade) and an outsider may not, and Cato's state has no trade; after the cancel Arin
  no longer may; the helper is not callable by clients; anon reads nothing. All database tests:
  494 passed.
- Browser (`trades.spec.ts`, 390 and 820 px): Arin opens Bea's dagger from the trade window and
  sees its description and the "view the picture" control; axe; Escape closes only the sheet and
  focus returns to the slot. Trades specs: 8 passed.
- Security review before production: go, no medium or higher finding. Applied from it: only
  active characters count; tests for a definition not on the table, another campaign's DM and an
  expired trade not yet swept. Recorded as intended: the partner reads the item's description
  before it changes hands (the owner put it on the table). Known: a signed picture stays valid up to
  an hour after the trade ends (the usual item picture lifetime). Hosted PRE was checked to have the
  expected shape before applying.
- Hosted (2026-11-20): applied to `rytta-staging`, then production. Stored md5
  `a047dde49831ddd456736ce966bf8e9d`, 4712 characters, equal to the committed LF file. Production
  has both functions patched in `private` and `pre_private`, security definer, no client grant.

## UI review

PASS in one round at 390 and 820 px, Hearth and Parchment, Spanish and English, reduced motion,
keyboard, a long description and an item without a picture: axe clean, 44 px targets, the viewer
opens from the sheet and Escape closes the viewer, then the sheet, leaving the trade window open.
Minor notes for a later pass: the sheet has two "Close" controls (the X and a footer button), its
picture shows no rarity frame, the amount line weighs more than the title, and on a tablet the
sheet opens at the top rather than centred over the trade.
