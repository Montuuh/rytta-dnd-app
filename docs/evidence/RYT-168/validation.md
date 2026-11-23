# RYT-168: classes and subclasses come from the campaign's packs

Date: 2026-11-23 (block K). The owner chose the recommended options on the block K options page.
The decision record is [ADR 051](../../decisions/051-campaign-content-packs.md), section "Classes
and subclasses from packs".

## What changed

- **No migration.** Classes and subclasses travel in the classes category with the class features,
  as index rows of kinds `class` and `subclass`, through the readers of block I.
- **Glossary**:
  - The glossary keeps class and subclass rows apart from its entries.
  - Inside a pack other than the SRD, a class or subclass named by its bare key is that pack's
    own, and is read as `<ref>--<key>`. This applies in features, spells and subclasses.
  - Pack class names show in the glossary.
- **Characters**:
  - A class catalog (`domain/class-catalog.ts`) holds each class's table: hit die, saves, skill
    choices, slot progression and spellcasting ability, subclass level, improvement levels,
    prepared spells by level and cantrips.
  - Creation (full wizard and blank sheet), level up and the sheet's class and subclass fields read
    that catalog.
  - An SRD pinned at a version without classes keeps the app's SRD classes, which hold the same
    data.
  - The quick path keeps its SRD archetypes.
  - Resources with uses stay in the app for the SRD classes.
- **Library**:
  - Classes and subclasses have forms.
  - The class of a feature or subclass can be an SRD class or another class by its key.
  - Spells can name pack classes.
  - "Completar el SRD" uploads what the SRD pack still lacks: items, the 12 classes and their 12
    subclasses.

## Acceptance

| Criterion | Evidence | Result |
| --- | --- | --- |
| The SRD packs offer the same classes and subclasses, with the same mechanics, as before | `class-catalog.test.ts`: the 12 SRD classes round-trip through their library index, and the level-up tables are unchanged. Level-up, creation and sheet e2e specs pass | Met |
| A custom pack can add a class or a subclass that creation and level up offer | `pack-classes.spec.ts`: the wizard lists "Caballero rúnico" with its pack; a blank sheet takes it with hit die, saves and its level 1 feature; level up offers "Colegio de los gigantes" beside the SRD subclass and adds its feature | Met |
| Existing characters keep their class, subclass and features | Builds are unchanged; a hidden class stays readable for sheets that have it (`class-catalog.test.ts`) | Met |
| UI: 390px and 820px, both themes and languages, keyboard, axe | `pack-classes.spec.ts`, `library.spec.ts` | Met; UI review below |

## Checks

- `npm run check`: 1219 tests pass, then the build.
- `npm run test:e2e`, full suite: 1553 passed, 4 failed, 172 skipped.
  - The 4 failures (identity invitation on desktop; bestiary, legal and level-up axe on mobile)
    ran while a formatting fix was being made beside the suite. All 4 pass when run alone (23
    runs).

## Owner step pending

In the library, press "Completar el SRD" and publish the new SRD version. Campaigns then see the
version's classes after their DM accepts it in Content. Until then, they keep the app's SRD classes.

## Not tested

- The browser against hosted Supabase, and uploading and publishing the classes in production.
- WebKit/iOS and screen readers.
- Class resources for pack classes: they are tracked by hand (owner choice P1 A).

## UI review

An independent UI review took three rounds and ended in PASS on fingerprint `cf810abb…`.

1. **Changes required.** An invalid class did not say which field to fix. Three minor notes:
   - the class step hint mentioned only the SRD;
   - prepared spells sat on a single line;
   - the upload button read "Subir 0 entradas" while loading.
2. **Changes required.** A new class without spells could not be saved, and its errors showed
   before typing. Fields now name their own errors, after they are filled or after a refused save.
3. **PASS.**

Open minor note: on a new class, the browser's own "fill out this field" check on "Habilidades a
elegir" stops the first save before the form marks the other fields.
