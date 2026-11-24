# Basic items catalogue (RYT-103)

> Since RYT-167 the app reads the SRD from the content library (the SRD 5.2.1 pack). These scripts
> build the test copy in `tests/fixtures/srd/`; change the published SRD in the library.

`build-basic-items.mjs` writes the bilingual catalogue campaigns import as real items:

- `tests/fixtures/srd/items/basic-items.json`: mechanics and both names of every item.
- `tests/fixtures/srd/items/basic-items.{en,es}.json`: one description per item key.

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

## Magic items (RYT-176)

The 268 magic items of the base pack come from the "Magic Items A–Z" section of the same two
PDFs (English pages 209–253, Spanish pages 228–277). The scripts need `pdfplumber`:

1. `python3 -I scripts/items/magic_items_extract.py <SRD_CC_v5.2.1.pdf> <SP_SRD_CC_v5.2.1.pdf> <raw-dir>`
   writes one raw JSON per language: heading, page, subtitle and plain text of each item. It
   joins table cells that wrap, reads the tables that span both columns, moves the stat blocks
   printed inside an item to the end of its text and puts superscripts back.
2. `node scripts/items/build-magic-items.mjs <raw-dir>` pairs the languages with
   `data/magic-item-names.mjs` and writes `tests/fixtures/srd/items/magic-items.json`, a content
   file of kind `item` (the library imports it as it is). It fails on an unpaired heading, a
   repeated key or a text over the limit.
3. `npx vitest run src/features/inventory/domain/magic-items.test.ts`

Conventions (ADR 051, "The SRD magic items"):

- The description is the SRD subtitle (kind of item, rarity, attunement), a blank line and the
  rules text. A table is one line per row with " | " between cells.
- `data/magic-item-names.mjs` pairs each English heading with its Spanish one. The two editions
  sort their own alphabet, so a new pair is read by a person, never guessed.
- One entry per heading, except the "+1, +2, or +3" headings: one entry per bonus.
- `rarity` is the item's; where it depends on a variant, the lowest the text lists and no price.
  `costCp` follows the SRD's values by rarity.
- The text was checked by script (wrapped cells, broken hyphens, paragraph and table row counts
  equal in both languages), not read item by item.
