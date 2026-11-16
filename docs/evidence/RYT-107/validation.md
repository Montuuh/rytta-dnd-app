# Delivery RYT-107: reachable create action, shop types that pre-stock and a shop banner

Status: review (2026-11-16; waiting only for part 2 in production with the release). Decision record: ADR 044. Database rollout, shared checks and
untested layers are in [RYT-104 validation](../RYT-104/validation.md).

## Outcome

The New item action of the add-items drawer stays in its sticky header. A new shop can start
from one of twelve types that stock it from the basic catalogue, with items the DM can untick
before saving. A shop can have an image, shown as a header banner with a dark scrim and opened
in the shared image viewer.

## Scope and ownership

`shops.kind` and `shops.image_path`, `add_listings`, `set_shop_image`, `save_shop` with `kind`,
the private `shop-images` bucket and its router (part 1);
`src/features/shops/domain/{shop-types,stocking}.ts`,
`src/features/shops/ui/{shop-stocking,shop-type-picker,shop-image,shop-image-encode,
use-stocking,use-gp,storefront,admin-panel}.tsx|ts` and `shops.css`.

## Acceptance

| Criterion | Result |
| --- | --- |
| Create action visible without scrolling at 390px and 820px, long and empty lists | Met (sticky drawer header; browser specs) |
| A shop type pre-stocks once; retrying does not duplicate | Met. Three steps (`save_shop`, `import_basic_items`, `add_listings`) with per-step request ids; both server calls skip what exists, and a remembered shop is never created twice |
| Image in a private bucket, header banner with scrim, AA contrast in both themes, opens the viewer | Met in code and captures; changed by decision from a page background to a banner because text over arbitrary pictures lost contrast. Contrast rests on a fixed dark scrim with cream ink (above 7:1 by design); axe passed, but no contrast measurement over real uploaded pictures was made |
| Members who cannot see the shop get no image or signed URL; environments respected | Met in storage policy SQL tests and the client's environment prefix check; real signed URLs untested |
| Denial tests for anon, outsider, Player and cross-campaign DM | Met on PGlite |
| PRE before production | Met for part 1 (bucket and policies included); cent listing prices need part 2 |
| 390px and 820px, both themes, both languages, keyboard and Escape, axe; independent UI review PASS | Met. Browser specs passed, also at 150 % text size on 390px; independent UI review PASS on the current source in round 2 (shared record in RYT-104) |

## Verification

As in the RYT-104 record; shop cases in `tests/database/shops.test.ts`, stocking and type tests
in `src/features/shops/domain/*.test.ts`, browser flows in `tests/e2e/shops.spec.ts`.

## Handoff and review

Until part 2 reaches production, stocking a shop there fails for catalogue items with cent
prices (`Invalid item N`, detail `amount`); the stocking UI ships with that release. Untested:
real uploads to hosted Storage.

Independent UI review round 1 found the shop add-items search unusable at 150 % text size on
390px (major); it was fixed and round 2 passed. Round 2 noted that "show all" in the shop
add-items dock leaves focus on the document body (non-blocking, planned as RYT-108).

Remaining before Done: part 2 (`20261121120000_items_player_authoring_close.sql`) applied to
production together with the frontend release, performed by the user, and stocking a shop with
cent-priced catalogue items verified there.
