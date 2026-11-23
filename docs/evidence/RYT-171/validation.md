# RYT-171: species, backgrounds and feats come from the campaign's packs

Date: 2026-11-23 (block M). The owner chose the recommended options on the block M options page.
The decision record is [ADR 051](../../decisions/051-campaign-content-packs.md), section "Species,
backgrounds and feats from packs".

## What changed

- **Data.** Species, backgrounds and feats are pack entries of kinds `species`, `background` and
  `feat` in the classes category, which the app now calls "Personajes" / "Characters" (P2 A).
  - Species: speed, size, traits and the traits with options, with their names.
  - Backgrounds: three abilities, skills, origin feat and its spell list.
  - Feats: category, minimum level and whether it repeats.
  - The SRD tables of species, trait options and backgrounds left `src/`. Only the SRD keys
    remain, to translate names and select the SRD effects (P1 A).
- **Characters.** The full wizard, quick sheet, blank sheet and sheet identity edit read the
  campaign's species and backgrounds.
  - Pack entries show their pack.
  - While the library loads, fails or offers none, the choice says so.
  - A character keeps the skills and abilities its background gave (`backgroundSkills`,
    `backgroundAbilities`). Builds saved before take them from the packs when edited.
  - The SRD effects (trackers, Alert, Dwarven Toughness) still follow SRD keys.
- **Quick sheet (P4 A).** It offers the species of every pack; its classes and backgrounds stay
  the SRD archetypes.
- **Level up (P5 A).** An improvement offers the campaign's general feats (and epic boons from
  their level), with a button to their rules; another feat can still be typed.
- **Library (P3 A).** Species, background and feat forms. Each names the feature entry that holds
  the trait's or feat's text, and the library refuses an entry creation cannot read.

## Production data

- **Migration `20261223120000_pack_origins.sql`.**
  - Applied to staging, then production with the PRE mirror (public first, then PRE).
  - The stored statement matches the LF file: md5 `efa58961638796f5eaa5d1583a959bba`, 2214
    characters.
  - Before the apply, no entry of these kinds existed in public or PRE.
  - The PRE index reads `pre_private.content_category`.
- **SRD version 3.**
  - Contents: 9 species, 4 backgrounds and 17 feats.
  - Source: `tests/fixtures/srd/origins.json`, built from the tables that left the code and their
    translations.
  - Loaded through the library RPCs as the SRD owner and published. The md5 of the 30 sorted keys,
    `abca7fba253360a0e7d1301d387f12eb`, matches on both sides.
  - The classes category of the SRD now has 286 entries.
- **Campaigns.**
  - The 3 production campaigns and the 2 PRE campaigns pin the SRD at version 3.
  - The 30 new rows were copied to PRE (1412 rows), public to pre only.
- **Smoke test** (rolled back): a campaign member reads the classes index at version 3, with 286
  rows: 9 species, 4 backgrounds and 17 feats, Acolyte with its feat and spell list.
- **Security advisors:** no new finding.
- The temporary load table was dropped.

## Acceptance

| Criterion | Evidence | Result |
| --- | --- | --- |
| A campaign with the SRD offers the same species, backgrounds and feats, with the same effects | `origin-catalog.test.ts` (9/4/17 from the published data); `resources.test.ts` (every SRD species option a tracker needs exists in the pack data; tracker counts at level 20 for every class, species and background); `rules.test.ts` and `creation-flow.test.ts` (seeded traits, feat and skills); level-up, character-sheet and characters e2e | Met |
| A custom pack can add a species, a background or a feat that creation offers | `pack-origins.spec.ts`: the wizard lists "Tritón · Libros del dueño" with its option and "Marinero" with its pack feat and three abilities; the quick sheet shows the pack species. `level-up.spec.ts`: a campaign feat is picked with its rules link. `library.spec.ts`: the three forms save what creation reads | Met |
| Existing characters keep their species, background and feats | Builds are unchanged. Old seeds get their glossary entry (`linkOriginFeatures`). Background skills and abilities are taken from the packs when an older build is edited (`withBackgroundFacts`). The SRD background trackers are kept (level-up history e2e) | Met |
| UI: 390px and 820px, both themes and languages, keyboard and Escape, axe | `pack-origins.spec.ts`, `library.spec.ts`, `level-up.spec.ts`, `content-choice.spec.ts`; captures in `docs/evidence/ui-review/ryt-171/` | Met: UI review PASS on the second round |

## Checks

- `npm run check`: typecheck, lint, contracts, 1230 unit and PGlite tests, build. New tests:
  - the origin catalog, reading only a build's own options;
  - pack backgrounds with their own feat in the glossary index;
  - the library refusing an unreadable entry;
  - the database serving the three kinds in the classes category to members only.
- `npm run test:e2e`, full suite: 1571 passed, 5 failed, 178 skipped.
  - One failure was the library test that read the list before it loaded, fixed in 30eae557.
  - The other four (identity on desktop, shop links on tablet) ran while other work used the
    machine. All five pass when run alone (83 runs with the changed specs).
- Security review: no blocking finding. Fixed:
  - PRE applied after public;
  - options read only through own keys;
  - the security notes.

## UI review

- First round: CHANGES_REQUIRED, on the library forms and level up:
  - a refused feat save marked no field;
  - 20 px check boxes;
  - the origin feat was a typed key;
  - abilities and skills past their limit dropped the first one silently;
  - Ability Score Improvement was offered as a feat;
  - the trait row was too narrow on a phone;
  - the bonus hint was SRD-only.
- Fixed:
  - the refused save marks its field;
  - whole-row 44 px check boxes;
  - an origin-feat list from this pack and the SRD, with another feat by its key;
  - boxes past the limit are disabled;
  - Ability Score Improvement is no longer offered;
  - trait names stack on phones;
  - generic hint copy.
- Also done: no text fields on these forms, the pack name set apart on quick tiles, aligned feat
  fields, and the blank sheet's selects disabled while loading.
- Second round: PASS.
- Minor notes left: a typed feat key is not checked against the packs, and the English "Rules of
  Grappler" wording.

## Not tested

- The browser against hosted Supabase: creating a character with the SRD version 3.
- WebKit/iOS and screen readers.
- Effects of pack species and feats: they are noted by hand (owner choice P1 A).
