# ADR 044: shop types that pre-stock from the basic catalogue, and a shop banner image

Date: 2026-11-16. Status: accepted for RYT-107. Amends ADR 016 (deferred shop images and bulk
listing import) and builds on ADR 043 (basic catalogue and gp with cents).

## Context

The user's list of improvements (2026-11-15) asked for a create-item action in the add-items
drawer that does not need scrolling, shop types with default stock and an image per shop. The
first design placed the shop image as a full page background; text over arbitrary pictures did
not keep contrast in both themes.

## Decision

1. **Shop types.** `shops/domain/shop-types.ts` lists twelve presets (blacksmith, armorer,
   fletcher, general store, alchemist, tavern, tailor, temple, outfitter, tool shop, music shop,
   jeweler), each with names and descriptions in English and Spanish, a glyph and stock as
   basic catalogue keys. A test keeps every key in the catalogue. `shops.kind` (free text,
   1..40) stores the chosen key; unknown kinds render as a plain shop.
2. **Pre-stocking is three recoverable steps, not one RPC.** Creating a shop with a type runs
   `save_shop` (with `kind`), then `import_basic_items` for the type's items (existing keys are
   skipped and return their id), then `add_listings` at the catalogue price with unlimited
   stock. `add_listings` (DM, up to 200 per call, atomic) skips definitions the shop already
   lists. Each step keeps its request id and the client remembers the created shop, so a retry
   after a failure only finishes what is missing and never duplicates the shop or its stock.
   Before saving, the DM can untick items of the type. An existing empty shop can be filled from
   a type later. Items whose definition the DM archived are reported, not revived.
3. **Shop image.** The private `shop-images` bucket (1 MB, WebP/PNG/JPEG) holds immutable
   objects at `{env}/{campaign}/{shop}/{uuid}.{ext}`. Only the campaign DM uploads and deletes;
   readers are the DM (also unattached uploads, for preview and cleanup) and members with a
   non-archived character that currently sees the shop. A global storage router dispatches
   `pre/` objects to `pre_private` helpers. `set_shop_image` (DM, campaign-locked, idempotent,
   revision-checked) accepts only a path of its own environment, campaign and shop and requires
   the object to exist; `null` removes the image. The client re-encodes uploads (long side 1024
   px) as for item pictures (ADR 017) and never uploads the original bytes.
4. **Banner, not background.** The storefront and the DM panel show the image as a header
   banner of fixed aspect. The shop name and state sit on a fixed dark scrim with cream ink in
   every theme, so contrast does not depend on the picture. The picture is its own button that
   opens the shared image viewer (ADR 041). Without a readable image the plain header returns.
5. **Add-items drawer.** Title, close, search and New item stay in a sticky header, so the
   create action is reachable without scrolling with long or empty lists.

## Consequences

- A shop type is a starting point: after stocking, listings are ordinary rows the DM edits.
- Stocking touches the storeroom: the type's catalogue items become campaign definitions.
- Members who cannot see a shop never get its image object or a signed URL.
- A PRE refresh copies `image_path` but not Storage objects; the client refuses paths of the
  other environment and shows the plain header until the DM uploads a PRE image.
- Not implemented: public image URLs, several images per shop, shop types defined by the DM.
