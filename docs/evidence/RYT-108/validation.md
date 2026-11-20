# RYT-108 — Accessible notification close buttons and focus after "show all"

## Changes

- Every Alert and Notification close button gets a translated name from the theme defaults
  (`createAppTheme(classTheme, closeLabel)`, `src/app/theme.ts`). `Providers` passes
  `t('common.close')`, so the name follows the language ("Cerrar" / "Close"). Components that
  set their own label keep it.
- Shop add-items dock (`src/features/shops/ui/stock-list.tsx`): "Ver todos" / "Show all"
  unmounts itself, so focus now moves to the first tile of the expanded list.
- Short landscape phones (`max-height: 30em`): the shop banner grows with its text instead of
  clipping the kind label under the height cap (`src/features/shops/ui/shops.css`).
- Item card facts: a value longer than 28 characters (the self-added container capacity sentence)
  spans the whole row instead of wrapping to six lines in a half-width tile
  (`.item-card-facts .is-wide`).
- Optional copy pass over the shop and trade hints: not done; it needs the owner's confirmation.

## Verification

- `tests/e2e/trades.spec.ts`: the "Invitación enviada a Cato." notification's close button has
  the accessible name "Cerrar", and axe now runs over the whole page with the notification shown
  (before, it was limited to `main`).
- `tests/e2e/shops.spec.ts`: "Ver todos" pressed with the keyboard leaves focus on the first tile.
- Shops, trades and inventory specs at 390 and 820 px: 59 passed, 1 skipped (a 390-only case).
- Not covered by an automated check: the 844×390 banner at 150 % text and the three-line capacity
  fact. Both are left to the UI review.

## UI review

Independent UI review of the RYT-140/108/110/111/150 batch: three rounds. Round 1 found three blockers in the Font of Magic dialog (Escape also closed the resources sheet, content not full width, unpayable levels looked selectable); round 2 found a cut mode label at 150 % text in Spanish. All were fixed; round 3 passed on the current source at 390 and 820 px, Hearth and Parchment, Spanish and English, 100 to 150 % text. Open notes: the glossary entry for species lineages is labelled as a class feature (pre-existing), and the sheet overflows horizontally at 200 % text with the dialog open.
