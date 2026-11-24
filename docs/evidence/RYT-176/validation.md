# RYT-176: the SRD magic items in the base pack

Status: done on 2026-11-24. The 268 magic items of the SRD 5.2.1 are published in the base pack,
version 4, in production and in PRE, after the app that reads them was released.

## Owner decisions (2026-11-24)

All the recommended ones: download the two official SRD PDFs; the whole text enters (the
description limit grows); attunement is the SRD's subtitle line at the top of the description;
each item gets the price of its rarity. Recorded in ADR 051, "The SRD magic items".

## Delivered

- **Source.** `SRD_CC_v5.2.1.pdf` (6.0 MB) and `SP_SRD_CC_v5.2.1.pdf` (9.2 MB), downloaded from
  the official site into a folder the repository ignores.
- **Extraction.** `scripts/items/magic_items_extract.py` reads "Magic Items A–Z" (English pages
  209–253, Spanish 228–277): 258 headings in each language, every one with its subtitle. It
  joins wrapped table cells by their position, reads the one table that spans both columns,
  moves the two stat blocks printed inside an item to the end of its text and puts three
  superscripts back.
- **Pairs.** The editions sort their own alphabet. A script proposed the pairs from kind,
  rarity, dice and save DCs; 41 of the 258 were wrong and were corrected by reading the list.
  `scripts/items/data/magic-item-names.mjs` holds the reviewed pairs; the build fails on an
  unpaired heading.
- **Entries.** `scripts/items/build-magic-items.mjs` writes
  `tests/fixtures/srd/items/magic-items.json`, a content file of kind `item` with 268 entries
  (the five "+1, +2, or +3" headings give one entry per bonus). Rarity: 4 common, 80 uncommon, 90
  rare, 60 very rare, 33 legendary, 1 artifact. Category: 183 gear, 33 weapons, 25 consumables,
  14 armours, 9 shields, 4 ammunition. 98 go on a slot. The longest description has 8506
  characters (the Mysterious Deck, in Spanish).
- **App.** A pack item carries a rarity and a campaign keeps it (`pack-items.ts`,
  `basic-items.ts`, `catalogue.ts`); descriptions hold 10000 characters in the pack reader, the
  campaign item and the forge fields.
- **App, after the UI review.** The shop page and the trade window read an item's whole
  description (their parsers stopped at 2000 and 4000 characters and would not open with a long
  item on sale or on the table); the shop detail keeps paragraphs and table rows on their own
  lines; the library's item form takes the whole text and sets the rarity.
- **Database.** `20261227120000_item_description_limit.sql`: the description check, the two
  validators and the byte ceiling of the translations. A Player's proposal keeps its old size.

## Checks

- A lint over the 268 entries in both languages (markup left over, words broken by a hyphen,
  lines starting in lower case, empty cells, table rows and paragraph counts equal in English
  and Spanish, length ratio): 2 flags left, both read and correct (two short rings whose
  Spanish is shorter or longer than usual).
- `npm run check` passed: typecheck, lint, architecture, docs (175 tickets), 145 test files and
  1266 tests, build. New: `magic-items.test.ts` (5 tests: every entry reads, no key shared with
  a mundane item, rarity, icon, properties and both texts whole, rarity and text into a
  campaign, prices) and `tests/database/item-description-limit.test.ts` (4 tests: 10000 stored
  whole, 10001 refused in the description, a translation and the table, a long pack item with
  its rarity through `import_basic_items`, anon, outsider, Player and DM of another campaign
  still refused).
- Browser, `tests/e2e/magic-items.spec.ts` at 390px and 820px (9 tests): the card of an item
  with the Mysterious Deck's texts with text at 150% (Spanish dark and English light at 390px):
  the whole text is shown, nothing overflows sideways, touch targets hold, axe is clean in the
  card, the last action takes keyboard focus and Escape closes it; a shop that sells that item
  opens and its detail keeps the lines; a trade between two Players shows the whole text of the
  partner's item; the library item form takes 8500 characters, more typed after them, and saves
  them with a legendary rarity.
- `npm run check` after the review fixes: 145 test files, 1270 tests, build.

## Reviews

- **Security review of the migration: approved with conditions, all met.** The two functions
  differ from their latest definitions only in the limit and keep their closed privileges. Met:
  the constraint names confirmed in `public` and `pre` and an assertion that raises if a
  check with the old limit survives; a lock timeout; the trade parser; tests with four-byte
  characters at both limits, the catalogue left without an old literal, the validators closed
  to anon and authenticated, and a Player's proposal with its denials. A Player's proposal was
  going to grow to 131072 bytes; it keeps its 16384, and its form field its 2000 characters.
- **UI review: round 1 CHANGES_REQUIRED.** Two blockers (the shop page and the trade window did
  not open with a long item) and two high findings (the shop detail ran paragraphs and tables
  together; the library item form stopped at 700 characters and had no rarity). All four fixed
  and covered by the browser tests above. **Round 2: PASS** on the fixed source, with the
  rarity field of the library form checked by keyboard and at 390px with text at 150%.

## Hosted

- Staging, then production with PRE in the same transaction, on 2026-11-24. In each, the stored
  migration has the length and MD5 of the file (7641 characters,
  `046b277e6de039bec62ddd0d8b290c96`).
- Production and PRE after it: `item_definitions` checks at 10000 characters and 81920 bytes,
  `item_proposals.draft` unchanged at 16384, both validators at 10000 in `private` and
  `pre_private` and not executable by anon or authenticated. 288 item definitions in
  production, none touched.
- Rolled-back actor check as the DM of a campaign, in PRE and in production:
  `save_item_definition` stored a legendary item with 10000 characters of "ñ" in the
  description and in both translations, and refused 10001 with Invalid request.
- Security advisors after the apply: the same three standing kinds as before, none about the
  objects of this migration.

## Released (2026-11-24)

- The app: release pull request 39 merged as `1b09c73a` after its five checks passed on
  `09722945`. The first run failed in one check of the new browser test: on the CI's fonts a
  glossary term ends a line of the longest item and the invisible touch area of the term
  reaches past the card, which the scroll width counted. The test now measures the text.
- Before merging: clean install, `npm run check` (1270 tests), build without secret keys (only
  the publishable key), hosted migrations equal to the repository's. Of 1621 local browser
  tests, three failed: two focus tests that pass alone, and the signed-out landing test, which
  fails on this machine and passes in CI. `format:check` fails locally on Windows line endings
  and passes in CI.
- The public site, https://rytta.pages.dev, serves build `1b09c73ac7a8-mwulj9n5` (built
  11:13 UTC) with its security headers; the served inventory bundle carries the rarity of a
  pack item and the 10000-character limit.
- Not checked on the public site at that point: any signed-in screen. The magic items were not
  in the library yet.
- Rollback: revert the merge commit on `main` (Pages redeploys the previous build). The
  migration can stay: it only widens limits, and the previous app works with it.

## Imported and published (2026-11-24)

- Production, with the super admin's session on the public site, through the library's own
  import: the check reported 268 new, none updated, none refused; the 268 entries were imported
  as drafts and the stored drafts had the MD5 of the file's entries
  (`df35d90b8dafb9baaa84391a7057d919`, 481628 characters) before anything was published. The
  publish review showed 268 new, none changed, none removed; version 4 was published.
- PRE the same way from the local app: same report, same MD5, version 4.
- The baseline of the pack moved from 3 to 4 in both, by owner SQL, so the new entries read as
  the SRD: 1680 entries, all of SRD origin, none changed or own, in production and in PRE. 40
  entries are protected as before; none of the new ones.
- The pack's items: 465 published (197 and the 268 at version 4, each with its rarity), nothing
  pending. The library on the public site lists "Objetos · 465" with the new items marked SRD.
- A campaign before and after the update, as its DM in production and rolled back: at version 3
  it reads 197 items; after `update_campaign_content` to version 4 it reads 465, 268 with a
  rarity, the longest Spanish description with 8506 characters, and no entry of changed or own
  origin. The three campaigns that use the items of the pack stay at version 3 until their DM
  updates.

## Not verified

- The texts were checked by script, not read item by item against the PDFs.
- Only items the SRD types as a potion are priced at half; other consumables (a bead, a dust, a
  candle) keep the full value of their rarity.
- The catalogue import drawer and the DM's proposal review were not captured with a long text.
  The catalogue does not show an item's rarity before it is taken.
- No DM has updated a real campaign yet: the update, the storeroom import of a magic item and
  its card were exercised in tests and in the rolled-back check, not by a person on the public
  site.

## Follow-ups from the UI review (RYT-177)

- Fold a long description on the item card so the actions stay near: with the longest item, at
  390px and text at 150%, they are about thirteen screens down.
- Table captions read as body text; a full stop after a glossary term can drop to the next
  line; "tricks" in Bag of Tricks links to the cantrip entry; the pick list clamps a description
  to four lines with no way to read on.
