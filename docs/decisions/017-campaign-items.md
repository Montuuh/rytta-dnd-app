# ADR 017: Campaign items and private images

Accepted for RYT-026.

The DM owns a campaign catalogue at `/campaign/:campaignId/items`, independent of
characters. The existing editor and definitions remain the single source for shops
and inventory. Creation, granting and shop listing are separate operations; a failed
follow-up must not create another definition or repeat a successful grant.

Images belong to definitions. DMs upload PNG/JPEG/WebP, resized proportionally to
1024 px and at most 1 MB. Private `item-images` objects use environment/campaign/item
prefixes. Players read only images attached to definitions they carry or can see in
a storefront. Signed URLs expire after five minutes. Existing icons remain fallbacks.
Image attachment is revision-checked and idempotent; uploaded objects are immutable.

Gold accepts a direct non-negative integer, saved explicitly with the revision from
the start of editing. Equipment keeps existing slot rules, server AC and client attack
lines; manual AC overrides take precedence in every presentation. No new homebrew
modifiers, automatic deployment or broadened Player catalogue permissions are added.

PRE refreshes copy application data, not Storage blobs. The image reader rejects a path
whose prefix differs from the runtime environment, so a copied PROD image uses the icon
fallback in PRE until the DM uploads a PRE image. No schema override is added to the browser.

Shop multi-add retains uncompleted selections and request IDs after partial failure. The
latest shop response removes successful listings from the picker; the retry only finishes
outstanding work. Errors remain inside the drawer. Submit buttons preserve focus while
busy; successful direct unequip returns focus to the corresponding equipment socket.

## RYT-032 amendment: item lifecycle and the reworked forge

- **Delete is a soft archive.** `archive_item_definition` (campaign, definition, revision,
  request id) is DM-only, locks the campaign, checks the revision, archives every live listing
  of the definition and then the definition, all in one transaction. Character stacks and
  ledgers stay untouched and readable; `grant_item`, `save_listing`, `get_shop_admin` and
  `listing_visible` already exclude archived definitions. Open (pending or countered) shop
  orders that include the item block the archive, as with `archive_shop`, because an archived
  listing can no longer complete an order.
- **Impact first.** `item_definition_impact(campaign, definition)` returns the live listings
  in live shops (shop name, price, stock, revision), the number of holders and units and the
  open orders. The storeroom delete dialog shows it; the delete button stays disabled while
  orders are open.
- **Price sync.** After an edit that changes `value_gp`, the editor reads the impact and, if
  any listing has another price, offers a checklist of shops with old and new price.
  `sync_listing_prices(campaign, definition, listing_ids, price, request)` is DM-only and
  transactional: every id must be a live listing of that definition in a live shop of the
  campaign, or nothing changes. Listings already at the price are skipped, so a repeat is a
  no-op. A failed impact check never blocks the save that already happened.
- **Edits keep the archive flag.** `save_item_definition` is replaced so an edit keeps
  `archived` unless the payload sets it; before, any edit silently restored the item.
- **Audit and idempotency.** All writes record actor, payload and result in
  `private.inventory_requests`; retries reuse the request id. The migration recreates the
  functions in an existing PRE through `pre_admin.remap`.
- **Forge.** One drawer (right, bottom sheet on phones) with a sticky live preview card in
  the rarity colour, native radio tiles for category and rarity gems (arrow keys work), −/+
  steppers for weight, value, AC and amount, and an image drop zone that wraps the native
  file input. The add-to-shop drawer uses the same placement.
- **DM "Add item" on a satchel.** It opens a two-way choice: an existing storeroom item
  (search, amount stepper, `grant_item` with one idempotency key per item and amount) or a new
  item forged and given to that character. The Player flow is unchanged.
