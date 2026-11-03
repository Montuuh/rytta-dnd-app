# RYT-040 independent UI/UX review

- Reviewer: `ui-ux` (independent subagent applying `.codex/agents/ui-ux.toml`)
- Date: 2026-11-03
- Reviewed source: branch `worktree-agent-a4d68530bd38f1772`, commits `964ec7f` and `26e2a78`.
  The worktree's modified files differ only in line endings (no content diff).
- Source fingerprint (`node scripts/check-ui-review.mjs --fingerprint`):
  `1c880ba82e6005ed2cc9b1ef0629cbfa69886161f57857393b29417f73d1de14`

## Verdict: CHANGES_REQUIRED

The delivery closes the reported gap well: edit and delete now appear wherever homebrew does.
The delete confirmation is well made, Escape stacking over the reference sheet is correct, every
control is 44px and axe is clean in all 24 states checked. But the editor loses keyboard focus to
the page behind it on phones and tablets, the recovery flow it introduces does not move focus, and
the primary action is clipped at 150% text on a 390px phone. These must be fixed before a PASS.

## Findings

### F1 (Blocker): the open editor loses focus to the page H1 whenever homebrew data changes (< 62em)

- Path: `src/features/glossary/ui/glossary-page.tsx:126-136`. The headword-focus effect depends on
  `catalog` and focuses `readerHeading` whenever `!wide`. It does not check whether the homebrew
  editor or delete dialog (`useHomebrewManager().busy`) is open.
- Viewport/theme/language: 390px and 820px (any width below 62em), both themes, both languages.
- Reproduction (browser-tested): as the DM, open `#/campaign/<id>/glossary/rule.long-rest` and edit the
  house rule. Type in Resumen, have another member save that entry (fixture `changeHomebrew`), and
  wait for the 60s `refetchInterval`. `document.activeElement` becomes the page `H1 Descanso largo`
  outside the dialog, and the next typed characters ("def") never reach the field. The same happens
  right after any failed save, because `onSettled` invalidates the query.
- Impact: a keyboard user's input is silently lost mid-edit. On a touch phone, moving focus off the
  textarea dismisses the on-screen keyboard while the person is typing. The modal's focus
  containment is broken, and the next Tab walks the page behind the overlay (observed:
  `puntos de golpe: ver definición`). This affects the core flow the ticket delivers.
- Fix direction: run the effect only when `entryId` changes or `headwordFocus.id` is set, not on
  every catalog identity change. Never steal focus while a glossary overlay is open.

### F2 (Major): the stale-revision conflict does not move focus to its recovery actions

- Path: `src/features/glossary/ui/homebrew-editor.tsx:169-183, 189-224, 335`.
- Viewport: all. At 1440px focus drops to `<body>` (the Save button goes to `loading`/disabled while
  focused). Below 62em it goes to the page H1 behind the modal (F1).
- Reproduction (browser-tested): edit, have someone else change the entry, then press Save changes.
  The alert appears with `role="alert"`, but focus is outside the dialog. After "Cargar la actual",
  the alert (and the focused button) unmounts and focus falls to `<body>`.
- Impact: the alert is announced, but a keyboard or switch user cannot reach "Load the current one"
  or "Save mine" from where focus is. The recovery is only recoverable by pointer.
- Fix direction: when the conflict shows, focus the alert (title with `tabIndex={-1}`) or its first
  action. After loading the current version, focus the first field or announce that it loaded.

### F3 (Major): at 150% text on a 390px phone the editor footer overflows and Save is clipped

- Path: `src/features/glossary/ui/glossary.css:682-699` (`white-space: nowrap` labels) together with
  `homebrew-editor.tsx:331` (`Group wrap="nowrap"`).
- Viewport/theme/language: 390px at 150% text, both ES and EN, both themes. The 820px tablet is fine.
- Reproduction (browser-tested): set `html { font-size: 150% }` and open the editor. The footer's
  `scrollWidth` is 450 against a `clientWidth` of 357 (ES), and the Save button's right edge sits at
  459px in a 390px viewport. "Guardar cambios" and "Save changes" are cut off at the screen edge.
- Impact: the primary action of the form is partly off-screen at a text size the design system
  requires.
- Fix direction: let the footer wrap at large text (Save full width on its own row, with delete
  and Cancel above it). Or drop the footer Cancel on phones, since the header X already closes.

### F4 (Moderate): "entry deleted meanwhile" is a dead end that still offers Save and Delete

- Path: `src/features/glossary/ui/homebrew-editor.tsx:196-198, 318-338`.
- Viewport: all.
- Reproduction (browser-tested): edit, have someone delete the entry, then Save and "Cargar la
  actual". The alert says the entry was deleted, but the primary "Guardar cambios" stays enabled
  and the delete icon stays visible. Pressing Save brings back the generic "Esta entrada ha
  cambiado… Cargar la actual / Guardar la mía" alert, which loops back to "deleted".
- Impact: the person's edits have nowhere to go, and the prominent action does nothing useful.
  This is an undesigned state of the new flow.
- Fix direction: in this state offer "Save as a new entry" (new id, revision null) as the primary
  action, and Close, and hide delete. At minimum, disable Save and Delete and make Close primary.

### F5 (Moderate): "Add a house rule" is a bare glyph identical to the house-rule and lore marker

- Path: `src/features/glossary/ui/entry-actions.tsx:31-44` (`ScrollText`, tooltip `touch: false`).
  The same Lucide `ScrollText` is the `lore` category icon (`icon-maps.ts:44`) and the decorative
  marker in the house-rule title (`entry-article.tsx:191, 209`).
- Viewport: every touch viewport (390px, 820px), both themes and languages.
- Reproduction: open any SRD entry as the DM. The kind line ends in a lone scroll glyph. Nothing on
  screen says it adds anything, and on touch there is no tooltip. Previously this was a labelled
  menu item.
- Impact: the only entry point for attaching a house rule to an SRD rule is not discoverable on
  the devices this app targets. The same glyph also means "this is a house rule" elsewhere on the
  page. This conflicts with "essential information cannot depend on hover" and with the user's bar
  for contextual, designed actions.
- Fix direction: give it a distinct add affordance (a scroll with a plus badge, or a compact
  labelled ghost action such as "+ Regla de la casa"). On phones, fold it into the ⋯ menu with
  its label, as edit and delete already are.

### F6 (Minor): focus falls to `<body>` when the trigger no longer exists

- Path: `src/features/glossary/ui/homebrew-manager.tsx:42-45`.
- Reproduction (browser-tested, 390px and 820px): in the deleted-meanwhile state (F4), press Escape.
  The trigger (the house rule's actions) has been unmounted, so focus lands on `<body>`.
- Fix direction: fall back to the open entry's headword (or `main`) when `trigger.current` is
  disconnected.

### F7 (Minor): closing a dirty editor discards edits without asking

- Path: `src/features/glossary/ui/homebrew-editor.tsx:73-75, 332`.
- Reproduction (browser-tested): change Resumen, then press Cancelar (or Escape, or X). The editor
  closes at once and the change is lost. The body field allows 8000 characters.
- Impact: a mis-tap at the table loses a typed rule. The behaviour predates this ticket, but the
  ticket makes the editor reachable from many more places, including over the reference sheet.
- Fix direction: when `form.isDirty()`, confirm discarding.

### F8 (Nit): accessible-name punctuation is inconsistent

`glossary.hb.actions` reads "Acciones de Descanso duro" / "Actions for Descanso duro" without
quotes, while the sibling names use «» / “” (`src/shared/i18n/glossary-{es,en}.ts:125-126`).

## What works

- Edit and delete appear on the homebrew reader, on house rules inside SRD entries and in the
  reference sheet. They are 44px subtle icon buttons with a red trash and named labels, and they
  fold into a labelled ⋯ menu below 48em. They sit on the kind line or the callout head without
  inflating it. No pills, no stacks of text buttons.
- The delete modal is titled with the entry name and has a quiet danger mark and one line of
  consequence. Cancel has the initial focus and the red `light` confirm names the action. On
  phones the actions are full-width rows. A stale delete shows an error and the retry deletes the
  live revision.
- Stacking: the editor and delete modal open above the reference sheet. Escape closes only the
  topmost layer, a second Escape closes the sheet, and focus returns to the exact trigger (pencil
  or trash from 48em, the ⋯ trigger on phones).
- The sticky footer rests on the bottom edge at 100% text on both sizes.
- Players with the module on see the same controls, as ADR 025 requires.

## Tested scenarios

Browser-tested by the reviewer. The bundle was built from this worktree in Supabase identity mode
and served with `vite preview` on 127.0.0.1:4191. Playwright drove it with the e2e identity
fixture (`tests/e2e/fixtures/identity.ts`, route-mocked RPCs) at 390x844 and 820x1180 with touch,
plus one 1440x1000 run:

| Scenario | 390 | 820 |
| --- | --- | --- |
| SRD entry with house rule, dark ES: layout, add icon, house-rule actions | ok (F5) | ok (F5) |
| Phone ⋯ menu by keyboard (Enter opens, Escape returns focus to trigger) | ok | n/a |
| Desktop-style pencil focus tooltip, Enter opens editor | n/a | ok |
| Editor: initial focus on Name, Tab order, footer position, scroll to bottom | ok | ok |
| Editor Escape returns focus to trigger | ok | ok |
| Conflict: alert, focus, Load current, Save mine | F1/F2 | F1/F2 |
| Deleted meanwhile: alert, Save, Escape | F4/F6 | F4/F6 |
| Background refetch while typing (60s interval) | F1 | F1 |
| Dirty Cancel | F7 | F7 |
| Delete confirm: name, initial focus, Tab cycle, Escape focus return | ok | ok |
| Delete with stale revision then retry | ok | ok |
| Delete open entry: back to index, focus on `main` | ok | ok |
| Reference sheet: edit and delete above it, Escape layering, focus return | ok | ok |
| Light EN at 100%: house rule, editor, delete-from-editor confirm | ok | ok |
| Light EN at 150% | F3 | ok |
| Dark ES at 150%: entry and editor | F3 | ok |
| Long (73-char) name: house-rule head, delete title, no page overflow | ok | ok |
| Player with module on sees controls (ADR 025) | ok | ok |
| 1440px conflict focus | F2 (focus to body) | |

- Axe (wcag2a/2aa/21aa/22aa): 0 violations in all 12 states per viewport (SRD with house rule,
  editor, conflict, delete, reference sheet, and light EN at 100% and 150% for house rule, editor
  and delete).
- Touch targets: no control under 44px in `main` or dialogs, apart from inline glossary terms,
  which use the documented 44px pseudo-element hit area. No horizontal page overflow.
- Reduced motion: the dark scenarios ran with `prefers-reduced-motion: reduce`. No information
  depended on motion.
- Reviewer captures (not committed; outside the repository):
  `C:\Users\dmont\AppData\Local\Temp\claude\C--Users-dmont--claude-spares-spare-4QdntX\77848685-adcc-4fea-bde2-0c6bcfb5bc65\scratchpad\review\shots\`
  (for example `phone-51-es-150-editor.png` for F3, `phone-06-gone.png` for F4,
  `tablet-01-srd-house-dark-es.png` for F5), with the raw logs `log.jsonl`, `log2.jsonl` and
  `log3.jsonl` next to it.
- Implementer screenshots in `docs/evidence/RYT-040/` were also inspected and match the
  browser results at 100% text.

## Limitations

- The official `tests/e2e/glossary.spec.ts` was not rerun by the reviewer: port 4174 was held by
  another agent. The implementer reports it passing.
- Route-mocked RPCs only. No hosted PostgREST, real Google session or two real accounts.
- Chromium emulation only (Desktop Chrome with touch). No iOS Safari, real on-screen keyboard or
  screen reader. The on-screen keyboard effect in F1 is inferred from focus leaving the field.
- The thin strip at the right edge of some 390px captures is the emulated desktop scrollbar, not
  app UI.
- Light-theme scenarios ran without reduced motion. Transition durations were not measured.
- Demo mode was not rebuilt. Code shows `manage` is null outside a live campaign, so no controls
  render there.

## Re-review scope

After fixes, re-check F1 to F6 at 390px and 820px, at 100% and 150% text, in ES and EN. Also re-check
conflict focus at 1440px, and run axe on the conflict and deleted-meanwhile states.

## Round 2: focused re-review of commit `000098d`

- Date: 2026-11-03
- Reviewed source: `000098d` (on top of `26e2a78`), same worktree and branch.
- Source fingerprint (`node scripts/check-ui-review.mjs --fingerprint`):
  `428b075baab0d75377e109051f0ee5d6c8a7b5a7ecd19cc57e48b63c0a757724`

### Verdict: CHANGES_REQUIRED

All eight round-1 findings are fixed and verified in the browser. The fixes are well made: the
labelled "+ Regla de la casa" action and the "Guardar como nueva" recovery both meet the bar. One
new Major finding remains (N1). It is a WCAG 2.2 AA failure in the editor footer that F3 touched,
and it got worse with the taller reflowed footer. Part of it predates round 1, and I missed it
then. There are also two minor findings.

### Round-1 findings

| Finding | Status | Browser evidence (390, 820, plus 1440 where relevant) |
| --- | --- | --- |
| F1 Blocker: refetch steals focus | Fixed | Editor open, remote change, real 62s wait, refetch observed: focus stays in the textarea and "abc def" is kept (390, 820). First load of an entry on its own route still focuses the H1. |
| F2 Major: conflict focus | Fixed | Focus goes to the alert inside the dialog (390, 820, 1440). Tab reaches "Cargar la actual"; after loading, focus is on Nombre. "Guardar la mía" saves and focus goes to the headword. |
| F3 Major: footer clipped at 150% | Fixed (see N1) | ES and EN at 100% and 150%, normal and deleted-meanwhile footers: `scrollWidth` equals `clientWidth` everywhere, and every button is inside the viewport and 44px tall. |
| F4 Moderate: deleted-meanwhile dead end | Fixed (see N2) | The deleted state is detected automatically after the stale save. Delete is hidden and the footer is "Cancelar / Guardar como nueva". Saving sends a new id with revision null, the house rule shows the rescued text, and focus goes to the headword. |
| F5 Moderate: bare scroll icon | Fixed | A labelled subtle "+ Regla de la casa" button (44px). Its name "Añadir una regla de la casa a «Descanso largo»" includes the visible label (SC 2.5.3). It opens a new entry already attached to the SRD entry, Escape returns focus to it, and it is absent from the reference sheet. |
| F6 Minor: focus to body | Fixed | Discarding the deleted-meanwhile editor focuses the page headword (390, 820, 1440). |
| F7 Minor: silent discard | Fixed (see N3) | Escape, X and Cancelar on a dirty form all ask first. "Seguir editando" holds focus. Escape closes only the question and focus returns to the field with its text kept. Discard returns focus to the opener. A clean or reverted form closes at once. Over the reference sheet: Escape asks, Escape closes the question, and after discarding the sheet stays open with focus on its edit control. |
| F8 Nit: names | Fixed | "Acciones de «Descanso duro»" and "Actions for “Descanso duro”". |

### New findings

#### N1 (Major): focused fields are hidden behind the sticky editor footer at 390px

- Path: `src/features/glossary/ui/glossary.css:682` (`.gl-editor-footer`, sticky) and the reflow rules
  added in `000098d` (`.gl-editor-footer-actions`). The drawer's scroll container has no
  `scroll-padding-bottom`.
- Viewport/theme/language: 390px, both themes, ES and EN. Worst at 150% text; partly at 820px and
  150% (9px of 44 visible).
- Reproduction (browser-tested): open the editor and Tab through the form, measuring how much of
  the focused control shows above the footer.
  - At 100%, "Añadir un dato" shows 2px of 44.
  - At 150% (ES), the Descripción textarea (181px tall) and a quick-fact input show 0px: they are
    completely under the footer.
  - axe reports `target-size` ("partially obscured") on that button at 390px at 100%, in ES and
    EN and with the discard question open.
- Impact: a keyboard user (tablet or phone with a keyboard, switch access) cannot see where focus
  is. This fails SC 2.4.11 Focus Not Obscured (Minimum, AA). The F3 reflow makes the footer 209px
  tall at 150% in ES (a quarter of the screen) because the delete icon takes a row of its own,
  which widens the hidden band.
- Fix direction: give the drawer's scroll container `scroll-padding-bottom` equal to the footer
  height so focused controls scroll clear of it. Keep the delete icon on the same row as Cancelar
  at large text (for example `[trash][Cancelar]` over a full-width Guardar) so the footer stays at
  two rows.

#### N2 (Minor): a failed "Guardar como nueva" shows nothing

- Path: `src/features/glossary/ui/homebrew-editor.tsx:263-302`. While `gone`, the conflict branch
  renders only the deleted text, and the general `error` alert in the `else` branch never renders.
- Reproduction (browser-tested at 820px): reach the deleted-meanwhile state, go offline, and press
  "Guardar como nueva". The button stops loading and the only alert is still the deleted message.
  The `unavailable` error is swallowed. By code, `duplicate` and `invalid` behave the same way.
- Impact: the user thinks the save worked or simply does nothing; their edits are still at risk.
- Fix direction: in the deleted state, render the save error below the deleted message.

#### N3 (Minor): the discard question's buttons are a ragged right-aligned stack on phones

- Path: `src/features/glossary/ui/homebrew-editor.tsx:127` with `glossary.css:743-750`. The
  full-width phone rule targets `.gl-delete .gl-delete-actions`, and the discard modal has no
  `.gl-delete` wrapper.
- Viewport: 390px, both themes, ES and EN (100% and 150%).
- Impact: "Seguir editando" and "Descartar cambios" wrap into two right-aligned rows of different
  widths. That looks unfinished next to the delete confirmation's full-width rows.
- Fix direction: apply the same phone rule to the discard question (for example a shared class).

### Regression checks (browser-tested)

- Delete confirmation from the page and over the reference sheet: Cancelar has the initial focus.
  Escape returns focus to the opener (pencil or trash from 48em, ⋯ on phones). A second Escape
  closes the sheet. Confirming returns to the index with focus on `main` (390, 820, 1440).
- Escape layering editor, then question, then sheet: correct at all three sizes.
- 44px targets: no control under 44px in `main`, dialogs or menus in any state. No horizontal page
  overflow.
- Axe (wcag2a/2aa/21aa/22aa): 48 of 51 runs clean. The 3 violations are N1's `target-size` at 390px.
  Covered: SRD entry with the new button, editor at ES/EN 100%/150%, conflict, deleted-meanwhile,
  discard question, and delete.
- Themes and languages: dark ES and light EN at 100% and 150% for the editor, the deleted state and
  the discard question. Dark ES for the conflict, delete and reference sheet.
- Reduced motion was emulated for every round-2 scenario.

### Round 2 limitations

- The coordinator's preferred port 4192 refused to bind although nothing was listening. The
  bundle was served with `vite preview` on 127.0.0.1:5291 (identity mode, route-mocked RPCs).
- The official e2e suite was not rerun by the reviewer; the implementer reports it passing.
- The F1 check used a real 62s wait and a fixture remote change, not two real accounts.
- Chromium emulation only. No iOS Safari, real on-screen keyboard or screen reader.
- Captures and logs (not committed):
  `C:\Users\dmont\AppData\Local\Temp\claude\C--Users-dmont--claude-spares-spare-4QdntX\77848685-adcc-4fea-bde2-0c6bcfb5bc65\scratchpad\review\r2\`
  (`shots/phone-31-editor-es-150.png` for N1, `shots/tablet-03-gone-offline.png` for N2,
  `shots/phone-10-discard.png` and `shots/phone-33-discard-en-150.png` for N3, and the
  `log.jsonl`, `probe.jsonl` and `probe2.jsonl` measurements).

### Round 3 re-review scope

N1 (Tab through the editor at 390 and 820, at 100% and 150%, ES and EN, with axe), N2 (offline
"Guardar como nueva") and N3 (discard question at 390px).
