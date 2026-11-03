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

## Re-review (focused, after 92e0ef7)

- Reviewed source: `92e0ef7`
- UI fingerprint: `d3b07efbd181b9171d7634d7b7f971cc6136d2fda5c256df00da3310eda92598`. I
  recomputed it and it matches the coordinator's value.
- Reviewer role: `.codex/agents/ui-ux.toml` (independent subagent, implementation read-only).
- Date: 2026-11-03
- Evidence: `docs/evidence/ui-review/combat/r2/*.png`. The file `r2/en-dark-wide-goblin2-carries-goblin1-notes-w.png`
  keeps its round-1 name but now shows the **fixed** state: Goblin 2's notes are empty.

### Verdict: CHANGES_REQUIRED

All the blockers and majors from round one are fixed and verified in a real browser. Two items
are still open:

- One new major regression, caused by the copy change.
- One minor that is only partly fixed.

Both are small. A focused re-check of just these two is enough.

### Verification of earlier findings

| ID | Status | Real-browser evidence (m = 390, t = 820, w = 1180) |
| --- | --- | --- |
| B1 | Fixed | axe (wcag2a/2aa/21aa/22aa) is clean in EN light on every screen I re-ran on m/t/w: list, bestiary, prepare, active, detail, death saves, effect dialog, multi-target bar, Player initiative/turn/teammate/stale. The death-save buttons now use the same tones (`r2/en-light-death-saves-m.png`). The new e2e light test passes. |
| B2 | Fixed | On w, after saving a note on Goblin 1 and typing "Bless", Goblin 2 shows empty notes, an empty spell and Save notes disabled. Clicking from Goblin 1 to Goblin 2 saved Goblin 1's note on blur, to the right combatant. |
| B3 | Fixed | At m 150% the bar is 162px. "Arin" is visible (41px line) and does not overlap "Siguiente turno", which now sits on its own row (`r2/es-dark-z150-turnbar-m.png`). The last content clears the bar at scroll end at 100% and 150% on m/t/w. |
| M1 | Fixed | The failed add effect, death save and multi-target damage show the toast on top (top 12px, above the modal/drawer) on m/t/w. Its close button is 44x44. Closing the toast leaves the dialog and drawer open. |
| M2 | Fixed | Escape returns focus to the opener: Initiative → Bea's row, multi-target → Damage, Heal and Add effect in the detail → that button. This holds on m/t/w, and the End combat modal still works. |
| M3 | Fixed | On m/t, Escape in Heal or Add effect closes only that dialog (one dialog left), with focus on the opener. A second Escape closes the drawer and returns focus to the row. |
| M4 | Fixed | Chips, switch rows (DM controls, creature form, effect visibility), Damage/Heal and alert close buttons all measure 44px. The small-target scan of every re-run screen is empty. |
| m1 | Fixed | Tabbing through the console at 100% and 150% on m leaves no focused element under the turn bar. |
| m2 | Fixed | The accessible name is "Half (save): Goblin 1" / "Mitad (salvación): Goblin 2". |
| m3 | Fixed | The summary table fits 390px (scrollWidth 343 = clientWidth). |
| m4 | Fixed (copy) | The Spanish strings read well. However, the longer English labels introduced N1 below. |
| m5, m6 | Fixed | The Player back link is hidden while live, and the log shows "Prep" / "Prep.". |
| m7 | **Partly fixed** | See N2. |
| m8 | Fixed | Code inspection only: Cancel now calls `restore()`. |
| m9 | Not re-checked | The RYT-007 screenshots were regenerated, but I did not inspect them. |

The delivery spec `tests/e2e/combat.spec.ts` (both tests) passes on identity-mobile and identity-tablet.

### Remaining findings

**N1 (major, new regression). The effect dialog's "When it counts down" segmented control is clipped.**
- Code: `combat-en.ts:163-165` together with `combatant-detail.tsx:495-504`. The labels are
  `white-space: nowrap` and the control is wider than the modal.
- Where:
  - m EN 100%: "When the turn ends" is cut at the edge.
  - m EN and ES 150%: the second option, which is the **default, selected** one, shows only "Wh"
    or "Al…" (`r2/en-150-effect-dialog-m.png`, `r2/es-150-effect-dialog-m.png`).
  - ES 100% just fits.
- Impact: at large text the DM cannot read the chosen option. This is a text-resize failure.
- Fix (either works):
  - Let the labels wrap (`white-space: normal`, as `.view-switch` already does), or
  - Stack the control vertically below about 48em, or use shorter labels such as "Turn start" /
    "Turn end" and "Al empezar" / "Al terminar".

**N2 (minor, the rest of m7). Escape still drops an unsaved DM note on m/t.**
- Code: `dm-console.tsx:395-408` with `combatant-detail.tsx:665-676`.
- Reproduce: type a private note in the drawer, then press Escape. The server note stays empty.
- The close button and overlay exits do save the note, and so does switching rows on w.
- Impact: keyboard users lose the note silently.
- Fix: flush the note in the drawer's `onClose` path, or save on change with a debounce.

**N3 (minor, new). The error toast covers the dialog's title and close button on phones.**
- Seen at m (`r2/en-light-effect-failure-toast-m.png`).
- The toast is dismissable (44px), and Escape still closes the dialog, so this is not blocking.
- Consider placing the toast at the bottom on phones, or auto-dismissing it.

### Tested in this round

**Real browser (local Chromium, a fresh identity build from `92e0ef7`):**
- My round-one specs re-run on m/t/w (23 passed, 4 skipped by design), covering:
  - DM, EN light: list, bestiary, prepare, active, detail, chips, the effect and death-save failure paths.
  - Wide selection switch.
  - Player, EN light, including the stale state.
  - ES dark at 150%: DM, Player and table views.
  - Keyboard: tab order, nested Escape, menus and tabs.
  - Reduced motion.
  - Focus return, summary and table.
- New checks:
  - Toast versus dialog/drawer.
  - Notes saved through Escape, the close button, the overlay and a row switch.
  - Turn-bar geometry and focus-under-bar at 100% and 150%.
  - Segmented-control fit in the effect and amount dialogs, EN/ES at 100% and 150% (the amount dialog fits).

**Code inspection:** the `92e0ef7` source diff.

### Untested

Round one's untested list still applies, unchanged:
- The success paths for effects and death saves (the fixture does not implement them).
- Legendary actions, lair and hidden creatures.
- Realtime.
- Other class themes.
- iOS/Safari and screen readers.

I did not re-run the light-theme axe on the table view or the summary at w. Approval applies only
to the fingerprint above.

## Re-review 2 (focused on N1-N3, after 45c58a5)

- Reviewed source: `45c58a5`.
- UI fingerprint: `756734e3e94bda8b53375a5e6bedae61b6847313bc3127f5b1fbaf672505555c` (recomputed, matches).
- Reviewer role: `.codex/agents/ui-ux.toml`, read-only on implementation.
- Date: 2026-11-03.
- Evidence: screenshots in `docs/evidence/ui-review/combat/r3/*.png`.
- Method: a fresh identity build in real Chromium at m (390px), t (820px) and w (1180px) with touch
  emulation. The scratch spec covers N1-N3 only.

### Verdict: CHANGES_REQUIRED

N1 and N2 are fixed. The N3 change fixed the dialog-header overlap on phones, but it moved the
error toast on top of the phone's primary controls.

### N1: fixed

The "When it counts down" control is now vertical in the effect dialog.

- I checked EN and ES at 100% and 150% text on m, t and w, in light and dark.
- Both options are 44px tall, wrap inside the modal and are never clipped.
- The scroll width equals the client width.
- The default "end" option is selected and readable.
- ArrowUp switches the option.
- axe is clean.
- Evidence: `r3/en-150-effect-dialog-m.png` and `r3/es-150-effect-dialog-m.png`.

### N2: fixed

An unsaved private note is now saved on every exit:

- Escape (m/t)
- the close button and an overlay tap (m/t)
- switching rows or tabs (w)

There is no error toast in any of these cases.

- When a note is still being edited, the close button, an overlay tap or a row switch sends two
  identical `update_combatant` writes (once on blur, once on unmount). It is harmless but redundant.
- Removing a combatant while its note is still being edited raised no error.

### N3: not resolved, regression (major)

On phones (≤48em), the error toast now sits fixed at the bottom with z-index 1000. It stays until
the DM dismisses it, and it covers the phone's primary controls:

- **Console:** after a failed write it completely hides the turn bar, including "Previous" and
  "Next turn" (`r3/en-light-z100-toast-console-m.png`). The DM has to find and dismiss the toast
  before advancing the turn.
- **Dialogs:** at 100% text it overlaps the bottom of the dialog's "Cancel"/"Add effect" row
  (`r3/en-light-z100-toast-dialog-m.png`). At 150% it covers both buttons, hiding the retry action.

Code: `combat.css` `.combat-toast` and the `@media (max-width: 48em)` block; `parts.tsx` `RunnerError`.

Suggested fix:

- While a dialog or drawer is open, show the error inside it, for example next to its actions.
- Otherwise, place the phone toast above the turn bar when one is present (the bottom offset
  includes the bar height), and consider auto-dismissing it.

Minor, unchanged on t/w: the top toast still overlaps the modal's close button and title while a
dialog is open. It can be dismissed (44px) and Escape still works.

### Not re-checked

The earlier rounds' fixes, except where these checks touched them:

- The effect dialog and console stayed axe-clean.
- The turn bar was unchanged.

The untested list from round one still applies. Approval applies only to the fingerprint above.

## Re-review 3 (focused on the N3 regression and duplicate note writes, after ed8fce0)

- Reviewed source: `ed8fce0`
- UI fingerprint: `a3385ecfb6c003d813014a84fa36e1f631da6820b6b80e702fddfc25ed9c328e` (recomputed, matches)
- Reviewer role: `.codex/agents/ui-ux.toml`, implementation read-only
- Date: 2026-11-03
- Setup: a fresh identity build in real Chromium with touch, at m (390px), t (820px) and w (1180px),
  each at 100% and 150% text, English light. The scratch spec simulates failures by blocking routes.
- Evidence: `docs/evidence/ui-review/combat/r4/*.png`

### Verdict: PASS

No blocker or major findings remain. N1–N3 and the duplicate write are fixed. Two minor items
remain (below); they are non-blocking and can go to the backlog.

### Results

**Error inside a dialog** (Add effect fails, at m, t and w, 100% and 150%):
- The alert renders inside the modal body below the actions. It is in view and on top.
- "Add effect" stays visible and tappable.
- axe reports no violations.
- Escape closes only the dialog and returns focus to "Add effect". No alert is left behind.
- Screenshot: `r4/z150-effect-error-m.png`.

**Error inside the drawer** (death save fails, at m and t): the alert renders at the end of the
drawer body and is scrolled into view (`r4/z100-deathsave-error-m.png`).

**Error at w** (no drawer): it uses the top toast, which no longer overlaps a modal.

**Console error with the turn bar visible** (m, "Next turn" fails):
- The toast sits above the turn bar: toast 566–644px, bar from 691px. At 150%: toast 428–576px,
  bar from 608px.
- It does not cover the bar or the bottom navigation (`r4/z100-console-error-m.png`).

**DM notes:** each exit now sends exactly one `update_combatant`. This covers the close button or
row switch, and "Save notes" followed by Escape or a row switch.

**Escape and focus behaviour is unchanged:**
- Nested Escape closes only the dialog, with focus on "Heal". A second Escape (m/t) returns focus to the row.
- After "Apply", focus returns to "Damage".

**Delivery spec:** `tests/e2e/combat.spec.ts`, both tests, passes on identity-mobile and identity-tablet.

### Remaining minor findings (non-blocking)

1. **Drawer errors appear far from the control that failed.** In the drawer, the alert is appended
   at the end of the body and scrolled into view. On m this scrolls the death-save buttons out of
   view. The error sits near "Remove from encounter", not near "Success".
   - Consider placing the inline error near the section that failed, or at the top of the drawer
     body, using `parts.tsx` `topDialogBody`.
2. **The floating toast stays until dismissed and covers page content beneath it.**
   - At m it partly covers a log row's "Undo" (`r4/z100-console-error-m.png`).
   - At w the top toast covers the "Select targets" and tabs row while it is shown.
   - It can be dismissed with a 44px button. Consider auto-dismissing it after a few seconds.

### Limitations

I did not re-run the full first-round matrix; only the areas above were re-checked. The untested
list from round one still applies:
- The fixture has no success paths for effects or death saves.
- Legendary actions, lair and hidden creatures.
- Realtime.
- Other class themes.
- iOS/Safari and screen readers.

This approval applies only to the fingerprint above.

## Re-review 4 (focused on the two Re-review 3 minors, after 731d89d)

- Reviewed source: `731d89d` (the HEAD commits after it are screenshot commits only).
- UI fingerprint: `75aed879820a113c284ce9257c5dfae060bbec3b452aba08cc7e6e9657f57c90`
  (recomputed, matches).
- Reviewer role: `.codex/agents/ui-ux.toml`, read-only on implementation.
- Date: 2026-11-03.
- Method: a fresh identity build in real Chromium with touch at m (390px), t (820px) and w
  (1180px), English light, 100% and 150% text, with failures simulated by blocking routes.
- Evidence: `docs/evidence/ui-review/combat/r5/*.png`.

### Verdict: PASS

There are no blocker or major findings. Both fixes work as described. Two new minor items remain
(below); neither blocks the delivery.

### Results

**1. Sticky drawer error (m/t)**

- The alert is `position: sticky` at the bottom of the drawer's visible area.
- After a failed death save it is in view and on top. At 100% the Success button stays visible
  and tappable (m and t).
- When scrolled to the end, the alert sits in normal flow below "Remove from encounter", so
  every control can be reached.
- The 44px close button dismisses it and the drawer stays open.
- axe reports no violations.
- Screenshots: `r5/z100-drawer-deathsave-error-m.png`, `r5/z100-drawer-end-m.png`.

**2. Floating toast**

- It disappears on its own after about 8.05–8.1 s (m/t/w), and the 4 s polling does not reset
  the timer.
- Hovering keeps it visible for more than 11 s. It leaves about 8.3 s after the pointer leaves.
- Keyboard focus on its close button keeps it visible for more than 11 s. It leaves about 8.4 s
  after focus moves away.
- Enter on the close button dismisses it.
- It never overlaps the turn bar. On m the toast ends at 644px and the bar starts at 691px.
- `role="alert"` is kept and axe reports no violations.

**3. Delivery spec**

`tests/e2e/combat.spec.ts` passes on identity-mobile, identity-tablet and identity-desktop
(9/9), including the new "action errors stay in view" test.

### Remaining minor findings (non-blocking)

**N4. At 150% text on a phone, the sticky error can cover the control that just failed.**

- Reproduce: in the drawer, scroll so the death-save buttons sit near the bottom edge, then tap
  Success while the request fails.
- The 148px-tall sticky alert then covers Success and Failure
  (`r5/z150-drawer-deathsave-error-m.png`). At 100% it can similarly cover a row such as
  "Change" or "Defeated".
- The user can scroll or dismiss it.
- Suggested fix: when the error appears, scroll the focused or failed control into view above
  the alert, for example with `scroll-padding-bottom` on `.mantine-Drawer-content` equal to the
  alert height. Another option is to stick it to the top of the drawer body instead.
  - Relevant code: `combat.css` `.combat-inline-error.is-sticky`, `parts.tsx` `RunnerError`.

**N5. Dismissing the floating toast with the keyboard sends focus to `<body>`.**

- Pressing Enter on the toast's close button drops focus to `<body>`.
- Suggested fix: return focus to the control that triggered the action, for example "Next turn".
- Related accessibility note: on m the toast is 6 Tab stops after "Next turn" (after the bottom
  navigation). Keyboard users reach it within the 8 s only if they head there directly; the error
  is still announced through `role="alert"`.

### Limitations

Only the scope above was re-checked. The round-one untested list still applies:

- the fixture's missing success paths
- legendary, lair and hidden combatants
- realtime
- other class themes
- iOS/Safari and screen readers

This approval applies only to the fingerprint above.

## Re-review 5 (focused on N4/N5, after 9c1836e)

- Reviewed source: `9c1836e`
- UI fingerprint: `1ee0995af4f283381fd05a4d503f05a597350e3abe1706ae194ef3cbe6339fc9` (recomputed, matches)
- Reviewer role: `.codex/agents/ui-ux.toml` (implementation read-only)
- Date: 2026-11-03
- Method: a fresh identity build in real Chromium with touch, at m (390px), t (820px) and w (1180px).
  English, light theme, 100% and 150% text. Failures were simulated by blocking routes, and taps
  used `touchscreen.tap`.
- Evidence: `docs/evidence/ui-review/combat/r6/*.png`

### Verdict: CHANGES_REQUIRED

Both fixes are verified for placement and focus. However, the new scroll logic introduced a
scroll-jump regression in the drawer.

### N4: fixed for placement

The r5 case was repeated: m at 150%, with the death-save row scrolled to the bottom edge and a
failing **tap** on Success.

- Success and Failure are now in view, tappable and above the sticky alert: buttons at 627–671px,
  alert from 687px (`r6/z150-deathsave-error-m.png`).
- At 100% (m/t) the result is the same.
- A failing condition chip at the bottom edge also lands above the alert (m 641–685px, alert at 687px).
- `scroll-padding-bottom` is set to 102px at 100% and 172px at 150%, and it is cleared after dismissal.
- axe reports no violations.

### N5: fixed

The inline drawer error returns focus to Success in every dismissal case:

- Enter on its close button.
- A tap on its close button.

The floating toast returns focus to "Next turn" in every dismissal case:

- Enter on its close button.
- Space on its close button.
- A tap on its close button.

Auto-dismiss does not move focus: it stayed on "Select targets". The modal inline error dismissed
with Enter returns focus to "Add effect", and the dialog stays open. Closing the drawer with Escape
while the error shows returns focus to the row and leaves no stray alert.

The delivery spec `tests/e2e/combat.spec.ts` passes 9/9 on identity mobile/tablet/desktop.

### New finding

**N6 (major, regression): while an error shows, the drawer jumps back to the failed control on
every re-render, which with polling means every few seconds.**

- Cause: `parts.tsx` `RunnerError` passes an inline `ref` callback. Under React 19
  (`react@19.3.1`), React detaches and re-runs that callback on every render. Each run sets the
  padding again and calls `trigger.scrollIntoView({ block: 'nearest' })` again, and the 4 s poll
  re-renders the screen.
- Reproduce:
  1. On m or t, fail a death save in the drawer.
  2. Scroll the drawer to the end, for example to read or edit Private notes.
  3. About 2–3 s later the drawer jumps back.
- Measured scrollTop, sampled once per second:
  - m 100%: 642 → 420
  - m 150%: 1373 → 714
  - t 150%: 601 → 523
- It happens again each time the user scrolls away, until the error is dismissed. Inline errors
  are not auto-dismissed.
- The modal branch (`node.scrollIntoView` on every render) has the same pattern.
- Impact: the DM cannot freely scroll the drawer while an error is shown. The content moves under
  their finger.
- Fix: run the padding and scroll once per error, for example with a `useLayoutEffect` keyed on
  the error and trigger, or with a stable `useCallback` ref. Keep the padding cleanup on unmount.

### Limitations

- The t 150% scripted tap-dismiss run hung in my harness, so its inline tap-dismiss result is not
  recorded. Placement and the scroll-jump were measured separately for t.
- Only the scope above was re-checked. The untested list from round one still applies.
- This approval covers only the fingerprint above.

## Re-review 6 (focused on N6, plus N4 and N5, after d3ef11d)

- Reviewed source: `d3ef11d`
- UI fingerprint: `e0b7fbc774813e789daccdd109d5b5c0067621c2a9bb1b5804450228759d164b` (recomputed, matches)
- Reviewer role: `.codex/agents/ui-ux.toml`, read-only on implementation
- Date: 2026-11-03
- Method: fresh identity build in real Chromium with touch, at m (390px), t (820px) and w (1180px).
  English light, 100% and 150% text. Failures were simulated by blocking routes; taps used
  `touchscreen.tap`.
- Evidence: `docs/evidence/ui-review/combat/r7/*.png`

### Verdict: PASS

N6 is fixed, and N4 and N5 still hold. There are no blocker or major findings.

### N6: fixed

This repeats the round 5 measurement. A death save fails in the drawer. The drawer is then
scrolled to the end and sampled once per second for 10 s, which covers at least two 4 s polls.
After that it is scrolled to the top and sampled for 6 s.

| Viewport | Before the fix (round 5) | Now, end samples | Now, top samples |
| --- | --- | --- | --- |
| m 100% | 642 → 420 | 642 every second | 0 every second |
| m 150% | 1373 → 714 | 1373 every second | 0 every second |
| t 100% | not affected | 232 every second | 0 every second |
| t 150% | 601 → 523 | 601 every second | 0 every second |

In the modal (effect dialog, m 150%), the content stayed at 0 throughout. Scroll padding is still
applied while the error shows (102px, 172px at m 150%, 118px at t 150%) and is cleared after
dismissal.

### N4: still holds

With the death-save row at the bottom edge, a failing tap on Success leaves Success and Failure
above the sticky alert, in view and tappable:

| Viewport | Buttons | Alert top |
| --- | --- | --- |
| m 100% | 548–592px | 757px |
| t 100% | 551–595px | 1093px |
| m 150% | 627–671px | 687px |
| t 150% | 701–745px | 1077px |

A failing chip at the bottom edge also stays above the alert (m and t at 100%, m at 150%), and
axe reports no violations.

### N5: still holds

- **Inline drawer error:** dismissing with Enter or a tap returns focus to Success.
- **Toast:** Enter, Space and tap all return focus to "Next turn".
- **Auto-dismiss:** does not move focus.
- **Modal inline error:** Enter returns focus to "Add effect" and the dialog stays open.
- **Escape on the drawer while an error shows:** focus goes back to the row, with no stray alert.

### Delivery spec

`tests/e2e/combat.spec.ts` passes on identity mobile, tablet and desktop: 9 of 9, including the new
scroll-stability assertion.

### Observation (minor, pre-existing, not part of this delivery)

At t 150%, Playwright's `scrollIntoViewIfNeeded` left Success under the drawer's sticky header
(the Mantine `Drawer-header`). That made my scripted retap miss the button.

The app's own placement does not hit this. The trigger scrolls with `block: nearest` toward the
bottom, and the drawer's own focus restore is unaffected.

The case could still occur for keyboard users moving focus upward inside a long drawer. A
`scroll-padding-top` on `.mantine-Drawer-content` equal to the header height would prevent it.
This is optional.

### Limitations

- Only the scope above was re-checked.
- The untested list from round one still applies.
- This approval applies only to the fingerprint above.

## Re-review 7 (focused on the drawer header scroll padding, after 4e7fce2)

- Reviewed source: `4e7fce2`
- UI fingerprint: `8460702d2fe5cd22fabe05331364e029d0a09f322e165e4ce746723bc60f5c3c` (recomputed, matches)
- Reviewer role: `.codex/agents/ui-ux.toml` (implementation read-only)
- Date: 2026-11-03
- Method: fresh identity build in real Chromium with touch, at m (390px), t (820px) and w (1180px).
  English light, 100% and 150% text.
- Evidence: `docs/evidence/ui-review/combat/r8/*.png`

### Verdict: PASS

The fix works at 100% text and fixes the tablet 150% retap case. One minor, non-blocking residue
remains at 150% text (see below). N4, N5 and N6 still hold.

### Results

**Tablet 150% retap**
- After a keyboard dismissal, `scrollIntoViewIfNeeded` now leaves Success clear of the sticky
  header (top 281px).
- The second tap reaches Success ("secondTapAt: Success"), and the error appears again.
- In round 6 the same tap hit `Drawer-header`.

**Keyboard focus moving upward in a long drawer**
- Shift+Tab from "Remove from encounter" up to the header, 12 steps.
- Tested on m and t, with a short name and with a long name ("Ancient bandit captain of the
  Sunken Coast"), and with legendary actions so the drawer is longest.

| Text size | Header height | `scroll-padding-top` | Focused controls under the header |
| --- | --- | --- | --- |
| 100% | 76px | 88px | none (m and t) |
| 150% | 114px | 104px | yes, partly (m and t) |

- At 150% the header is taller than the reserved space, so the top of some controls stays partly
  under it, by about 10–12px of a 44px target:
  - m: Spell input, "Change" and "Edit initiative of Goblin"
  - t: "Change"

**N4: holds**
- On m and t at 100% and 150%, Success and Failure stay above the sticky alert and remain tappable
  after a failing tap at the bottom edge.
- A failing chip at the bottom edge also stays above the alert.
- Bottom padding is 102px, 172px at m 150% and 118px at t 150%.
- axe reports no violations.

**N5: holds**
- Dismissing the drawer error with Enter or a tap returns focus to Success.
- Dismissing the toast with Enter, Space or a tap returns focus to "Next turn".
- Auto-dismiss does not move focus.
- Enter on a modal error returns focus to "Add effect".
- Escape on the drawer returns focus to the row.

**N6: holds**
- Drawer scrollTop stays fixed for 10 s at the end and 6 s at the top, on m and t at 100% and 150%:
  - m: 642 at 100%, 1373 at 150%
  - t: 232 at 100%, 601 at 150%
- The modal stays at 0.

**Delivery spec:** `tests/e2e/combat.spec.ts` passes 9 of 9 on identity mobile, tablet and desktop.

### Remaining minor (non-blocking)

**N7.** `scroll-padding-top` is fixed at `44px + 2rem + 12px`. At 150% text the drawer header
becomes taller (114px) because the title text scales, so focused controls can sit partly under it.
- This is partial obscuring, so it passes WCAG 2.4.11 (AA) but not 2.4.12 (AAA).
- Suggested fix: derive the padding from the rendered header, for example by setting a CSS
  variable from the header's `offsetHeight` when the drawer opens. Alternatively, add a margin
  that scales with text, such as `calc(2.75rem + 2rem + 12px)`.

### Limitations

Only the scope above was re-checked. The untested list from round one still applies. Approval
covers only the fingerprint above.

## Re-review 8 (focused on N7, after f2206a0)

- Reviewed source: `f2206a0`
- UI fingerprint: `3c8b922406dbe4e4d40474d0bfabaea083e30a1588f75b8c36f16ada150cb35d` (recomputed, matches)
- Reviewer role: `.codex/agents/ui-ux.toml`, read-only on implementation
- Date: 2026-11-03
- Method: fresh identity build in real Chromium with touch, at m (390px), t (820px) and w (1180px).
  English light, 100% and 150% text.
- Evidence: `docs/evidence/ui-review/combat/r9/*.png`

### Verdict: PASS

N7 is fixed. N4, N5 and N6 still hold. No findings remain open.

### Results

**N7, keyboard focus moving upward in the drawer.** I moved focus with Shift+Tab from "Remove from
encounter" up to the drawer header, 12 steps each run. Runs covered m and t, a short name and a
long name ("Ancient bandit captain of the Sunken Coast"), and a creature with legendary actions.

| Text size | Header height | `scroll-padding-top` | Focused controls under the header |
| --- | --- | --- | --- |
| 100% | 76px | 88px | none |
| 150% | 114px | 126px | none |

In round 7 the 150% padding was 104px and three controls sat partly under the header.

**Tablet 150% retap.** After a keyboard dismiss, the second tap reaches Success and the error
appears again.

**N4.** On m and t, at 100% and 150%:
- Success and Failure stay above the sticky alert and remain tappable.
  - m 100%: buttons at 548–592px, alert at 757px.
  - m 150%: buttons at 627–671px, alert at 687px.
  - t 150%: buttons at 701–745px, alert at 1077px.
- A failing chip also stays above the alert.
- axe reports no violations.

**N5.**
- The drawer error returns focus to Success, whether dismissed with Enter or a tap.
- The toast returns focus to "Next turn", whether dismissed with Enter, Space or a tap.
- Auto-dismiss leaves focus where it was.
- In a modal, an error dismissed with Enter returns focus to "Add effect".
- Escape on the drawer returns focus to the row and leaves no stray alert.

**N6.** The drawer's scrollTop stayed fixed through 10 s at the end and 6 s at the top:
- m: 642 at 100%, 1373 at 150%
- t: 232 at 100%, 601 at 150%

The modal stayed at 0.

**Delivery spec.** `tests/e2e/combat.spec.ts` passes 9/9 on identity mobile, tablet and desktop.

### Limitations

- Only the scope above was re-checked.
- I did not exercise the Player's right-side drawer at w with Shift+Tab. It uses the same
  `.combat-drawer` rule.
- The untested list from round one still applies.
- This approval covers only the fingerprint above.

## Re-review 9 (merged with main)

- Reviewed source: `cdc3826` (main's RYT-035 #7 merged into `cl/eloquent-keller-w3cwpn`)
- UI fingerprint: `60dfa106d63aaf661b7c874e9729c0c437de995b16c67a00be4097436a752216` (recomputed, matches)
- Reviewer role: `.codex/agents/ui-ux.toml`, read-only on implementation
- Date: 2026-11-03
- Method: fresh identity build in real Chromium with touch, at m (390px), t (820px) and w (1180px).
  Covered es-dark, en-light and es-dark at 150% text. Navigation and the modules panel were
  checked in es and en dark; Player navigation in es light.
- Evidence: `docs/evidence/ui-review/combat/r10/*.png`

### Verdict: CHANGES_REQUIRED

Most of the integration is clean: navigation, module switches, visual consistency, axe and the
regression specs. One major integration issue remains: the combat routes ignore the Player module
visibility that main's catalogue now governs.

### 1. Combat in navigation and the DM module switch

**DM navigation** (m/t/w, es and en):
- The links are, in order: DM Command Center, Party, Inventory, Shops, Combat.
- Combat is `aria-current` and active on `/combat`.
- On phones the bottom bar has exactly 5 destinations and no label is truncated at 100%.
- The More drawer still does not appear. At most 5 destinations exist, which matches ADR 023's
  note that the drawer is currently unreachable. It remains untested by e2e.

**Player navigation:**
- With `party, combat` enabled the bar shows "Grupo | Combate".
- With only `party` it shows "Grupo".

**DM Command Center → Active modules:**
- The Combat switch is labelled "Combate: visible para jugadores" / "Combat: visible to Players".
- It is enabled, has no "Coming soon" badge and toggles.
- Misiones, Atlas, Glosario, Recuerdos, Bastión and Taller are disabled, as main intends.
- axe is clean, there is no overflow and no target is under 44px.

### 2. Visual consistency with RYT-035 page heads

**Combat list (DM `/combat`)** uses its own `Title` + `Text` instead of `PageHead`, but it renders
the same as main's pages:
- Same h1: 34px Georgia/500 at 100%, 51px at 150%.
- Same lede token: `--app-muted` at 16px.
- Same top offset: 16, 22 and 36px at m, t and w.
- Content starts close to where it does on Party, Shops and the Command Center.

**Console, Player view and table view** keep their own header: back link, h1, status badge with
round, live indicator, Table view / ⋯ actions. I accept this as a deliberate **variant**, not a
blocking inconsistency:
- These are detail and live screens, comparable to the character sheet's back-link header.
- Their status line replaces the RefreshControl with a live / last-known indicator.
- They use the same tokens, fonts and 44px controls, and are axe-clean in every tested
  combination.

**Audits:** axe, horizontal overflow and the 44px scan are clean on the list, console (draft and
active), Player view and table view, in all 3 combinations at m, t and w.

### 3. Regression

| Specs | Projects | Result |
| --- | --- | --- |
| `tests/e2e/combat.spec.ts` + `tests/e2e/identity.spec.ts` | identity mobile/tablet/desktop | 63/63 passed |
| `tests/e2e/characters.spec.ts` + `tests/e2e/scaffold.spec.ts` | all projects, including demo desktop/tablet/mobile | 81/81 passed |

The combat spec alone is 9/9 within those runs.

### Findings

**I1 (major): a Player can open Combat by URL while the DM has it switched off.**
- Location: `src/features/combat/ui/combat-page.tsx`, in `CombatPage`, `CombatEncounterPage` and
  `CombatTablePage`.
- Reproduce: as a Player with `player_modules = ['party']`, open `#/campaign/:id/combat`.
- Result: the full Player combat screen renders ("Combate", "No hay combate ahora", history).
  With a live encounter the Player would get the whole live screen, including Player actions. A
  direct `/combat/:id` or `/table` link behaves the same.
- Expected: main's Inventory and Shops pages show a "the DM has not opened … yet" state
  (`shop.hiddenModule`). ADR 012/023 say Players only see modules their DM activated. The nav
  entry is correctly hidden, so only the routes are inconsistent.
- Evidence: `r10/es-light-playerWithoutCombat-{m,t,w}.png`.
- Fix:
  - For a non-DM viewer (including a DM in Player preview) without `combat` in `player_modules`,
    render a hidden-module state with a new typed key such as `combat.hiddenModule`, using
    `PageHead` like Shops does.
  - Do this on all three combat routes. Keep the DM's own access unchanged.
  - Add an e2e assertion for it.
- Note: this is presentation-level. Server reads are governed by RLS and the role projection
  (ADR 024).

**I2 (minor): the combat list does not follow the RYT-035 compact head on phones.**
- The page has tabs (Encounters / Bestiario), but it still shows its lede on phones: 3 lines at
  390px and 4 lines at 150%.
- RYT-035 hides the lede on phones for tabbed pages (`compactOnPhone`) and keeps ledes to one line
  on laptops.
- Fix: switch the list (and the Player "no fight" page) to `PageHead` with `compactOnPhone`, and
  shorten the lede.

**Observation (main's RYT-035 scope, not combat):** at 150% text on phones, the 5-destination
bottom bar truncates its labels with an ellipsis ("Inven…", "Tiend…", "Comb…") on every page. The
accessible names stay complete. Combat adds the fifth destination, so this is now always visible
for DMs. I leave it to main's owner whether two-line labels at large text are preferable.

### Limitations

- Not exercised: main's other RYT-035 screens beyond the Command Center modules panel, Party and
  Shops page heads, and the specs listed above.
- Not tested: class themes other than Default, the unreachable More drawer, and iOS/Safari and
  screen readers.
- The untested list from round one still applies.
- This verdict applies only to the fingerprint above.
