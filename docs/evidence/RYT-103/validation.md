# Delivery RYT-103: bilingual basic items catalogue, backpack tiers and shop presets

Status: done (2026-11-16). Decision record: ADR 043 (catalogue) and ADR 044 (shop types).
Shared checks are in [RYT-104 validation](../RYT-104/validation.md).

## Outcome

A bundled, versioned catalogue of 200 items in English and Spanish: 197 adapted from the SRD
5.2.1 equipment chapter with the official Spanish SRD names, and three homebrew backpack tiers
(10, 20 and 30 % load reduction) marked as Rytta content. Twelve shop types list default stock by
catalogue key.

## Scope and ownership

`scripts/items/` (rows in `data/*.mjs`, `build-basic-items.mjs`, README),
`src/features/inventory/content/basic-items{,.en,.es}.json`,
`src/features/inventory/domain/basic-items.ts` and `src/features/shops/domain/shop-types.ts`
with their tests. The CC-BY-4.0 attribution sits in the catalogue file beside the data.

## Acceptance

| Criterion | Result |
| --- | --- |
| Schema: unique key, both languages, non-negative weight with decimals, non-negative integer cp, known category | Met (`basic-items.test.ts`: unique keys, every item a valid definition draft, both names and descriptions, whole non-negative cp, icons the app renders) |
| Every carried SRD 5.2.1 equipment entry present once under a unique key; sample SRD numbers pinned; every item stocked by a shop preset | Met for the amended criterion (decision 2026-11-15: carried goods only). Rows were reviewed by hand against the SRD pages listed in `scripts/items/README.md`; tests check unique keys, pin sample SRD numbers (bolts, needles, club, rations, waterskin) and require every item in at least one shop preset. Mounts, vehicles, services and trade goods are out of scope (feed and tack are included). No per-category count test against the source exists |
| Homebrew backpack tiers flagged, with capacity and load reduction, never claiming SRD origin | Met (test). The SRD Backpack keeps capacity only (30 lb, no reduction) |
| Every shop preset references existing keys and has items | Met (`shop-types.test.ts`) |
| CC-BY-4.0 attribution ships with the data; no non-SRD text | Met. Descriptions the SRD lacks (armor, weapons, food and drink, feed) are original text marked `descriptionSource: rytta` |

## Verification

`npm run check` on the reviewed source as in the RYT-104 record (passed; 501 unit tests). Data rebuild: `node scripts/items/build-basic-items.mjs`.

## Handoff and review

Open product question: whether mounts, vehicles and trade goods should be added to the
catalogue. Ammunition is stored per piece; the Sling Bullet price rounds up to one copper piece.
The ticket has no UI of its own. The surfaces that use the catalogue (import, shop types, add
item search) passed the independent UI review in round 2 on the current source (shared record in
RYT-104). Every acceptance criterion is met, the second one as amended on 2026-11-15.
