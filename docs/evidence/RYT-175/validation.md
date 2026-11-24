# RYT-175: a private pack with the Player's Handbook content the base pack lacks

Status: in progress. First slice delivered on 2026-11-24: the file guide, the local checks and
the private pack. Second slice, same day: a skeleton of the missing entries, as unpublished
drafts with names and index data and no text.

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

## Checks

- `npm run check:fast` passed (typecheck, lint, architecture, docs with 174 tickets, private
  content).
- No unit test was added for the two scripts: the parser they call has its own tests
  (`import-file` and `library` tests).

## Still to do

- The texts: the owner writes each entry's text in the library (or supplies files with it) and
  reviews the skeleton against the book; the pack is published as a version once entries have
  their text. An entry published without text has no body for the glossary to show.
- Offering the pack to the owner's campaigns once it has a published version.
- Readers: an entry of a pack other than the base pack still cites the SRD page in its source
  line; the screens that offer subclasses, feats, backgrounds, species and spells are to be
  checked with this second pack enabled (browser tests with invented content, UI review).
