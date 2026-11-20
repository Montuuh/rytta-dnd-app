# RYT-126 — Player journey fixes: combat, table display, map and rest

Delivered in `f34c726` (merged to main through PR 13 on 2026-11-18, live on rytta.pages.dev).

## Verification

- Unit: `combat.test.ts` (staleness, turn projection, announcements), `tabletop/domain/model.test.ts`
  (lenient item parsing) and `tabletop/ui/limits.test.ts`.
- Browser: `combat.spec.ts` (own-character notices, hidden turns, initiative warnings, ties, the
  recap), `tabletop.spec.ts`, `phone-map.spec.ts`, `rest.spec.ts` and `glossary.spec.ts` at 390 and
  820 px.
- Table screen at 1280 px and 150 % text: covered by `table-screen.spec.ts` (sizes 820, 1280 and
  1920; "RYT-131 long names stay in their rows" at 100 % and 150 % text, with and without a wide
  font), which passes in the full browser run of 2026-11-20.

## UI review

The independent UI review of the four journey tickets ran on 2026-11-18: the first pass returned CHANGES_REQUIRED (wizard ability increases left unasked, class-loss notice out of view, item facts at 150 % text and others); the focused re-review the same day passed at 390 and 820 px in both themes and languages. Its remaining notes were minor (campfire arc rarely used, long names in rest rows).
