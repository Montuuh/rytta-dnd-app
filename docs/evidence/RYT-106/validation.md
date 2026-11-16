# Delivery RYT-106: item pictures for DM and Players on every item surface

Status: review (2026-11-16; the "before" column of the surface matrix is missing, see the end
of this record). Decision record: ADR 043 (point 11). Shared checks and untested
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
| Cart drawer | Icon | Icon (not changed in this delivery) |
| DM proposal review, Player add-item search | Picture | Picture of basic items, own creations and carried items |
| Player proposal shelf | Not a DM surface | Icon (a proposal has no picture yet) |
| Trades, own side | Picture | Picture |
| Trades, partner side | Icon only | Icon only (trade state carries no picture or description; recorded decision, acceptance amended) |

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

Remaining before Done: the first acceptance criterion asks for a matrix with the result before
and after the fixes, and only the "after" state was recorded. Either record a decision that
accepts the "after" matrix, or reconstruct the "before" column from the pre-delivery source.
The cart drawer also shows the icon only; confirm it is outside the listed storefront surfaces
or treat it as a gap.
