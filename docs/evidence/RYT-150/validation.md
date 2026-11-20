# RYT-150 — Confirmed results shown where the action happened

Owner choices on the options page (2026-11-20): P1 A (signed change kept beside the figure),
P2 A (result line where the action was), P3 A (the button says what is happening).

## Changes

- `HpMeter` (`src/features/combat/ui/parts.tsx`) compares each confirmed state with the previous
  one and shows the signed change of hit points plus temporary hit points beside that row's
  figure ("−5", "+4"), in the danger or success tone with the sign. It is derived from server
  state, so it never shows an unconfirmed change. It clears on the next change of that row or when
  the turn moves on (`TurnKey`, provided by the DM console and the table display). There is no
  animation, so reduced motion needs nothing more. Players never see enemy numbers: rows shown as
  bands have no figure and no change.
- Assistive technology: after the server confirms, the console (or the combatant detail) says
  once "Daño aplicado: Goblin 2: 5." in its polite live region. The region is cleared before
  each new sentence, so a repeat is announced again. The chip is hidden from assistive technology,
  so nothing is read twice.
- Deliveries: the DM's give button reads "Entregando a Arin…" while saving and keeps the
  selection and quantity with Retry on failure. Once saved, the inventory names the person and the
  quantity ("Entregado a Arin: Poción ×3."). The item card's give keeps its RYT-149 result line.
- The table screen wording was checked: it never claims the shared display received a change.

## Verification

- `combat.spec.ts` "RYT-145 DM row actions keep their named target through a remote turn change"
  now asserts "−5" on Goblin 2 only, nothing on Goblin 1, the single announcement, and that the
  next turn clears it (390, 820 and 1440 px).
- Not covered by an automated check: three quick turn changes, a throttled double tap on give,
  and real screen readers.

## UI review

Independent UI review of the RYT-140/108/110/111/150 batch: three rounds. Round 1 found three blockers in the Font of Magic dialog (Escape also closed the resources sheet, content not full width, unpayable levels looked selectable); round 2 found a cut mode label at 150 % text in Spanish. All were fixed; round 3 passed on the current source at 390 and 820 px, Hearth and Parchment, Spanish and English, 100 to 150 % text. Open notes: the glossary entry for species lineages is labelled as a class feature (pre-existing), and the sheet overflows horizontally at 200 % text with the dialog open.
