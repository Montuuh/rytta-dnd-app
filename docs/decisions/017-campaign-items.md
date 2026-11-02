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
