# ADR 043: gp with cents, weights in lb or kg, a basic catalogue and Player proposals

Date: 2026-11-16. Status: accepted for RYT-103, RYT-104, RYT-105 and RYT-106. Amends ADR 014
(inventory), ADR 016 (whole gold) and ADR 017 (Player catalogue permissions). Shop types and
shop images are ADR 044; sheet trackers are ADR 045.

## Context

The user's list of shop, item and sheet improvements (2026-11-15) asked for decimal gold,
weights in lb or kg, optional translations, descriptions everywhere, an importable basic items
catalogue, own items as templates, backpacks as containers, food and drink that add rations and
water, Players searching existing items before proposing one, DM merges of duplicates and item
pictures for every role. Decisions recorded with the user on 2026-11-15:

- Money is gp with two decimals (0.01 gp = 1 cp). No pp/sp/cp purse.
- An item a Player proposes reaches the inventory only when the DM accepts it.
- 1 lb = 0.5 kg (the conversion of the Spanish rulebooks). Each user chooses kg, lb or
  "according to language"; the default is kg in Spanish and lb in English.
- The second language of an own item is optional and typed by hand. No online translation
  service: it would need a paid external service and would send campaign text out of the app.

## Decision

1. **Money.** Every amount (`character_resources.gold`, `item_definitions.value_gp`, listing
   prices, order totals and line prices, trade gold) is `numeric(12,2)`; the type change keeps
   every stored value. RPCs accept JSON numbers or numeric strings and refuse negative amounts,
   values over the column limit and more decimals than `private.money_scale()` allows
   (`Invalid request`, detail `amount`). Nothing is rounded silently on input. Derived prices
   follow the same scale: the per-character modifier rounds half up and the resale quote rounds
   down, so a sale never pays more than the list price allows. The client parses with
   `shared/lib/money.ts` and formats with the interface language's separator.
2. **Weight.** `item_definitions.weight_lb numeric(9,3)` (0..10000) is the source of truth. The
   legacy `weight_tenths` stays, kept equal to `round(weight_lb * 10)` by a trigger, so older
   payloads still work. kg is presentation only (`shared/lib/weight.ts`). The unit preference is
   stored on the device per signed-in account (`localStorage`, keyed by user id), not in the
   database; signed out it is the device's. Forms show two linked fields, the reader's unit
   first.
3. **Translations.** `item_definitions.translations` holds optional `{"en"|"es": {name,
description}}` with the same limits as the record's own fields; name and description stay
   the original and the fallback (`shared/lib/translations.ts`). Every read that returns a
   definition returns its translations and description.
4. **Basic catalogue (RYT-103).** A versioned bilingual JSON of 200 items
   (`src/features/inventory/content/`, built by `scripts/items/build-basic-items.mjs`): 197
   from the SRD 5.2.1 equipment chapter (armor, shield, weapons, ammunition, adventuring gear,
   tools, consumables, food and drink, and tack), with official Spanish SRD names and
   CC-BY-4.0 attribution beside the data, plus three homebrew backpack tiers marked `rytta`.
   Mounts, vehicles and trade goods are not included. Prices are whole copper (`costCp`); the
   SRD lot price of ammunition is stored per piece, rounded up to a copper piece.
5. **Import replaces templates.** The static `srd-equipment.ts` templates are retired. The DM
   imports catalogue items as real definitions (`import_basic_items`, origin `srd`, unique
   `basic_key` per campaign, 500 per call, SHA-256 of the payload in the idempotency record).
   Existing keys are skipped, archived ones included; "update from the catalogue" changes
   catalogue fields only and never price, image or the template flag. `set_item_template` lets
   the DM offer any own item as a starting point in the forge.
6. **Players search first, then propose (RYT-105).** `search_campaign_items` returns the DM
   every live definition; a Player gets live basic items, their own creations and what their
   characters carry, with `value_gp` only for basic items. A Player may add a basic catalogue
   item to their own character directly (`grant_item`, `source = 'player'` stack, so it never
   mints gold). Anything else is a proposal: `item_proposals` (RLS on, no grants) stores the
   normalized draft, quantity and an optional suggested price, bounded to 20 pending and 100
   per 24 hours per character. `resolve_item_proposal` (DM) accepts with an edited draft and an
   explicit quantity, merges into an existing item or rejects with a note. An accepted item is
   created by the DM (`created_by` the DM, origin `player`) and granted as a `dm` stack; the
   proposer is recorded only on the proposal row. The Player can withdraw a pending proposal.
7. **Player authoring closes.** With part 2 (point 12) Players no longer create or edit
   definitions and no longer grant their own Player-made definitions. Already with part 1, a
   Player's own creation is frozen for them once it has a price, a `dm` or `shop` stack or a
   live listing. Existing Player-made items stay readable
   and the DM can still edit, price, merge or archive them.
8. **Merge.** `merge_item_definitions` (DM) moves every stack of the duplicate to the kept
   item (equipped rows stay separate when the kept item fits the slot), repoints listings
   (archiving the duplicate listing where the shop already sells the kept item) and closed
   order lines, writes a `merge` ledger event per moved stack and archives the duplicate. It is
   refused while open orders or live trades reference the duplicate. `item_definition_impact`
   shows the DM what will move first.
9. **Supplies.** A consumable may carry `properties.rations` and `properties.water` (0..100,
   one decimal, per unit). Using units from a `dm` or `shop` stack adds the whole part of
   quantity x value to the character's counters in the same transaction; a `player` stack adds nothing,
   so supplies come only from what the DM gave or the character bought. Undo removes exactly
   what was added and raises `Undo conflict` once the counters no longer hold it.
10. **Containers.** `properties.container` is `{capacityLb, loadReductionPercent 0..90}`. A
    container works while carried; it has no equipment slot. Only the container that saves the
    most applies: saved = percent x min(loose weight without the container, capacity).
    Equipped gear and the container's own weight are never reduced. The SRD Backpack has
    capacity only (30 lb, no reduction); the three homebrew tiers reduce 10, 20 and 30 % up to
    40, 60 and 90 lb. The load bar names the container and the saving.
11. **Pictures (RYT-106).** Members may also read the picture of a live basic item and of
    their own creations; the other readers of ADR 017 are unchanged. Satchel, storeroom,
    storefront, DM proposal review, add-item search and the Player's own trade rows show the picture with the
    category icon as fallback and open the shared viewer. Partner items in a trade show the
    icon only, because the trade state carries neither picture nor description.
12. **Two-part rollout.** `20261120120000_items_decimal_catalogue_proposals.sql` is additive
    and backward compatible: `money_scale()` returns 0 and Player authoring stays open, so the
    deployed frontend (which parses integers) keeps working; catalogue cent prices cannot be
    imported yet. `20261121120000_items_player_authoring_close.sql` only switches
    `money_scale()` to 2 and closes Player authoring, and must ship together with the frontend
    that understands both. PRE receives the part-2 switches early through
    `supabase/maintenance/items-player-authoring-close-pre.sql` (kept identical to the
    migration by a test) and loses them on every `pre:sync` until part 2 reaches production.

## Consequences

- Gold is exact decimal arithmetic in PostgreSQL; the browser never computes a balance.
- Imported basic items are campaign data: editing one in a campaign never changes the
  catalogue, and re-importing never overwrites the DM's price or picture.
- A Player can no longer invent a priced or sellable item; the DM owns every accepted proposal.
- The unit preference does not follow the account to another device.
- Known and accepted: Players can still read `value_gp` of definitions they carry directly from
  the `item_definitions` table (the RLS read predates this ADR); the client never shows it.
- Known and accepted: a merge performed before the frontend release writes a `merge` ledger
  kind that the deployed frontend cannot parse; only the new interface offers merging.
- Not implemented: online translation, a pp/sp/cp purse, mounts, vehicles and trade goods in
  the catalogue, Player-visible notifications outside the proposal shelf.
