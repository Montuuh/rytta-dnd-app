# RYT-111 — Creation wizard: species options such as Giant Ancestry

Owner choice on the options page (2026-11-20, P7: A): option cards with their rules line.

## Changes

- Origin step (`src/features/characters/ui/creation/species-options.tsx`): a species with a
  required option (Dragonborn ancestry, Elven lineage, Gnomish lineage, Giant Ancestry, Fiendish
  legacy) shows a radio group of cards. Each card shows the option and its first rules line from
  the glossary entry (the paragraph led by the option, or its table row). Dragonborn ancestries
  already name their damage type. A link opens the trait's glossary entry.
- The choice is stored in `build.choices` exactly as the sheet stores it, so trackers that depend
  on it are granted alike. A new species drops the old choice.
- `validateStep('origin')` adds the blocking issue `chooseSpeciesOption`
  ("Elige una opción de tu especie."): Next and Finish stop until it is chosen. Save and exit does
  not block, and existing characters keep choosing on the sheet.

## Verification

- Unit: `creation-flow.test.ts` (issue raised and cleared, the forest gnome's tracker granted, a
  species without options never asks, a new species drops the choice) and
  `species-option-text.test.ts` (paragraph, table row, ancestry without text, no body).
- Browser: the full wizard in `character-sheet.spec.ts` now presses Next without a lineage, sees
  the issue, finds three lineage radios with the rules text, picks High Elf and continues. The
  other wizard flows pick High Elf. Character, sheet and level-up specs at 390 and 820 px: 168
  passed.

## Not covered

- Quick build (`quick-build.tsx`) still creates without the option; the sheet asks for it there.

## UI review

Independent UI review of the RYT-140/108/110/111/150 batch: three rounds. Round 1 found three blockers in the Font of Magic dialog (Escape also closed the resources sheet, content not full width, unpayable levels looked selectable); round 2 found a cut mode label at 150 % text in Spanish. All were fixed; round 3 passed on the current source at 390 and 820 px, Hearth and Parchment, Spanish and English, 100 to 150 % text. Open notes: the glossary entry for species lineages is labelled as a class feature (pre-existing), and the sheet overflows horizontally at 200 % text with the dialog open.
