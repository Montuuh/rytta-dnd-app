# Delivery RYT-106: item pictures for DM and Players on every item surface

Status: done (2026-11-20; the owner accepted the "after" matrix, see the end of this record). Decision record: ADR 043 (point 11). Shared checks and untested
layers are in [RYT-104 validation](../RYT-104/validation.md).

## Outcome

Item pictures show for the DM and for Players allowed to see the item, with the category icon
as fallback, and open in the shared image viewer.

## Scope and ownership

`private.can_read_item_image` (part 1: members also read live basic items and their own
creations), `src/features/inventory/ui/{item-card,item-visuals,satchel,pick-list}.tsx`,
`src/features/shops/ui/listing-card.tsx`, `src/features/trades/ui/item-details.ts` and the
trades item picker. No new upload flow or bucket.

## Acceptance

Surface matrix after the fixes (the state before the fixes was not recorded per surface, so the
"before" column of the original criterion is not available):

| Surface | DM | Player who can see the item |
| --- | --- | --- |
| Storeroom | Picture, viewer | Not a Player surface |
| Satchel | Picture, viewer | Picture, viewer |
| Storefront listings, DM stock list | Picture | Picture (listing visible to the character) |
| Cart drawer | Picture, viewer (2026-11-20) | Picture, viewer (2026-11-20) |
| DM proposal review, Player add-item search | Picture | Picture of basic items, own creations and carried items |
| Player proposal shelf | Not a DM surface | Icon (a proposal has no picture yet) |
| Trades, own side | Picture | Picture |
| Trades, partner side | Picture, viewer (RYT-109) | Picture, viewer (RYT-109) |

| Criterion | Result |
| --- | --- |
| Matrix before and after | After only (see above) |
| Picture on every listed surface; no signed URL for a Player who cannot see the item | Met for storeroom, satchel, storefront and the own side of trades; the partner side of trades and the cart show the icon. The storage policy refuses other objects (SQL tests) |
| No picture or a broken one shows the icon without layout shift | Met in code (fixed-size tiles, icon on load error); covered by browser specs |
| 390px and 820px, both themes, both languages, keyboard and Escape, axe; independent UI review PASS | Met. Browser specs passed; independent UI review PASS on the current source in round 2 (shared record in RYT-104) |

## Verification

As in the RYT-104 record: the final full `npm run test:e2e` on the reviewed source (605 passed,
0 failed) includes the campaign-items, inventory, shops and trades specs. The earlier focused
rerun of those specs (126 passed) is kept in the same record.

## Handoff and review

Untested: real signed URLs from hosted Storage. The partner side of trades showing the picture
and description is planned as RYT-109.

Open on 2026-11-16 (closed at the end of this record): the first acceptance criterion asks for a matrix with the result before
and after the fixes, and only the "after" state was recorded. Either record a decision that
accepts the "after" matrix, or reconstruct the "before" column from the pre-delivery source.
The cart drawer also shows the icon only; confirm it is outside the listed storefront surfaces
or treat it as a gap.

## Owner decision and close (2026-11-20)

The owner accepted the "after" matrix (the "before" column is not reconstructed) and asked for the
picture in the cart. Each cart line now shows the item's picture with the rarity frame, which opens
the shared image viewer, or the category painting without one (`cart-drawer.tsx`). Browser spec
`shops.spec.ts` "RYT-106 the cart shows each item picture, which opens the viewer over the cart"
at 390 and 820 px: the picture button, the painting for an item without a picture, axe and no
overflow, and Escape closes only the viewer with focus back on the picture. RYT-109 has since
given the partner side of a trade its picture and description, so every listed surface shows the
picture.
