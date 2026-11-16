# Basic items catalogue (RYT-103)

`build-basic-items.mjs` writes the bilingual catalogue campaigns import as real items:

- `src/features/inventory/content/basic-items.json`: mechanics and both names of every item.
- `src/features/inventory/content/basic-items.{en,es}.json`: one description per item key.

The rows live in `data/*.mjs` and were reviewed by hand against the "Equipment" chapter of the
System Reference Document 5.2.1, English (`SRD_CC_v5.2.1.pdf`, pages 89–102) and official Spanish
edition (`SP_SRD_CC_v5.2.1.pdf`, pages 97–111), licensed CC-BY-4.0 by Wizards of the Coast LLC
(https://www.dndbeyond.com/srd). No other book is a permitted source.

1. Edit the rows in `data/` (`armor`, `weapons`, `gear`, `tools`, `food`, `homebrew`).
2. `node scripts/items/build-basic-items.mjs`
3. `npx vitest run src/features/inventory/domain/basic-items.test.ts src/features/shops/domain/shop-types.test.ts`

Conventions:

- `key` is a stable camelCase id: campaigns store it as `basic_key`, so an imported item is never
  duplicated and "update from the catalogue" finds it again. Never rename or reuse a key.
- `weightLb` is the exact weight of one unit in pounds; `costCp` its price in copper pieces.
  Ammunition is stored per piece and keeps the SRD lot in `pack` (the unit price is rounded up to a
  whole copper piece, which only changes the Sling Bullet).
- `source` separates SRD content (`srd`) from Rytta homebrew (`rytta`). `descriptionSource` is
  `rytta` where the SRD has no prose for the item (armor, weapons, food and drink, feed).
- Spanish names and rules text follow the official Spanish SRD, which uses metric units.
- `water` counts pints and `rations` counts days of food; `container.capacityLb` is the SRD
  capacity where the SRD gives one in pounds (the Chest, which the SRD sizes by volume, uses 300).
  A carried container's `loadReductionPercent` lightens unequipped items up to that capacity; only
  the container that saves the most applies.
