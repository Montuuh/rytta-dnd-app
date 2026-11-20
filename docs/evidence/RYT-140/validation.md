# RYT-140 — Combat error toast readable over the list

## Change

`.combat-toast` (src/features/combat/ui/combat.css) gets an opaque base,
`var(--mantine-color-body)`, under the alert's translucent danger tint, and clips to its radius.
The theme's body colour follows every class theme, so the list never shows through the text. The
alert, its tone, the 44px close target, the pause on hover and focus and the safe-area offset are
unchanged.

## Verification

- `RYT-007 action errors stay in view next to the action and floating ones leave`
  (tests/e2e/combat.spec.ts) now also asserts the toast surface's computed background is an opaque
  `rgb(...)`. It passes at 390, 820 and 1440 px with axe and the existing close, pause and focus
  checks.
- Contrast: axe (wcag2aa, including color-contrast) runs while the toast is shown in the default
  theme and passes. Parchment and a class theme are checked in the UI review captures; no unit
  contrast test covers the danger tint pairing.
- Independent UI review: see the batch review record.

## UI review

Independent UI review of the RYT-140/108/110/111/150 batch: three rounds. Round 1 found three blockers in the Font of Magic dialog (Escape also closed the resources sheet, content not full width, unpayable levels looked selectable); round 2 found a cut mode label at 150 % text in Spanish. All were fixed; round 3 passed on the current source at 390 and 820 px, Hearth and Parchment, Spanish and English, 100 to 150 % text. Open notes: the glossary entry for species lineages is labelled as a class feature (pre-existing), and the sheet overflows horizontally at 200 % text with the dialog open.
