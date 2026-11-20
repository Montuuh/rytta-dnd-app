# RYT-124 — Player journey fixes: character creation and sheet

Delivered in `f34c726` (merged to main through PR 13 on 2026-11-18, live on rytta.pages.dev).

## Verification

- Unit: `creation-flow.test.ts` (gaps, class change loss, standard array, point buy) and
  `submit-guard.test.ts` (one request per dialog opening).
- Browser: `character-sheet.spec.ts` and `characters.spec.ts` (the three creation paths, the full
  wizard with its review step and leave guard, the sheet in play) at 390 and 820 px.
- Class theme close-out (2026-11-20): `character-sheet.spec.ts` "RYT-124 the creation wizard
  reads in a class theme" runs the full wizard's class and origin steps in the Warlock theme at
  390 and 820 px with axe, overflow and 44 px targets; the sheet's condition grid is already
  checked in Warlock and Druid by "RYT-025 sheet widgets". Both pass.

## UI review

The independent UI review of the four journey tickets ran on 2026-11-18: the first pass returned CHANGES_REQUIRED (wizard ability increases left unasked, class-loss notice out of view, item facts at 150 % text and others); the focused re-review the same day passed at 390 and 820 px in both themes and languages. Its remaining notes were minor (campfire arc rarely used, long names in rest rows).
