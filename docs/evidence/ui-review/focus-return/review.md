# ui-ux review: focus return once the target is reachable

- Reviewer role: `.codex/agents/ui-ux.toml` (independent, implementation read-only)
- Reviewed source: local commit `cdf45ca` ("Return focus once the target is reachable: initiative
  save, combat dialogs, glossary sheet"), not pushed
- UI source fingerprint (`node scripts/check-ui-review.mjs --fingerprint`):
  `ce8ff81c2f6e04f0b1bc05ce0cfce676956c5705668cba30aec8b2b2646af842`
- Date: 2026-11-04
- Scope: `src/shared/ui/focus-when-ready.ts` (new), `src/features/combat/ui/table-display.tsx`,
  `src/features/combat/ui/helpers.ts` (`useReturnFocus`), `src/features/glossary/ui/reference-sheet.tsx`.
  No visual change was intended; none was seen.

## Verdict: CHANGES_REQUIRED

The change does what it is for. Under a 6x CPU throttle with 800 ms delayed responses, focus
lands on the edit pencil after a Player saves initiative, returns to the ⋯ trigger after each
combat dialog, and returns to the term after the definition sheet, on 390, 820 and 1440 px. One
property the change documents is not met: it does pull focus back from a user who has already
moved on, in the case that matters on a slow device (F1). That is not a regression (the previous
code did the same unconditionally), but the helper's stated guarantee and the review brief
("immediately Tab elsewhere, focus must stay where the user moved it") fail. One medium finding.

## Findings

### F1 (Medium, blocking): `focusWhenReady` steals focus from a user who moved during the awaited save

- Where: `src/shared/ui/focus-when-ready.ts:14` (`const origin = document.activeElement`) and `:23`
  (`active === origin` counts as "fallen"); call sites `src/features/combat/ui/table-display.tsx:236-246`
  (and the same pattern at `:164`, `:217`).
- Cause: `origin` is read when `focusWhenReady` is called. In the initiative save that is after
  `await run(...)`, which only resolves after the server call and refetch. If the user moved focus
  during that wait, the element they moved to becomes `origin`, so the first tick treats it as
  "focus fell back" and focuses the pencil. The "gives up if focus lands on another control"
  branch only protects moves made after the call.
- Reproduction (390x844, es, dark; fixtures from `combat.spec.ts` RYT-042; as a Player in the
  initiative phase):
  1. Type 17 in "Total de iniciativa de Arin" and press Guardar iniciativa. With responses delayed
     (set_initiative 1500 ms, or get_combat_state 2500 ms; the same happens at 6x CPU throttle),
  2. before the save finishes, Tab (or focus) another persistent control, for example the bottom
     nav "Grupo" or "Perfil".
  3. When the save resolves, focus jumps to "Editar la iniciativa de Arin".
- Measured (focus trace, ms from the save): fast machine, Tab to `a[Grupo]` at 258, pencil takes
  focus at 309; delayed 1500 ms, `button[Perfil]` focused at 5, pencil takes it at 1555; get
  delayed 2500 ms, Perfil at 8 and pencil at 1842. Same result on the parent commit (`cdf45ca^`),
  so it is not a regression, but the new helper does not fix it.
- Impact: a keyboard or screen reader user (or a Player on a tablet who has already tapped the
  nav) is pulled back to a control on a page they are leaving. The window is as long as the
  save plus refetch, which is exactly what is long on a slow device. A tap on empty space or
  on a `tabindex="-1"` container (for example `main`) is also read as "fallen" for the same
  window (see F2).
- Suggested direction (not applied, implementation is read-only for this review): capture the
  origin when the action starts (in `save`/`cancel`, before `await run`) and pass it in, or drop
  `active === origin` and rely on `!active.isConnected`, `document.body` and the dialog
  container. Add a test: save with `set_initiative` delayed, move focus to a persistent control,
  assert it stays after the save resolves.

### F2 (Low, not blocking): a tap on empty space inside the wait window is treated as fallen focus

`fallen()` (`focus-when-ready.ts:20-26`) returns true for `document.body` and for any non-heading
`tabindex="-1"` element, which is also where focus goes when the user taps empty page space.
Within the retry window (up to 3 s while the target is missing, 300 ms after it is focused) such a tap
is answered by `el.focus()` on the pencil. The pencil call does not use `preventScroll`
(`table-display.tsx:84` passes the default), so on a tablet that can scroll the page back. Observed:
blurring to body while waiting ends on the pencil (`S3c`); the scroll jump was not measured.
Window is short in practice because the target usually exists when the call is made.

### F3 (Info, pre-existing, unrelated to this commit)

`glossary.spec.ts` "closing a dirty editor asks before discarding the edits" fails on
`identity-mobile` (line 462, first Escape, dialog still present). It fails the same way on a build of
the parent commit (8/8 with parallel workers, 6/6 with one worker), so this commit did not cause it.
Likely cause (hypothesis from reading the test and a probe, not proven): `entryAction` clicks the
menu item and returns before the editor has mounted, so the Escape reaches the closing menu; an
Escape sent after the editor is visible closes it (probe, 0/300/1000 ms, both builds).
Worth a test fix by the owner of that spec.

### F4 (Info): dev-only focus flash

In `vite` dev (StrictMode) `useReturnFocus` runs its cleanup once on mount, so the opener gets focus
for about 3 ms before the dialog's own focus trap takes it. Focus ended inside the dialog after
1.5 s in both dialogs tried. No effect in the production build; mentioned so nobody chases it.

## Scenarios tested (all in a real Chromium via Playwright; evidence is console output, no screenshots kept in the repo)

Build under test: production build of `cdf45ca` in supabase-mode with the e2e fixtures, served on
127.0.0.1:4280 (demo build on 4281, parent-commit build on 4282 for comparison, dev server on 4283).
Viewports 390x844, 820x1180 (touch) and 1440x1000. CDP `Emulation.setCPUThrottlingRate` 6 and route
delays of 800 ms on `get_combat_state`, `list_encounters` and `set_initiative`.

Initiative save (Player, table view, `combat.spec.ts` RYT-042 setup):
- 1x CPU, no delay: pencil focused after 52-100 ms, then held; Cancel path returns to the pencil. Pass at 390, 820, 1440.
- 6x CPU + 800 ms: pencil focused after about 2.2-2.3 s (focus sat on body for about 15 ms in between,
  then the pencil); stayed for 1.5 s; Cancel path returns to the pencil. Pass at 390, 820, 1440.
- No-steal, user moves during the save: FAILS (F1).
- Focus dropped to body while waiting: ends on the pencil (by design, see F2).

Combat dialogs (DM console, `seedActive`, RYT-041 setup), "Quitar del combate" and "Cambiar iniciativa"
each closed with Escape and with Cancel, plus saving the initiative dialog:
- 1x: trigger refocused in 15-112 ms. 6x + 800 ms: 137-341 ms for Escape/Cancel, about 2.2-2.3 s for save. Pass at all three sizes.
- No-steal: after Escape or Cancel, `Tab` or `focus()` on another control 150 ms later keeps the new focus
  (final focus on the row after the trigger / "Siguiente turno"). Pass. Within the same tick as the close the move is
  overridden, which is not reachable by a person because the modal traps focus until it unmounts.

Definition sheet:
- Character-sheet term (`Atletismo`): open by tap/click, Enter and Space; close by Escape, close button and
  overlay click; focus returns to the same term each time, also across 4 quick repeats. Nested term, back, Escape returns
  to the original term (not the nested one). Pass at 1x and 6x, 390/820/1440.
- Item card (`Espada larga` > `cortante`): first Escape closes only the sheet and focus is on the term (210-320 ms),
  the card stays open and keeps focus on the term for 800 ms; second Escape closes the card and focus is on the item. Close-button
  path also returns to the term with the card open. Pass at 1x and 6x, 390/820/1440.
- Regular glossary entry (`rule.long-rest`, term `puntos de golpe`): open, Escape, term focused. Pass.
- After Escape, a Tab 200-250 ms later is kept (no steal). Pass.
- "Abrir en el glosario": focus ends on the new page's `main`/`h1`, same trace as the parent build. Pass.
- Axe (wcag2a, wcag2aa, wcag21aa) with the sheet open (alone and over the item card), no horizontal scroll,
  44 px targets inside dialogs: clean in es/dark and en/light, at 150% text, at 390 and 820 (screenshots inspected, no change
  to the layout).

Repository e2e: `CI=1 playwright test combat glossary inventory` through a temporary config outside the repo
(same `identity-*` projects, ports moved to 4280, retries 1; the stock ports were not usable because 4174 shows a
stale listener): 146 passed, 3 skipped, 1 failed (F3, unrelated).

## Limitations

- Mouse, touch and keyboard were driven by Playwright; no real device, no screen reader (announcements of the
  moved focus and of the saved-state live region were not heard).
- The throttle only slows this tab's CPU; real low-end device timing for the 3 s timeout and the 300 ms settle was
  not exercised beyond 6x and 800 ms.
- Safari/iOS (where tapping a button does not focus it) was not tested; the sheet's opener capture
  would be `body` there and nothing is returned, as before.
- F2's scroll jump and the supabase-live (non-fixture) refetch timing were not measured.

## Cleanup

Servers started for this review (4280, 4281, 4282, 4283) were stopped and `dist-review-uiux*` was removed. No file in
the repository other than this report was written.

---

# Round 2: focused re-review of `689482b`

- Reviewed source: `689482b` ("Keep focus where the user moved it during an initiative save") on top of `cdf45ca`
- UI source fingerprint, computed in a clean `git archive HEAD` export (the working tree has another
  session's changes, which were not part of this build):
  `b1453e24ab12b30e3862513be13cb3017b3d562bb58a7e74891d3cf61e96be5f`
- Date: 2026-11-04
- Build under test: production build of that export in supabase-mode with the e2e fixtures, served on
  127.0.0.1:4284. Same method as round 1 (Playwright in Chromium, 390x844 / 820x1180 touch / 1440x1000,
  CDP CPU throttle 6x, 800 ms route delays).

## Verdict: PASS

## Per-finding status

- **F1 (Medium): resolved.** The initiative save captures `document.activeElement` before `await run(...)`
  (`table-display.tsx`) and passes it as `from`, so a focus move made during the save is no longer read as
  fallen focus. Verified at 1x and 6x CPU, 390 and 820 px:
  - Save with `set_initiative` delayed 1500 ms, user focuses "Perfil" before it resolves: focus stays on
    "Perfil" after the save resolves and for 2 s more (round 1: pencil took focus at 1555 ms).
  - Save with `get_combat_state` delayed 2500 ms, user focuses "Perfil" afterwards: stays.
  - Tab from the save control to "Grupo" / "Saltar al contenido" immediately after pressing Save
    (1x, and 6x + 800 ms, three viewports): focus stays there after the save settles; the pencil is not focused.
  - Idle user (no move), 1500 ms delay, 1x and 6x: pencil still takes focus.
- **F2 (Low): resolved.** With the save pending, a click on blank space inside `main` leaves focus on
  `main#main-content` through the save and the settle window (trace: save button, then main, no pencil); 1x
  and 6x, 390 and 820. Focus dropped to `body` (not a focus on a container) is still returned to the pencil
  by design, which is the fall-back case and is intended.
- **F3 (Info, pre-existing): unchanged.** `glossary.spec.ts` "closing a dirty editor…" on `identity-mobile`
  still fails the same way; unrelated to this change (see round 1).
- **F4 (Info, dev-only): unchanged, no action.**

## Regression checks (all pass unless stated)

- Initiative save, 6x CPU + 800 ms delays: pencil focused after about 1.9-2.5 s at 390, 820 and 1440 px
  (focus on body for 15-100 ms in between); Cancel path returns to the pencil; 1x: 50-110 ms.
- Combat dialogs ("Quitar del combate", "Cambiar iniciativa", each with Escape and Cancel, plus saving the
  initiative dialog): trigger refocused in 16-54 ms at 1x, 157-464 ms at 6x (Escape/Cancel) and about 2.2-2.4 s
  for the save. A move made 150 ms after closing is kept. All three viewports.
- Definition sheet: term from the character sheet (tap/click, Enter, Space; Escape, close button, overlay),
  nested term + Back + Escape returns to the original term, four quick repeats, glossary-entry term, item
  card (first Escape closes only the sheet and focus is on the term, second Escape closes the card and focus
  is on the item), a Tab 200-250 ms after Escape is kept, "Abrir en el glosario" lands on the page's
  `main`/`h1`. 1x and 6x, all three viewports.
- Axe (wcag2a, wcag2aa, wcag21aa) with the sheet open over the item card, es/dark and en/light, at 150% text,
  390 and 820 px: no violations, no horizontal scroll, dialog targets at least 44 px.
- Repository e2e `combat`, `glossary`, `inventory` (`CI=1`, same `identity-*` projects through a temporary
  config outside the repo, retries 1): 146 passed, 3 skipped, 1 failed (F3 only).

## New findings

None.

## Limitations (round 2)

- One run of the scripted initiative-save check at 6x + 800 ms (the first test of a full run, mobile) did not see
  the pencil focused within 20 s. It did not reproduce in 3 further full mobile runs, 4 runs of the whole spec
  on three viewports (27 initiative saves), and 16 parallel repeats on 8 workers. The machine was shared with
  other sessions at the time. I could not capture a diagnosis for that single run, so I cannot say whether it
  was load on the shared machine, the harness or a real race; it should be watched when the CI e2e is run.
- Same as round 1: Playwright-driven input, no real device or screen reader, no iOS Safari, throttle limited to 6x.

## Cleanup (round 2)

Server on 4284 stopped, the temporary HEAD export and its build output deleted. No file in the repository
other than this report was written.
