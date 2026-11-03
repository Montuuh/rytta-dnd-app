# RYT-041 independent UI/UX review

- Reviewer role: `ui-ux` (`.codex/agents/ui-ux.toml`), independent of the implementer.
- Date: 2026-11-03.
- Snapshot: branch `worktree-agent-ad6415396ef8d5d0d`, commit `b3f5e50`.
- Source fingerprint (`node scripts/check-ui-review.mjs --fingerprint`):
  `bba8441b3b5dcc3755900765a69d2a59d925c8ae0ddbf81a9f2dc1d57481104a`

## Verdict: CHANGES_REQUIRED

One major keyboard/focus defect is in the new row-menu flows, and several smaller issues
remain. Everything else in the delivery works as described and meets the design bar:

- The detail follows the turn and holds while the DM is busy.
- Turn changes are announced.
- The menus are contextual.
- The join preview is well designed.
- Axe found no violations.

## Findings

### F1. Major: focus is lost after cancelling a dialog opened from the row menu

- Paths: `src/features/combat/ui/roster.tsx:46`, `src/features/combat/ui/roster.tsx:53`,
  `src/features/combat/ui/dm-console.tsx:570-590`, `src/features/combat/ui/helpers.ts:139-152`.
- Where: 390, 820 and 1440 px. Seen in ES dark and EN light; the bug does not depend on theme
  or language.
- Reproduction:
  1. Open a combatant's options (⋯ button, long press or right click).
  2. Choose "Quitar del combate".
  3. Press Escape or click "Cancelar".
- Result: `document.activeElement` is `<body>`, and the next Tab lands on "Saltar al
  contenido".
- Same result: choosing "Cambiar iniciativa" and then pressing Escape. That menu entry is new in
  this delivery.
- Confirming a removal works correctly: focus moves to the neighbouring row.
- Cause: the dialog mounts while the `Menu.Item` has focus. Both `useReturnFocus` and Mantine's
  Modal record that menu item as the opener, but the item unmounts when the menu closes, so
  focus has nowhere to return.
- Impact: a DM using a keyboard or switch loses their place in the initiative list every time
  they back out of a removal. This breaks the design-system rule "Focus trapping, Escape and
  return focus for overlays" and WCAG 2.4.3.
- Fix: when a menu action fires, store the row's options button (or the row's main button) as
  the return target and focus it when the dialog closes. Add an e2e assertion for focus after
  Escape and after Cancel, for both removal and change initiative.

### F2. Minor (device check needed): with raw touch input, the long-press menu closes when the finger lifts

- Paths: `src/features/combat/ui/initiative-rail.tsx:159`, `src/shared/ui/use-long-press.ts`.
- Where: 390 and 820 px with touch (Chromium touch emulation).
- Reproduction with CDP `Input.dispatchTouchEvent`: touchStart on Bea's row, hold 650 ms,
  touchEnd.
  - During the hold: the menu is open (1 menu).
  - After release: Chromium sends compatibility `mousedown/mouseup/click`. The `mousedown`
    counts as a click outside the menu, which closes it (0 menus).
- With a gesture-level long press (`Input.synthesizeTapGesture`, 800 ms), no mouse events are
  sent and the menu stays open. Short taps open the detail sheet, and dragging (scrolling) from
  a row never opens the menu. Both are correct.
- The implementer's e2e uses `page.mouse.down/up`, so it does not exercise touch input.
- Impact: on some real devices the long-press shortcut may flash open and close straight away.
  The visible ⋯ button still works, so the feature can still be reached.
- Fix: check on a real iOS Safari and Android Chrome device. Alternatively, open the menu on
  release, or ignore the trailing compatibility `mousedown`. Add a touch-level e2e.

### F3. Minor: dialog action rows wrap awkwardly on phones

- Paths: `src/features/combat/ui/roster.tsx:95` (removal),
  `src/features/combat/ui/amount-dialog.tsx:306` (join keypad).
- Where: 390 px, ES. Worse at 150% text.
- What happens: in a 390 px dialog, "Cancelar" (108 px) and "Quitar del combate" (205 px) do
  not fit on one line. "Cancelar" ends up alone and right-aligned, with the red button on the
  next line (measured y 185 vs 245). The join dialog wraps the same way ("Añadir al combate").
  At 150% the destructive label also breaks across two lines.
- Impact: this looks accidental, which falls short of the user's craft bar. On a destructive
  confirmation, the order and weight of the two buttons are ambiguous.
- Fix: deliberately stack full-width actions on phones (for example, the destructive button
  full width with Cancel beneath it), or use a non-wrapping group with grow.

### F4. Minor: closing the phone/tablet detail sheet does not return focus to the turn bar

- Path: `src/features/combat/ui/dm-console.tsx:502`.
- Where: 390 and 820 px.
- Reproduction: focus the "Ahora · Ronda 1 … , ver detalle" button in the turn bar, press
  Enter, then press Escape.
- Result: focus goes to the acting combatant's row in the initiative list, not the turn-bar
  button that opened the sheet. The list also scrolls.
- Impact: the keyboard user is moved away from the turn controls they were using.
- Fix: return focus to whichever control opened the sheet. Use the row only when the sheet was
  opened from the row.

### F5. Minor: two different menus share one accessible name

- Paths: `src/features/combat/ui/roster.tsx:35`,
  `src/features/combat/ui/combatant-detail.tsx:611`.
- Where: 1440 px, both languages.
- What happens: the row's ⋯ menu (give turn / change initiative / remove) and the "Controles del
  DM" ⋯ menu in the detail panel (edit stats / remove) are both named "Opciones de {name}" /
  "Options for {name}".
- Impact: screen-reader and voice-control users get two identical names for different menus.
  My own scripted check hit a strict-mode ambiguity because of this.
- Fix: give the detail panel's button its own name, for example "Más controles del DM para
  {name}".

### F6. Nit: the join-preview initiative chips are fixed at 32 px

- Path: `src/features/combat/ui/combat.css:839-848`.
- Where: 390 px at 150% text.
- What happens: two-digit totals fill the box edge to edge and touch the border.
- Fix: size the chip in `em` or use `min-width` with padding.

### F7. Nit: text that repeats what the screen already says

- Paths: `src/features/combat/ui/add-combatants.tsx:115`,
  `src/features/combat/ui/dm-console.tsx:547`.
- "Elige un personaje y escribe su total de iniciativa." above the character list adds little:
  tapping a row opens a dialog titled "{name} entra en combate" with a "Total" field.
- Inside that dialog, the existing hint "Escribe el total de Cato." repeats the title and the
  label.
- The turn-bar button's accessible name has a stray space before the comma: "… Después: Bea ,
  ver detalle".

## What passed (browser-verified)

- **DM row menu**:
  - Each row has a 44 px ⋯ button in its own ruled column. It fits next to the tie arrows at
    390 px (checked with a tied initiative).
  - Menu items have icons, are 44 px tall, and the destructive item is red and separated by a
    divider.
  - "Give turn" is hidden for the acting combatant.
  - Keyboard: Enter opens the menu, arrow keys move through it, and Escape returns focus to ⋯.
  - Right click on laptop opens the same menu. Opening it closes any other open menu.
- **Removal dialog**:
  - The text states the consequence: who takes the turn, or "nobody else can act" when no one
    is left; for a character, that HP and conditions are kept.
  - Initial focus goes to the close button, not the destructive button.
  - Confirming moves focus to the neighbouring row, and the turn passes on with an
    announcement ("Turno de Bea. Ronda 1.").
  - On phones, removing from the sheet's DM menu hides the sheet while the dialog is open and
    brings it back on cancel, with focus on the sheet's close button.
- **Join**:
  - Characters not yet in the fight are listed as designed rows with an accent "add" glyph, not
    default buttons. While the fight runs, a row opens the keypad dialog.
  - The placement preview shows the neighbours, the new slot marked with the accent bar,
    filled chip and icon, and a hidden "entra aquí" label for screen readers.
  - The message is correct for this round ("justo después de X") and for the next round (a
    slot above the acting combatant, or 25 when the acting combatant is first). With the
    lowest total, the slot appears last.
  - After saving, focus goes to the next character in the list; Escape returns focus to the
    row that opened the dialog.
  - In a draft encounter, a row adds the character directly and focus moves to the next row.
- **Turn following (1440 px)**:
  - The detail opens on the acting combatant at start and follows Next.
  - A row the DM picks stays shown until the turn changes.
  - With focus inside the detail (on "Curar"), a turn change made from a second DM session did
    not swap the detail for 5.5 s. It stayed until the next turn, even after the DM left the
    detail. The announcement still said "Turno de Goblin 1".
  - Note: right after a local Next, the detail lagged up to one 200 ms sample behind the bar.
    I treat this as negligible.
- **Turn bar**:
  - Focus stays on "Siguiente turno" after Enter.
  - "Turno anterior" uses `aria-disabled` and is reported as disabled on the first turn.
  - On phones and tablets, "Ahora …" is a button that opens the acting combatant's detail.
- **Table view**:
  - Players see no exit link and no full screen button; they move around through the bottom
    bar.
  - The DM keeps "Salir de la vista de mesa"; no one has a full screen button.
- **Axe** (wcag2a/2aa/21aa): no violations in the console, join dialog, detail sheet, Player
  table view, EN-light removal dialog and EN-light join dialog. Checked at 390 and 820 px
  everywhere, and at 1440 px for the console, join and Player table view.
- **Layout**: no horizontal overflow at 390, 820 or 1440 px, including at 150% text in the
  console, removal dialog and join dialog.
- **Reduced motion**: both `reduce` and `no-preference` render correctly; scrolling the acting
  row into view respects the setting.

## Tested scenarios and evidence

Browser-tested in Chromium (Playwright 390x844 touch, 820x1180 touch and 1440x1000). I built
and served this worktree myself (`vite build --outDir=dist-review`, preview on 127.0.0.1:4193)
in Supabase fixture mode, using the repository's `combatServer` and `identityFixture`. The
review scripts and captures were kept outside the repository and deleted afterwards.

- ES dark, DM:
  - console load
  - row menu by keyboard and pointer
  - removing an NPC (cancel) and the acting character (confirm)
  - join at 18, 25, 2 and 12
  - next turn by keyboard
  - giving the turn from the menu
  - opening and closing the turn-bar sheet
  - the sheet's DM menu
  - right click
  - 150% text
  - the rows with tied initiative
  - draft list rows
- EN light, DM: menu, removal dialog and join dialog (19, 15) at 390 and 820 px.
- Touch: long press with raw touch and with a synthesized gesture, a short tap, and a drag
  starting on a row.
- Two DM sessions: a turn changed from the second session while the first was focused in the
  detail or typing notes.
- Player: the console has no row menus; the table view has no exit and no full screen button.
  DM table view checked as well.
- I also inspected the implementer's captures in `docs/evidence/RYT-041/` (turn-focus, join,
  remove-active, player-table, at 390 and 820 px).

## Limitations

- Chromium only. I did not test real iOS Safari or Android Chrome, which matters most for F2.
  I did not use a real screen reader; live-region text and accessible names were read from the
  DOM and accessibility tree.
- Supabase was the SDK fixture, not hosted PostgREST or Realtime; remote updates came through
  the fixture's polling.
- At 1440 px I did not test light theme. Only the Default class theme was checked.
- I did not test focus after cancelling a removal started from the detail's DM menu at 1440 px.
  It probably has the same cause as F1.
- This verdict applies only to the source fingerprint above.
