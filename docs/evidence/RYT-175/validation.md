# RYT-175: a private pack with the Player's Handbook content the base pack lacks

Status: in progress. First slice delivered on 2026-11-24: the file guide, the local checks and
the private pack. Second slice, same day: a skeleton of the missing entries, as unpublished
drafts with names and index data and no text. Third slice, same day: the texts of the features
and spells, the pack published and made public in PRE and in production (version 2). Fourth
slice, same day: the screens that choose a subclass read the campaign's packs.

## Delivered

- **File guide.** [Content files](../../content-files.md): the import format, what each kind
  needs in its index (subclass, feature, feat, background, species, spell) with one example of
  each from the base pack, the keys that tie entries together and the shape of the text.
- **Local check.** `npm run content:check -- <file>` (`scripts/check-content-file.mjs`) runs the
  parser the library's import uses and lists each refused entry with its reason. Tried on a
  throwaway file of five entries: two accepted, three refused for the right reasons (a key with
  capitals and a space, a repeated kind and key, a feat category the form does not have).
- **Out of the repository.** `content-private/` is ignored and `npm run check:private`
  (`scripts/check-private-content.mjs`, now part of `npm run check:fast`) fails if a file under
  it is tracked or the ignore rule goes away.
- **The pack.** `phb-2024` ("Manual del Jugador 2024"), private, unpublished, owned by the super
  admin, created in PRE and then in production with owner SQL. Rolled-back actor check in
  production: the super admin sees it in the library, in production and PRE; a DM of a campaign
  does not see it in the library, in the choices for a new campaign or in their campaign's
  Content, and is refused its entries.

## Skeleton (2026-11-24)

405 drafts in `phb-2024`, in PRE and in production, none published (the pack stays at version 0
and private). Each entry has its key, its English and Spanish name and the index fields the
lists and choices read; none has `data.en` or `data.es`. The owner writes the texts.

| Kind         | Entries | What they are                                                         |
| ------------ | ------- | --------------------------------------------------------------------- |
| `subclass`   | 36      | Three per class, with its class                                       |
| `feature`    | 246     | 183 subclass features with level, 58 feat texts, 5 species traits     |
| `feat`       | 58      | 6 origin, 41 general (level 4), 6 fighting styles, 5 epic boons       |
| `background` | 12      | Three abilities, two skills and the origin feat                       |
| `species`    | 1       | Aasimar, with five traits                                             |
| `spell`      | 52      | Level, school, class lists, concentration and ritual marks            |

With the base pack the counts match the book's: 48 subclasses, 75 feats, 16 backgrounds, 10
species and 391 spells (the 52 are the book's spells whose key the base pack lacks, compared
level by level; SRD renames such as `hideous-laughter` and `arcane-hand` count as present).

- **Source.** Line files and a build script under `content-private/phb-2024/` (ignored) produce
  one import file per kind. `npm run content:check` accepted all six: 405 entries, 405 valid.
- **Import.** Each batch went through `import_content_entries` as the super admin, by owner
  SQL, PRE first and production after it in one transaction that rolls back unless every count
  matches (added as expected, none refused) and the stored entries of the kind have the same
  MD5 as the local file's, in both environments. All four batches passed.
- **Not verified.** The lists were written from the book's structure and not compared page by
  page: names, levels, schools, class lists and the concentration and ritual marks are for the
  owner to review. Spanish names are working translations, not the Spanish edition's. A
  background names its origin feat by bare key, whether the feat is the base pack's (`alert`)
  or this pack's (`crafter`); how the reader resolves the second is part of the reader work
  below. Nothing was looked at in the library screen.

## Published (2026-11-24)

- The 246 `feature` and 52 `spell` entries carry `data.en` and `data.es`; `subclass` (36),
  `feat` (58), `background` (12) and `species` (1) carry their index only, their text being
  their features'. The source files stay under the ignored `content-private/`.
- PRE (`8bff9238-7544-4cdf-b796-809d123e1ba1`) and production
  (`981befc9-c9ec-4fc2-97e0-706539bf2561`), read back by SQL after the fact: 405 entries, 298
  with text, the pack public and at version 2. Version 1 holds the 405 entries; version 2
  republished two subclasses with the spellcasting they give (`caster: third`,
  `spellAbility: int`). No campaign uses the pack and it has no offers.
- Owner decision, 2026-11-24: the pack stays public ("Déjalo público").

## Readers: subclasses from the packs (2026-11-24)

- **Subclass choice.** The blank sheet and the full wizard ask for the subclass from the level
  the class gives it, from the campaign's packs (each pack subclass names its pack), with "none
  yet" and one typed by hand. Before, the wizard had a free text field at any level.
- **Third casters.** A subclass index can carry `caster` and `spellAbility`; a class without
  spellcasting takes them when that subclass is chosen (creation, sheet and level up) and
  loses them when it is left. A progression set by hand on the sheet stays. New caster kind
  `third`: no slots before level 3, then the full table at a third of the level, rounded up.
  The library's class and subclass forms set it.
- **Level up.** The subclass choice lists the features the subclass gives at that level; the
  grants name a resource whose die grows or whose rest changes; the review no longer repeats
  the chosen feat.
- **Sheet.** The library picker has a Feats tab (the campaign's feats, with level and pack); a
  sync names up to four features it added instead of counting them.
- **Unchanged on purpose.** An improvement still offers general feats and epic boons only (owner
  choice P5 A of RYT-171, confirmed on 2026-11-24): a draft of this slice offered origin feats
  and fighting styles too and was put back.
- **Review of the slice before it landed.** Found and fixed: files not formatted; the feat
  offer above; leaving a subclass cleared a spellcasting progression set by hand; "another
  subclass" stayed chosen after a class change; the reset line read "se recupera en Descanso
  corto o largo"; unit tests used names from the handbook, now invented ones.

## Checks

- First slices: `npm run check:fast` passed (typecheck, lint, architecture, docs with 174
  tickets, private content).
- `npm run content:check` passed on all 6 assembled files under `content-private/phb-2024/out/`
  (`36 subclass`, `246 feature`, `58 feat`, `12 background`, `1 species`, `52 spell` — 405/405
  valid, 0 problems).
- `npm run check:private` passed.
- No unit test was added for the two scripts: the parser they call has its own tests
  (`import-file` and `library` tests).
- Reader slice: `npm run check` passed (typecheck, lint, architecture, docs, unit and SQL tests,
  build). New unit tests: `progression-matrix.test.ts` (the 12 classes and their SRD subclasses
  at levels 1 to 20, level by level 1 to 20, third-caster slots, every SRD species, background
  and feat resolved in the index), a subclass that gives spellcasting and one refused without
  its ability (`class-catalog.test.ts`), a blank sheet at level 10 with a pack subclass and
  species options, die and rest changes at level up, pack subclass features by level.
- Browser, at 390px and 820px with axe, sideways overflow and touch targets: a blank sheet at
  level 3 takes a pack subclass that gives spellcasting (the sheet is created as a third caster
  with its feature); the sheet library adds a pack feat once; level up names the pack on the
  subclass card and lists what it gives; the library's subclass form sets and clears the
  spellcasting and holds Save until the ability is chosen; in the wizard a typed subclass goes
  away with a class change. `character-sheet`, `level-up`, `pack-classes`, `pack-origins`,
  `library` and `glossary` specs pass at both sizes. The whole browser suite was not run.

## Reviews

- **UI review: round 1 CHANGES_REQUIRED.** High: the subclass form saved a caster without its
  ability. Medium: the Feats tab's level switch said "features". Both fixed and covered by the
  browser tests above; the Feats tab also says it is loading until the origins arrive.
  **Round 2: PASS** on the fixed source.
- Not reviewed by a person on a device; English, the light theme and text at 150% were checked
  by the reviewer's own run, not kept as captures. The die and rest lines and the sync notice
  have unit coverage and no capture.

## Follow-ups from the UI review

- The library's tab strip wraps to two rows at 390px with text at 150%.
- "Elige uno" under "Característica de lanzamiento" (class and subclass forms) does not agree
  in gender.
- The blank sheet asks for the subclass above the level that makes it appear; "another
  subclass" is worded differently in creation and at level up; an empty Feats search only says
  "0 resultados"; the sync notice ends in a bare "(+N)".

## Still to do

- Offering the pack to the owner's campaigns once it has a published version.
- Readers: an entry of a pack other than the base pack still cites the SRD page in its source
  line; the screens that offer feats, backgrounds, species and spells are to be checked with
  this second pack enabled. Nobody has opened the real pack in a campaign on the public site:
  the subclass screens were exercised with invented content only.
- The hand-written lists (names, levels, schools, class lists, concentration and ritual marks)
  are still unverified against the book.
