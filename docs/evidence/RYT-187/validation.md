# RYT-187: private packs for Tasha's Cauldron of Everything and Xanathar's Guide to Everything

Status: in progress. First slice delivered on 2026-11-26: both packs and the skeleton of their
entries, as unpublished drafts with keys, names and index data and no text. The owner writes the
texts.

## The packs

| Pack                            | Title (EN / ES)                                                | PRE id                                 | Production id                          |
| ------------------------------- | -------------------------------------------------------------- | -------------------------------------- | -------------------------------------- |
| `tasha-cauldron-of-everything`  | Tasha's Cauldron of Everything / El caldero de Tasha para todo | `dbccfbe7-ded1-4f14-882b-f4900b3a837d` | `d81fcf21-a8bf-4e6a-9af9-f19dd6b51814` |
| `xanathars-guide-to-everything` | Xanathar's Guide to Everything / Guía de Xanathar para todo    | `dc1591dc-2562-42a4-9e46-cdacb7d58ab3` | `aa00de02-295b-4386-93c3-7ce877cda278` |

Both: edition 2014, license "Private use", private, version 0 (nothing published), owned by the
super admin, created through `save_content_pack` as the super admin.

## Skeleton

877 drafts in each environment, none with `data.en` or `data.es`.

| Kind       | Tasha | Xanathar | What they are                                                                                                                       |
| ---------- | ----- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `class`    | 1     | 0        | Artificer: d8, Con and Int saves, two of seven skills, half caster with Int, subclass at 3                                          |
| `subclass` | 30    | 31       | With their class (four artificer specialists in Tasha)                                                                              |
| `feature`  | 276   | 199      | Class and subclass features with class, subclass and level; options without class or level; one `feat-<key>` text entry per feat |
| `feat`     | 20    | 15       | General feats at level 4; Tasha's five fighting styles                                                                              |
| `spell`    | 21    | 95       | Level, school, class lists, concentration and ritual marks                                                                          |
| `item`     | 47    | 48       | Category, slot and rarity; weight and price 0                                                                                       |
| `creature` | 15    | 0        | Summon spirits, steel defender, homunculus servant, wildfire spirit, primal companions                                              |
| `rule`     | 11    | 56       | Optional rules and DM tools; Xanathar's 25 tool descriptions and downtime activities                                                |
| `hazard`   | 0     | 12       | Xanathar's sample traps (nine simple, three complex)                                                                                |

Options (`feature` entries with no class or level, so no reader grants them on its own): Tasha's
41 optional class features (`optional-<class>-…`), 16 infusions, 8 invocations, Pact of the
Talisman, 7 maneuvers, 2 metamagic options; Xanathar's 8 arcane shots and 14 invocations.

## Sources and checks

- **Lists.** Tasha's PDF has a text layer: feature names and levels, infusions, invocations,
  maneuvers, metamagic, spells and magic items were compared against its extracted text.
  Xanathar's PDF is page images: its class spell lists (spells, schools, rituals, classes) and its
  common magic items and sample traps were compared against the page images. Xanathar's subclass
  feature names and levels, the racial feats and the concentration marks of both books were
  written from the book's structure and not compared page by page.
- **Local files.** Line files and a build script under the ignored `content-private/` produce one
  import file per kind. `npm run content:check` accepted all 15 files: 877 entries, 877 valid.
- **Import.** Each kind went through `import_content_entries` as the super admin by owner SQL, PRE
  first and production after it, each environment in one transaction that rolls back unless every
  entry is added and none is updated, unchanged or refused. All 15 kinds passed in both.
- **Stored content.** After the import, the MD5 of each kind's stored entries (key, names and data
  ordered by key) equals the local file's, in PRE and production.
- **Actor check** (production, rolled back): an unrelated DM does not see either pack in the
  library or in the choices for a new campaign and is refused their entries (`Forbidden`); the
  super admin sees both in the library and reads their drafts.

## Not verified and known gaps

- Spanish names are working translations, not the Spanish editions'.
- Creature index values are placeholders: these stat blocks have no challenge rating (stored as
  `0`) and their AC and hit points grow with the spell or character level (the lowest values are
  stored).
- Items with tiered rarity (+1/+2/+3) or "rarity varies" are one entry at the lowest rarity; magic
  items have no price or weight.
- The 2014 subclasses keep the book's levels; the base pack's classes choose a subclass at level 3,
  so a level 1 or 2 subclass feature is offered when the subclass is chosen.
- The artificer class has no prepared-spells table (`prepared` stays empty) and uses the half
  caster progression of the app, which rounds down where the book's artificer rounds up.
- Artificer spells name the pack's `artificer` class; the base pack's spells the book adds to the
  artificer list are not linked.
- Left out: random tables (names, backstory, encounters), Tasha's sidekick classes (one rule
  entry names them), pictures.
- Nothing was looked at in the library screen.

## Tasha texts (2026-11-26)

Second slice, owner's go-ahead the same day ("Sí, empieza por Tasha"): every Tasha entry that
carries text now has `data.en` and `data.es`.

| Kind       | With text | Notes                                                                                   |
| ---------- | --------- | --------------------------------------------------------------------------------------- |
| `feature`  | 276 / 276 | Artificer and subclass features, optional class features, options and the feat texts     |
| `spell`    | 21 / 21   | Casting time, range, components, material, duration, save and damage types              |
| `item`     | 47 / 47   | Description with type, rarity and attunement on its first line, as the base pack's      |
| `creature` | 15 / 15   | Summon spirits and class companions as stat blocks; values that scale say so in the text |
| `rule`     | 11 / 11   | Chapter 1 rules in full; the chapter 4 DM tools as marked summaries                     |

`class` (1), `subclass` (30) and `feat` (20) keep their index only, as in the base pack: their
text lives in their features.

- **Source.** The English text comes from the book's text layer, cleaned by hand; the stat block
  table of the Teeth of Dahlver-Nar was read from the page image. The Spanish is a working
  translation with metric units, not the Spanish edition's.
- **Route.** Six import files built from text modules under the ignored `content-private/`, each
  checked with the library's parser (and the creature stat blocks with the bestiary schema), then
  imported with the library's own Import dialog as the super admin: PRE from the local app,
  production on rytta.app. Every dry run reported 0 new, all updated, 0 refused.
- **Stored content.** After the last file, the MD5 of each kind's stored data (key and data
  ordered by key) is the same in PRE, in production and in the local files.
- **Not verified.** The texts were not compared word by word with the book; the Spanish was not
  reviewed by a person. Item descriptions that exceed the reader's limit were shortened (one
  Spanish paragraph of the Teeth of Dahlver-Nar). Nothing was published: the pack stays at
  version 0 and private.

## Xanathar texts (2026-11-26)

Third slice, owner's go-ahead the same day ("Sí, sigue con Xanathar"): every Xanathar entry that
carries text now has `data.en` and `data.es`.

| Kind      | With text | Notes                                                                                        |
| --------- | --------- | -------------------------------------------------------------------------------------------- |
| `feature` | 199 / 199 | Subclass features, the 8 arcane shots, the 14 invocations and the 15 racial feat texts         |
| `spell`   | 95 / 95   | Casting time, range, components, material, duration, save and damage types                   |
| `item`    | 48 / 48   | Common magic items; type, rarity and attunement on the first line                            |
| `hazard`  | 12 / 12   | Sample simple and complex traps                                                              |
| `rule`    | 56 / 56   | Optional rules, tools, spellcasting, encounter building, traps, downtime and awarding items  |

`subclass` (31) and `feat` (15) keep their index only, as in the base pack and in Tasha.

- **Source.** The book's PDF has no text layer: its pages were rendered, split into columns and
  read with the system OCR, then the English was corrected by hand against the page images where
  the OCR was garbled (the encounter-building ratio tables, the solo-monster and quick-matchup
  tables and the magic-items-by-rarity table were read from page images). The Spanish is a
  working translation with metric units, not the Spanish edition's.
- **Route.** Three import files (spells, feats and items; rules and traps; subclass features and
  options), each checked with the library's parser, then imported with the library's Import
  dialog as the super admin: PRE from the local app, production on rytta.app. Every dry run
  reported 0 new, all updated, 0 refused.
- **Stored content.** After the last file, the MD5 of each kind's stored data (key and data
  ordered by key, byte order) is the same in PRE, in production and in the local files.
- **Not verified.** The texts were not compared word by word with the book and the Spanish was
  not reviewed by a person; OCR errors may remain. "This Is Your Life" is a marked summary
  without the book's random tables. Nothing was published: the pack stays at version 0 and
  private.

## Review and publication (2026-11-26)

Fourth slice, owner's request the same day: a full review of both languages, of coverage against
the books and of how the app reads the entries, then publishing both versions.

- **App readers.** Every entry of both packs was read with the app's own parsers, shaped as the
  campaign RPCs return them: glossary index rows and bodies (spells, features, rules, traps) in
  both languages, class and subclass references after the pack's names are localized, the class
  catalog, the storeroom catalogue and the bestiary index and stat blocks. Result: 878 entries
  read, no row or body dropped, every feature's class and subclass and every spell's class
  resolves.
- **Texts.** Both languages were linted entry by entry: dice, DCs and bonuses match between
  English and Spanish, distances in feet have their metric value, no untranslated units or
  English words in Spanish, markup is balanced, and the OCR-derived English was checked against
  a dictionary built from the SRD and the hand-written texts. Fixed: three OCR remnants in
  Xanathar spells (`ld 10`, `IOfoot`, `1 lth`), the cantrip scaling sentence of three Spanish
  spells, nested emphasis in four invocation prerequisites, the rival marker of the downtime
  complication tables (now `†`, since `*` is the emphasis markup) and one Spanish sentence of a
  Tasha feature.
- **Coverage.** Xanathar's table of contents against the pack: every subclass (31), racial feat
  (15), spell (95), common magic item (48), sample trap (12), optional rule, tool, spellcasting
  rule, encounter-building rule, downtime activity and the magic item awarding rules are in.
  Added: Land and Water Vehicles (the one tool description missing). Left out, as for Tasha:
  random tables (backstory, random encounters, names), class flavor tables, the druid's beast
  lists by environment, the magic item tables by rarity and the shared campaigns appendix.
- **In the app (PRE).** Both packs published as version 1 in PRE and enabled in "Mesa de
  pruebas": the glossary lists 455 spells (339 base + 21 + 95) and opens their articles with
  tables; the bestiary lists the 15 Tasha creatures with readable stat blocks; the storeroom
  import offers the 48 Xanathar items; character creation offers the Tasha and Xanathar fighter
  subclasses beside the base one.
- **App fixes.** A glossary entry of a pack other than the base one printed "SRD 5.2.1, page N";
  it now cites its pack's title and page (`glossary.sourcePack`). The storeroom import printed the
  SRD equipment credit for any source; it now prints it only when the chosen source includes the
  SRD's items. UI review: docs/evidence/ui-review/ryt-187/.
- **Production.** The fixes were imported (Xanathar: 1 new, 22 updated; Tasha: 1 updated), the
  stored MD5 per kind matched PRE and the local files, and version 1 of each pack was published
  (Tasha 421 entries, Xanathar 457). Both stay private; no campaign has access in production.
- **Not verified.** No person reviewed the Spanish; the English was not compared word by word with
  the books. The app fixes reach production with the next release.

## Public packs and pictures (2026-11-26)

- **Visibility.** On the owner's request, confirmed after a warning that every DM would read the
  books' text and that it risks a copyright claim, both packs were switched to public with the
  library's pack editor as the super admin, in production and in PRE. SQL check: `visibility`
  is `public` for both slugs in `public` and `pre`. The decision is recorded in the ADR 051
  addendum.
- **Image queue.** 112 requests, IMG-472 to IMG-583, in four batches: 47 Tasha items and 48
  Xanathar items (style of the SRD magic items), the 15 Tasha creatures (style of the bestiary)
  and the two pack covers (style of the RYT-184 covers). Sources go to
  `art/queue/source/{tcoe,xgte}/…` and the covers to `art/queue/source/pack-cover-<slug>.png`;
  each picture is then uploaded as the entry's picture or the pack's cover in the library, in PRE
  and in production.

## Still to do

- The 112 pictures: the owner paints them, then they are reviewed and uploaded.
