# RYT-175: a private pack with the Player's Handbook content the base pack lacks

Status: in progress. First slice delivered on 2026-11-24: the file guide, the local checks and
the empty private pack. No content is loaded yet.

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

## Checks

- `npm run check:fast` passed (typecheck, lint, architecture, docs with 174 tickets, private
  content).
- No unit test was added for the two scripts: the parser they call has its own tests
  (`import-file` and `library` tests).

## Still to do

- The content itself: the owner supplies the files (subclasses and their features first, then
  feats, backgrounds and the species, then spells); each batch is checked, imported with its
  dry-run report and published as a version.
- Offering the pack to the owner's campaigns once it has a published version.
- Readers: an entry of a pack other than the base pack still cites the SRD page in its source
  line; the screens that offer subclasses, feats, backgrounds, species and spells are to be
  checked with this second pack enabled (browser tests with invented content, UI review).
