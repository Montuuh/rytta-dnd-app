# ADR 016: Shops, merchant visibility, cart purchases, negotiation and revert

## Status

Accepted for `RYT-005`. Builds on ADR 014 (RYT-004 inventory) and follows ADR 015 (navigation,
type tokens and widget doctrine).

## Context

The DM needs a shops panel: several merchants, items with price and stock, shops and items that
can be hidden, and items that only one character can see. Players buy (one or many items at
once), purchases go straight to their inventory, gold is always visible, the storefront shows
what the character already carries, and every transaction is recorded so the DM can see who
bought what and undo it. Decisions recorded with the user on 2026-11-02:

- Each shop chooses automatic purchases or DM approval. With approval the DM approves, rejects
  or counter-offers per line; the Player accepts or declines. Gold and items move only when the
  order closes. The DM can always revert a completed order.
- Included: selling to shops (resale percentage per shop), limited or unlimited stock,
  per-character discounts or surcharges and a multi-item cart (one order per checkout).
- Currency is whole gold, matching `character_resources.gold`.
- Reverting a purchase takes back the units the character still has (unequipping them if
  needed) and refunds their final price; used or sold units are not refunded.
- The RYT-004 inventory is kept as is. Shops reuse its catalog (`item_definitions`) and stacks.

## Decision

1. **Data.** `shops` (visibility hidden/party/selected, mode auto/approval, resale percent,
   open flag), `shop_access` (characters that see a `selected` shop), `shop_listings` (an
   RYT-004 definition, price, optional stock, visibility shop/hidden/selected),
   `listing_access`, `shop_modifiers` (percent −100..100 per shop and character), `shop_orders`
   (purchase/sale, status pending/countered/completed/rejected/cancelled/reverted, totals and
   notes) and `shop_order_lines` (list, offered, countered and final unit prices, reverted
   quantity). Every table carries `campaign_id` with composite foreign keys.
2. **No table reads.** Shop tables have RLS and no grants. `get_storefront` returns only the
   shops and listings visible to one character, with server-modified prices and a resale quote
   for each sellable item; hidden records are absent, not flagged, and the DM-only `value_gp`
   never reaches Players. `get_shop_admin` (DMs) and `list_shop_orders` (DMs for the campaign,
   Players for their own character) complete the read surface.
3. **Writes are RPC transactions.** Every mutation locks the campaign row, authorizes through
   `private.is_campaign_dm` or `private.can_play_character`, deduplicates request ids in the
   RYT-004 `private.inventory_requests` table and audits in the same transaction. Prices are
   always recomputed on the server (modifier rounded half up, never negative; resale rounded
   down from the shop's own list price or else the DM value). Insufficient gold or stock rolls
   the whole order back. Approval orders re-validate stock and gold when they close.
4. **Inventory link.** Purchased units go to a loose `source = 'shop'` stack. Sales take only
   loose `dm`/`shop` units, so Player-made items never mint gold (ADR 014). Shop movements are
   logged in `inventory_events` as `purchase`, `sale` and `revert` (the kind check was widened
   without touching existing rows). The RYT-004 undo only compensates grant/use/remove, so a
   Player cannot undo a purchase and keep the gold; only the DM's order revert does that.
   Reverting equipped units recomputes armor class.
5. **UX.** The storefront has a sticky purse with the cart button, a shop switcher, a shop
   header (mode, closed state and personal discount as icon plus text), category chips that
   reuse the inventory categories, and listing cards whose one decorative element is a notched
   gold price tag. Item glyphs reuse the RYT-004 icons and rarity tints so a bought item looks
   the same in the shop and the satchel. Cards show "You have N" (and equipped) from the
   inventory. The cart (bottom drawer on phones, side drawer on tablets) shows gold and load
   before and after, with the 5e variant thresholds from the inventory Balanza. Approval shops
   add per-line offers and a message. "My orders" shows status badges with icons and the
   accept/decline actions for counter-offers; "Sell" lists sellable units with server quotes.
   The DM panel follows ADR 015's widget doctrine instead of forms. Creating a shop asks only
   for a name (it starts hidden or for the whole party); everything else is changed in place
   and saved at once: an open/closed switch, segmented controls for who sees the shop and how
   purchases work, character chips for selected access and a resale slider. Stock rows expand
   in place with a price stepper (hold for ×10, as on Party resources), price shortcuts (DM
   value, −10/+10/+25%), limited/unlimited stock with a stepper and per-item visibility with
   character chips. Several catalog items are added at once from an icon grid at their DM
   value. Per-character prices are sliders from −50% to +50% with a sample price. The ledger
   uses a segmented view (to answer, waiting for the player, history) with live counts and
   chips for characters and shops; approval shows the total, counter-offers are inline with
   price chips (their offer, middle, list) and reverting uses the RYT-004 hold-to-confirm
   seal (keyboard activates immediately). Controls stay enabled while saving so focus never
   drops; changes made during a save are ignored. Items are created in the inventory forge;
   the panel links to it instead of a second catalog editor.
6. **Visibility.** The module follows `player_modules`. DMs can open it before enabling it and
   see a hint; Players without the module see an explanation. A DM in Player view sees the
   previewed character's storefront read-only.

## Consequences

- Shops are authoritative in PostgreSQL with auditable, revertible orders and no client-side
  read-modify-write.
- Bought stacks stay separate from DM-given stacks of the same item (source matters for
  resale), so the satchel can show two tiles for one item.
- Deferred: realtime notifications of new requests (RYT-013; polling every 20 s), shop
  images, bulk listing import, multiple currencies and haggling rounds after a counter-offer.

## Amendment: RYT-030 ledger and storefront clarity (2026-11-03)

- **Order variants.** Every order card carries one of three visual languages, derived by
  `orderVariant`: purchase (gold stripe, bag icon, "Compra"), sale (water-blue stripe,
  hand-with-coins icon, "Venta") and live counter-offer (hatched violet stripe, handshake,
  "Contraoferta de compra/venta"). A gold-flow row states the direction from the character's
  side ("Arin pagará / recibió", "Pagarás / Recibiste"; "Sin movimiento de oro" when rejected or
  cancelled). A counter-offer shows the asked total struck against the countered total, and
  lines strike the price they moved away from. Open-status badges say whose move it is
  ("Por responder", "Esperando al jugador", "Te toca responder").
- **Freshness.** Order lists on screen (DM ledger, a Player's "My orders" tab) poll every 5 s
  through `liveOrders`. Observers only poll while mounted and never in a hidden tab; other
  shop queries keep 20 s. The ledger reuses the shared `RefreshControl`. Only a manual refresh
  spins the icon, so background polls add no motion.
- **Delete wording.** The DM's shop action reads "Eliminar tienda" with a trash icon. The
  backend is still the soft `archive_shop`, so the ledger and inventories are untouched.
- **Storefront.** The shop switcher row is gone. When several shops are visible, the shop name
  in the header is a select-only combobox (wax-seal initial, mode or closed state per option).
  The mode badge sits beside the name and wraps below it when there is no room. Its help text
  is a focusable tooltip and the badge's accessible description, not a paragraph. Closed
  shops explain themselves in the header. The empty cart button is removed. Search appears
  only for more than six listings, and category chips only for more than one kind. Empty
  shelves use an icon note.
- The DM intro paragraph on the shops panel is removed.
