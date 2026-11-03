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

## Round 2 (focused re-review of 77c477f)

- Date: 2026-11-03.
- Snapshot: commit `77c477f` (fixes for F1 to F7, on top of `b3f5e50`).
- Source fingerprint (`node scripts/check-ui-review.mjs --fingerprint`):
  `2f2d60d0dbc3508cc5dec69bf933c27819f9024545d97f09e951d8ec49d07429`

### Verdict: PASS

F1 to F7 are fixed in a real browser, and nothing regressed. Two small observations remain;
neither blocks the delivery.

### Status of each finding

- **F1: resolved.**
  - Removal from the row ⋯ menu, cancelled with Escape or with "Cancelar": focus returns to that
    row's ⋯ button (390, 820 and 1440 px; ES dark and EN light).
  - Keyboard path (Enter, ArrowDown ×3, Enter, Escape): same result. The next Tab moves on to
    the panel tabs instead of the skip link.
  - "Cambiar iniciativa": focus returns to the row's ⋯ after Escape and after saving.
  - Right click, then remove, then Escape (1440 px): focus returns to the row's ⋯.
  - Detail DM menu at 1440 px: after a removal (Escape) or "Editar valores" (Escape), focus
    returns to "Más controles del DM para {name}".
  - Confirming a removal still moves focus to the neighbouring row, and the turn announcement
    still works ("Turno de Bea. Ronda 1.").
  - Detail ⋯ at 390/820 px: after "Editar valores" and Escape, focus returns to the ⋯ in the
    sheet. After a cancelled removal, the sheet reopens and focus goes to its close button (see
    O1).
- **F2: resolved at the touch-event level.**
  - With CDP `Input.dispatchTouchEvent` (390 and 820 px), holding a row for 650 ms or 1200 ms
    and releasing leaves the menu open, and the detail sheet does not open.
  - Tapping a menu item by touch opens its dialog. Pressing Escape then returns focus to that
    row's ⋯.
  - A gesture-level long press (`synthesizeTapGesture`, 800 ms) also leaves the menu open.
  - A short tap afterwards still opens the detail, so the hold flag resets correctly.
  - Dragging (scrolling) from a row opens neither the menu nor the sheet.
- **F3: resolved.** Both dialogs now use `.combat-dialog-actions`:
  - At 820 and 1440 px, and for the join dialog at 390 px: one row, Cancel on the left and the
    action on the right.
  - Removal dialog at 390 px: the buttons stack at full width (302 px), with "Quitar del
    combate" above "Cancelar". At 150% both dialogs stack this way.
  - At 150% on a 390 px screen, the destructive label wraps onto two lines inside its full-width
    button (66 px tall). This is acceptable at that text size.
  - This looks deliberate, not like a leftover wrap.
- **F4: resolved.** Closing the sheet with Escape after opening it from "Ahora …" (keyboard or
  pointer) returns focus to `#combat-turn-now`. Opening it from a row returns focus to that row,
  including when it is closed with "Cerrar el detalle".
- **F5: resolved.** The detail button is named "Más controles del DM para {name}" in ES and
  "More DM controls for {name}" in EN. "Opciones de Arin" is now unique on the 1440 px layout.
- **F6: resolved.** The chips measure 35×35 at 100% and 53×53 at 150%; the content (33 and
  51 px) stays inside the padding.
- **F7: resolved.**
  - The list of characters to add has no hint line.
  - The join dialog goes straight from its title to "Total". The Player initiative dialog keeps
    its hint, since `hideHint` defaults to false (checked in code).
  - The turn-bar button's accessible name is now "Ahora · Ronda 1, Arin, Después: Bea. Ver
    detalle". It contains the visible text in order, so the visible label is part of the name.

### Regression checks (browser)

- **Turn following (1440 px)**:
  - The detail starts on Arin and follows "Siguiente turno".
  - A row picked by hand is replaced at the next turn.
  - Focus on "Curar" plus a turn change from a second DM session: the detail held for 1.5 s and
    after the DM left it, while the announcement said "Turno de Goblin 2".
  - The next turn then moves the detail to Arin.
- **Join preview**: "esta ronda, justo después de Goblin 2" at 15, and "they act from round 2"
  at 25 (EN). Escape returns focus to the character's row.
- **Removing the acting combatant**: the dialog text is correct and the turn passes to Bea.
- **Player**: the table view has no exit link and no full screen button; the Player console has
  no row menus. The DM table view keeps the exit link and has no full screen button.
- **Axe** (wcag2a/2aa/21aa): no violations. Checked:
  - join dialog: ES dark and EN light at 390/820/1440 px
  - removal dialog: EN light at 390/820/1440 px
  - DM console at 1440 px
  - Player table view and Player console at 390/820/1440 px
- **Layout**: no horizontal overflow at 390, 820 or 1440 px, at 100% and at 150%.
- **No new page errors.**

### Observations (do not block)

- **O1, nit**: on 390 and 820 px, cancelling a removal started from the ⋯ inside the detail
  sheet reopens the sheet with focus on "Cerrar el detalle" rather than on that ⋯. Focus is not
  lost: it stays at the start of the dialog the DM was using. The drawer's autofocus on reopen
  takes precedence over `restoreFocus` (`dm-console.tsx`, Drawer `opened` includes
  `!removing`).
- **O2, pre-existing (present since `c9ed08f`)**: while the characters query is still loading,
  "Añadir combatientes" briefly says "Todos los personajes ya están en este encuentro."
  (`add-combatants.tsx`, `missing.length === 0`). This can be fixed separately with a loading
  state.

### Method and limitations

- I built this worktree into `dist-review` and served it on 127.0.0.1:4237 in Supabase fixture
  mode, then drove it with throwaway Playwright scripts outside the repository. Viewports:
  390×844 with touch, 820×1180 with touch, 1440×1000.
- Touch was emulated through CDP, so I have not verified on real iOS Safari or Android Chrome.
  Chromium only; no real screen reader; only the Default class theme.
- I did not re-run the repository's `npm run check` or e2e suite in this round.
- Fast automation can press Escape within about 100 ms of a menu item opening a dialog. When
  that happens, Mantine has not yet moved focus into the dialog, and the Escape is ignored. With
  more realistic delays (450 ms or more) it never happened. I do not count it as a finding.
- This verdict applies only to the fingerprint above.
