# ui-ux review: combat module (RYT-007, RYT-035, RYT-036, RYT-037)

- Reviewer role: `.codex/agents/ui-ux.toml` (independent subagent, implementation read-only)
- Reviewed source: `ca3ad37` (UI code from `aa83cd7` + `1718159`; `ca3ad37` is docs only)
- UI source fingerprint (`node scripts/check-ui-review.mjs --fingerprint`):
  `43ee0c9eb46fc6e9d3d43c77bcd018292a9753e0f8cf2b985a24f23863258283`
- Date: 2026-11-03

## Verdict: CHANGES_REQUIRED

The core flows work in a real browser: prepare, initiative, turns, area damage with half on a
save, undo, the table view and the summary. They also pass the delivery's own e2e (Spanish, dark).
Testing outside that path found three blockers and several major issues:

- A WCAG AA contrast failure in the light theme.
- On wide layouts, one combatant's private DM notes are shown and saved on another combatant.
- At 150% text on a phone, the turn bar hides who is acting.
- Failed actions give no feedback.
- Dialogs lose keyboard focus when they close.
- Some touch targets are smaller than 44px.

## Findings

Viewports: m = 390x844, t = 820x1180, w = 1180x820 (landscape tablet/laptop, ≥ 62em layout).
All were run with touch emulation.

### Blockers

**B1. Light theme: the "Heal" button fails AA contrast (3.8:1).**
`src/features/combat/ui/combatant-detail.tsx:103-110` (`variant="light" color="green"`). The same
pattern is at `src/features/combat/ui/dm-console.tsx:167-174` (multi-target "Heal").
- Where: m/t/w, light, EN and ES.
- Reproduce: Settings → Light, open any combatant's detail (DM) or the own-character panel (Player).
- Evidence: axe `color-contrast` (serious), #2b8a3e on #d3f9d8 at 16px. It is flagged on every
  screen that shows the HP actions: DM detail, death saves, Player initiative, Player turn,
  teammate drawer and stale state. See `en-light-detail-m.png` and `en-light-player-turn-m.png`.
- Impact: the most-used Player action fails WCAG AA in one of the two shipped schemes. The
  delivery's e2e audits dark mode only, so it missed this.
- Fix: use semantic tokens or theme-tested colours instead of raw Mantine `green`/`red` light
  variants, and add a light-theme axe pass to the combat spec.

**B2. Wide layout: detail form state leaks between combatants, including private DM notes.**
`dm-console.tsx:99-111` renders `<CombatantDetail>` without `key={selected.id}`. As a result,
`DmControls` notes (`combatant-detail.tsx:540`), the concentration spell (`:277`), the conditions
"editing" toggle (`:212`) and `hpMode` (`:52`) survive a selection change.
- Where: w (≥ 62em), any theme or language.
- Reproduce: select Goblin 1, type and save the note "Carries the bridge key", type "Bless" in
  Spell, then select Goblin 2.
- Result: Goblin 2 shows "Carries the bridge key" with **Save notes enabled** and "Bless" in the
  Spell field. The server still holds an empty note for Goblin 2. The conditions picker also
  stayed open when switching to Arin (`en-light-death-save-failure-w.png`).
- Evidence: `en-dark-wide-goblin2-carries-goblin1-notes-w.png`.
- Impact: the DM is shown another creature's secret notes as this one's, and one tap writes them
  to the wrong combatant.
- Fix: key the detail by combatant id, or reset the local state when the id changes. Also
  re-sync notes when `dm_notes` changes on the server.

**B3. Phone at 150% text: the turn bar overlaps itself and hides the active combatant.**
`combat.css:361-392`, `dm-console.tsx:412-461`.
- Where: m, 150% root text, ES dark (EN behaves the same way).
- Result: the bar grows to 210px. "Ahora · Ronda 1" wraps word by word under the "Siguiente
  turno" button, and the active name does not appear at all. See `es-dark-150-dm-active-m.png`.
- Impact: this breaks the DM's main every-turn job ("know at a glance whose turn it is") and is a
  resize-text failure (WCAG 1.4.4). Tablet and wide at 150% are acceptable.
- Fix: at narrow widths or large text, stack the bar. Put the name and "up next" on one row and
  the buttons on a second row, or let the Next button shrink to an icon with a visible label
  above it. Keep the name unclipped.

### Major

**M1. Failed mutations are invisible while a dialog or drawer is open.**
Every screen has a single `RunnerError` at the top of the page (`dm-console.tsx:314`,
`player-view.tsx:148`). The dialogs (`amount-dialog.tsx` AmountDialog and InitiativeDialog;
`combatant-detail.tsx` EffectDialog at `:404-536`, StatsDialog at `:726-825` and the remove modal
at `:700-721`) and the mobile detail drawer have no error slot of their own.
- Where: m/t/w, all themes.
- Reproduce: in the fixture, add an effect (the route is not implemented) or record a death save.
  Separately, block `apply_combat_hp` and apply multi-target damage.
- Result: the dialog stays open with no message. The alert is "covered by" the modal or drawer
  (m/t) or scrolled off-screen at top −140px (w). See `en-light-effect-failure-m.png`,
  `en-light-death-save-failure-w.png` and `en-light-multi-failure-m.png`.
- Impact: in the middle of a fight the DM or Player cannot tell that nothing was saved, and
  retries blindly.
- Fix: show the runner error inside the active dialog or drawer (for example, pass `error` into
  the dialogs), or use a notification that sits above overlays.

**M2. Focus is lost to `<body>` when conditionally mounted dialogs close.**
- Affected: InitiativeDialog (`dm-console.tsx:464-478`, `player-view.tsx:265-277`), the
  multi-target AmountDialog (`dm-console.tsx:479-492`), and the detail dialogs
  (`combatant-detail.tsx:141-152`, `:388-399`, `:690-699`).
- Where: m/t/w.
- Reproduce: keyboard-open the initiative keypad from a row, or the multi-target damage dialog,
  then press Escape. `document.activeElement` becomes `BODY`. On w the same happens for the Heal
  and Add effect dialogs in the side panel.
- Control case: the always-mounted "End combat" modal returns focus correctly to "End combat".
- Fix: keep these modals mounted with `opened={...}`, or restore focus explicitly as `bestiary.tsx`
  does.

**M3. Escape in a dialog opened from the detail drawer also closes the drawer.**
`dm-console.tsx:394-408` with `combatant-detail.tsx:141-152` and `:388-399`.
- Where: m/t (drawer layouts).
- Reproduce: open Goblin 1 with Enter, press Heal, press Escape. Both layers close (open dialogs:
  0) and focus goes back to the row.
- Impact: keyboard users lose the detail context they were working in. The contract asks for
  Escape to close one layer and return focus.
- Fix: close one layer per Escape, for example by stopping propagation or by setting
  `closeOnEscape={false}` on the drawer while a child modal is open.

**M4. Touch targets below the 44px contract.**
- Condition chips are 36px tall (`combat.css:417-419`; `combatant-detail.tsx:239-256`). This is the
  most frequently toggled control.
- Switch rows are 24px tall:
  - DM controls Hidden / Reveal HP / Defeated (`combatant-detail.tsx:612-654`)
  - Effect "Visible to players" (`:517`)
  - Creature form Hidden / Share initiative (`add-combatants.tsx:578-591`)

  The app already solves this for Switches with `.preview-switch .mantine-Switch-body { min-height: 44px }`.
- Alert close buttons are 20x20: RunnerError (`parts.tsx:310-320`), "Creature saved"
  (`bestiary.tsx:54-63`) and "N combatants added" (`add-combatants.tsx:355-364`).
- Where: m/t/w. Measured with `getBoundingClientRect` in the browser.

### Minor

- **m1. Focus can land under the fixed turn bar.** Tabbing on m reaches Bea's and Cato's rows
  while they sit under the bar; on w, inputs and "Edit stats" in the side panel are affected.
  The rows are only partly covered. Add `scroll-padding-bottom` equal to the bar height
  (`combat.css:361-376`).
- **m2. Label-in-name mismatch on the half-damage checkbox.** The visible label is
  "Half (save)" / "Mitad (salvación)", but the accessible name is "Half damage for X"
  (`amount-dialog.tsx:332-336`), so WCAG 2.5.3 fails for voice control. Include the visible text,
  for example "Half (save) for X".
- **m3. Summary table is clipped on 390px.** The Outcome column is cut off ("Standin…"), with no
  scroll affordance (`combat-log.tsx:116-158`; `en-light-summary-m.png`). Consider a card or
  stacked layout on phones.
- **m4. Spanish copy.**
  - "Descuenta al" + "Empezar el turno" / "Terminar el turno" reads as "Descuenta al Empezar el
    turno". Suggest "Inicio del turno" / "Final del turno" (`combat-es.ts:164-166`).
  - `condition_off` "{{target}} ya no está {{condition}}" produces capitalised, gendered phrases
    such as "ya no está Cegado". Suggest "{{target}}: deja de estar {{condition}}" with lower case,
    or "{{target}}: sin {{condition}}" (`combat-es.ts:243`).
- **m5. Misleading back link for Players.** On a live `/combat/:id`, the Player back button reads
  "Past fights" / "Combates anteriores" (`player-view.tsx:105-116`).
- **m6. "R0" entries in the log.** Preparation events show "R0" (`combat-log.tsx:42-44`). A
  "Prep" label would read better.
- **m7. DM notes are discarded silently** when the drawer closes before "Save notes".
- **m8. Bestiary delete "Cancel" does not restore focus** (`bestiary.tsx:155`); only Escape or the
  close button does.
- **m9. Stale evidence screenshot.** `docs/evidence/RYT-007/summary-mobile.png` still shows "Se
  actualiza cada pocos segundos" on an ended encounter. The current build hides it (verified), so
  that screenshot predates the last change and should be recaptured.

## Tested scenarios

### Real browser (Chromium `/opt/pw-browsers/chromium`, identity build served at `:4174`, fixtures `tests/e2e/fixtures/{identity,combat}.ts`)

1. **Delivery spec.** `tests/e2e/combat.spec.ts` on identity-mobile and identity-tablet: 2 passed.
2. **DM, EN light, m/t/w.**
   - Empty encounter list.
   - Bestiary: empty state, New creature dialog with autofocus, Escape with focus return, save
     with notes, list.
   - Prepare: party plus 2 goblins.
   - Initiative: ask, roll, DM keypad.
   - Active screen and bottom clearance of the turn bar.
   - Detail: drawer (m/t) or side panel (w), condition picker and Prone toggle.
   - Add effect (failure path).
   - Damaging Arin to 0, death saves panel, death save (failure path).
   - axe (wcag2a/2aa/21aa/22aa), overflow and target sizes on each step.
3. **Wide selection switch** (dark): reproduced B2.
4. **Player, EN light, m/t/w.**
   - "No fight right now" state.
   - Initiative keypad opens automatically with focus on Total; typing and Enter submit it.
   - "Your turn!" hero.
   - Read-only teammate and enemy drawers, Escape returns focus to the row.
   - End my turn and the live region text ("Goblin 1 takes the turn. Round 1.").
   - Own damage via +5 chip.
   - Stale state (blocked `get_combat_state` for 21 s): the banner appears.
5. **150% root text, ES dark, m/t/w:** DM active, Player, table view. Found B3. No horizontal
   overflow anywhere.
6. **Keyboard, EN dark, m/t/w.**
   - Tab order through the console.
   - Enter opens the detail; focus moves to "Close details" (m/t) or stays on the row (w).
   - Nested Escape (M3), focus visibility on rows (3px solid ring).
   - Menu items and tabs are 44px.
7. **Focus return and summary, EN light, m/t/w.** Initiative and multi-target dialogs (M2),
   multi-target failure (M1), End combat modal, log tab, table view, ended summary (network state
   hidden), summary scroll width.
8. **Reduced motion, m:** the hero pulse runs (`combat-pulse 1.6s`) with no-preference and is
   `none` with reduce.

Screenshots: `docs/evidence/ui-review/combat/*-{m,t,w}.png`. Measurement JSON was kept outside the
repository in the reviewer's scratch directory.

### Screenshot or code inspection only

- Existing `docs/evidence/RYT-007/*.png` (ES dark).
- Spanish and English catalog parity (274 keys each; `combat.add.notes` and `combat.nav.badge`
  are unused).
- Code review of all `src/features/combat/ui/*`, `combat.css`, routes and the module flags.

## Untested states and limitations

- **Fixture gaps.** The fixture does not implement `add_combat_effect`, `remove_combat_effect` or
  `record_death_save`. The effects list, effect expiry, the death-save pips filling in,
  stable/dead badges and secret effects were not seen in a successful state.
- **Not exercised:** legendary actions, the lair row, hidden creatures and reveal, tie reordering
  by click, the rename/delete encounter modals, "Back to preparation", the Player-preview
  (`previewAsPlayer`) transform, offline (`navigator.onLine`), and the not-found/deleted route.
- **Realtime:** realtime websockets are stubbed, so only the polling path was exercised.
- **Not tested at all:** class themes other than Default; Safari/iOS, real screen readers and
  vibration; real browser text zoom (approximated with root `font-size: 150%`); fullscreen.
- **Badge text size:** the size of Mantine `Badge size="sm"/"xs"` text against the 12px
  `--fs-tag` minimum was not measured.
- **Scope:** this verdict applies only to the source fingerprint above. A focused re-review is
  needed after fixes, covering B1-B3, M1-M4 and a light-theme axe pass.
