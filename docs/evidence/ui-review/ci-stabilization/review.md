# ui-ux review: CI stabilization (definition focus, bestiary filters dropdown)

- Reviewer role: `.codex/agents/ui-ux.toml` (independent, implementation read-only)
- Reviewed source: commit `eb500db` ("Stabilize CI: definition focus survives a late focus trap,
  filters dropdown fits the screen")
- UI source fingerprint (`node scripts/check-ui-review.mjs --fingerprint`, verified in a clean
  worktree at `eb500db`): `d94720769e23205cca0d1dfccdda247452c7140651c1ef16caed483361ac1421`
- Date: 2026-11-04
- Scope: `src/shared/ui/focus-when-ready.ts` (`leaving` option),
  `src/features/glossary/ui/reference-sheet.tsx`, `src/features/combat/ui/bestiary.tsx` and
  `bestiary.css` (RYT-046 filters Popover: `size` middleware, scrolling dropdown, sticky actions
  row), tests in `tests/e2e/bestiary.spec.ts` and `tests/e2e/glossary.spec.ts`.
- Round 2 (focused re-review): commit `8d7ebab` ("Filters: a side sheet when there is no room,
  sticky actions on the dropdown's surface above the slider"), fingerprint
  `88aac0eb451de1429be702016bb9a59a39eeb331230517ca63e514e53091089c`. See "Round 2" below.
- Round 3 (focused re-review): commit `3f93fe4` ("Filters button keeps aria-expanded for either
  surface; slider thumbs stay under the sticky actions"), fingerprint
  `717b0bbe71c6a08a2d8e926684b4013572c10e1a84867fdca14903c9f7500d97`. See "Round 3" at the end.

## Current verdict (round 3, `3f93fe4`): PASS

F1 through F4 and R2-1, R2-2 and R2-3 are all resolved, and no findings remain open. The approval
applies only to fingerprint `717b0bbe…0d97`.

## Round 2 verdict (`8d7ebab`): PASS

F1, F2 and F3 are resolved, and F4 is resolved at the bottom edge. Three non-blocking Low items
remained (R2-1, R2-2, R2-3 in the Round 2 section).

## Round 1 verdict (`eb500db`): CHANGES_REQUIRED

The definition sheet change is correct and passes everything asked of it: focus returns to the
term after a normal, fast and 20 ms Escape, at 1x and 6x CPU, and a user who moves elsewhere
keeps their focus. On the parent commit the fast Escape leaves focus on `body` (4/4). No findings
there.

The filters dropdown does fix the CI case at 100% text: it fits the viewport, scrolls inside,
wheel and touch scrolling stay inside it, Escape returns to Filtros and the results button works.
But the new sticky row has three problems the brief asks about. At 150% text on short screens the
CR slider paints over the sticky row and catches taps meant for "Ver N criaturas" (F1, high). The
row's background does not match the dropdown in either theme (F2, medium). At 150% text the
dropdown can be a sliver or open off-screen, so "fits the screen" is not met there (F3, medium;
the off-screen case is pre-existing).

## Findings

### F1 (High, blocking): the CR slider covers the sticky actions and catches taps on "Ver N criaturas"

- Where: `src/features/combat/ui/bestiary.css:66-72` (`.bst-filter-dropdown .bst-filter-actions`
  is `position: sticky` with no `z-index`); the slider is `src/features/combat/ui/bestiary.tsx:532`.
  Mantine's slider bar (`.m_38aeed47`) has `z-index: 1` and its thumbs are positioned too, so
  they paint above a sticky sibling that has `z-index: auto`.
- Viewports: 1440x800 and 820x900 at 150% text, es/dark and en/light (any case where the
  dropdown is short enough for the slider to sit at the height of the sticky row; the same happens
  at 100% text when the dropdown is about 160 px tall or less).
- Reproduction: 1440x800, `html { font-size: 150% }`, DM bestiary, click Filtros. The slider
  track, both thumbs and the "0" value bubble cover "Quitar filtros" and "Ver 330 criaturas"
  (`slider-over-actions-1440x800-150-light.png`). `document.elementFromPoint` at the centre of both
  buttons returns `mantine-RangeSlider-bar` at scrollTop 0 (1440x800) and at scrollTop 40
  (820x900). A real pointer click at the centre of "Ver 330 criaturas" left the dropdown open and
  changed the label to "Valor de desafío: 0 a 23", so the click set a filter instead of showing
  results.
- Impact: on a laptop or landscape tablet with large text, the main action of the dropdown can't
  be read and a tap on it silently changes the CR range. That is the opposite of the commit's goal,
  which is keeping the results button in reach.
- Suggested direction (not applied): give the sticky row a stacking level above the slider (for
  example `z-index: 2` or more on `.bst-filter-actions`), or `isolation: isolate` on the slider's
  wrapper. Add a test that clicks the results button by its centre with a short dropdown at 150% text.

### F2 (Medium, blocking): the sticky row is a different colour from the dropdown, an inset band with hard edges

- Where: `src/features/combat/ui/bestiary.css:71` (`background: var(--mantine-color-body)`).
  The app maps `--mantine-color-body` to `--app-bg` (`src/app/providers.tsx:55,61`). The Mantine
  Popover dropdown is `--mantine-color-dark-6` in dark and `--mantine-color-white` in light.
- Measured: dark dropdown `rgb(42, 31, 22)` vs row `rgb(20, 15, 11)`. Light dropdown
  `rgb(255, 255, 255)` vs row `rgb(247, 239, 226)`. Same on every size tried.
- Look: the row only spans the content box. 16 px of dropdown colour shows on each side (25 px at
  150%), so it reads as a separate darker (dark theme) or beige (light theme) box inset at the
  bottom of the card. Chips scrolling under it are cut by a straight edge, with no separator or
  shadow to show that more content is above (`band-and-focus-1024x700-dark.png`,
  `band-1024x700-light.png`). In light, the disabled "Clear filters" looks like a grey slab on
  beige over white.
- Impact: visual consistency. The row looks like a stray element, not the dropdown's footer, in
  both themes. Not a functional failure.
- Suggested direction: paint the row with the dropdown's own surface. Either set one app token
  on both `.bst-filter-dropdown` and the row, or override the dropdown background and reuse it. Let
  the row span the dropdown's inline padding (negative `margin-inline`, matching `padding-inline`).
  Add a top border or a soft top shadow while content is under it. Check both themes and a class
  theme.

### F3 (Medium, blocking): at 150% text the dropdown becomes a sliver or opens off-screen and never flips up

- Where: `src/features/combat/ui/bestiary.tsx:702` (`position="bottom-end"`) and `:710`
  (`middlewares={{ size: { padding: 8 } }}`).
- Measured, es/dark at 150% text (`placement` stays `bottom-end` in every case, although there is
  far more room above the button):
  - 820x900: dropdown 120 px tall, `max-height: 119.5px`. The sticky row is 77 px, so about
    23 px of filter content is visible between the top padding and the row. Every chip and the CR thumbs are
    only partly in view when focused by Tab, and Shift+Tab leaves each focused chip above the top
    edge. There are 720 px free above the button.
  - 1440x800: dropdown 155 px tall, about 60 px of content visible, same Tab result (and F1).
  - 1024x700: the button ends at y=687. `availableHeight` is negative, so no `max-height` is
    applied and the dropdown opens at y=695-1560, below the fold. Tapping Filtros shows nothing
    (`offscreen-1024x700-150-dark.png`). The parent commit behaves the same here (695-1545), so this
    case is pre-existing. The fix does not cover it.
  - At 100% text the same lack of flip leaves 1024x700 with a 183 px dropdown, about 100 px (two
    chip rows) of content, while 457 px are free above. It works but is cramped.
- Impact: with large text on a short screen the filters are hard or impossible to use. The new
  test only covers 100% text at 900 px height.
- Suggested direction: let the dropdown flip or fall back when the space below is too small. For
  example, require a minimum usable height before accepting `bottom-end` (floating-ui `flip` with a
  `size`-aware fallback, or a `size.apply` that switches placement). Or scroll the Filtros button
  toward the top before opening, or use the phone Drawer when the available height is under about
  320 px. Add the 150% / short-height cases to the e2e.

### F4 (Low, not blocking): a focused chip can end 2 px under the sticky row, so its focus ring is clipped

- Where: `src/features/combat/ui/bestiary.css:64` (`scroll-padding-bottom: 5rem`).
- Cause (measured): the focusable element is the chip's visually hidden `<input>`, a 0x0 box
  near the middle of the chip. Scroll padding brings that box into view, not the visible label. At
  1024x700 the label of "Dragón" ends at 627 px and the row starts at 625 px. The 2 px orange ring
  touches the band and its bottom edge is cut (`band-and-focus-1024x700-dark.png`). The same
  happens at 1440x800 (Humanoide, Monstruosidad, Cieno, Undead and others). Going up with
  Shift+Tab can leave the focused chip partly above the top edge (no `scroll-padding-top`).
- Impact: the focus position is still clear, but the ring is not fully visible. Fix it together
  with F2, for example by scrolling the label into view on `focusin` or by adding padding.

### F5 (Info, pre-existing, out of scope)

At 1024x700 with 150% text, the "Nueva criatura" header button clips "criatura" at its right edge
(`offscreen-1024x700-150-dark.png`). This commit does not touch it.

## Scenarios tested (real Chromium via Playwright; console measurements plus the screenshots listed)

Build: production `vite build` of `eb500db` in supabase mode with the e2e fixtures, served on
127.0.0.1:4284. The parent commit (`eb500db^` = `e2bd4dc`) was built for comparison and served on
4285. Fixtures: `identityFixture`, `combatServer`, the same bestiary URL as `openBestiary`.

Filters dropdown (tablet/desktop Popover), 20 combinations: 820x1180, 820x900, 1024x700,
1440x800, 1440x1000, each in es/dark, en/light, es/dark at 150% and en/light at 150%:
- Fits the viewport and scrolls inside: pass at 100% text on all sizes (bottom 8 px above the
  viewport edge). At 150%: sliver at 820x900 and 1440x800, off-screen at 1024x700 (F3).
- Sticky row stays at the bottom edge (1 px gap), buttons 44 px high and not clipped, no
  horizontal overflow in the dropdown or the page: pass. Background matches: fail (F2). Slider
  above the row: fail at 150% on short screens (F1).
- Wheel (12 x 300 px) over the dropdown: the page stays at the same `scrollY` and the dropdown
  stays open, in all 20 cases. Pass.
- Touch drag (CDP touch events, 1024x700, `hasTouch`): the dropdown scrolls 0 to 526 (its end),
  and further drags do not move the page (`overscroll-behavior: contain`). Pass.
- Tab through both CR thumbs, 15 type chips, 6 size chips, the sort control and the actions:
  focus never leaves the dropdown. A 2 px overlap appears at 1024x700 and 1440x800 at 100% (F4),
  and chips are only partly visible at 150% on short screens (F3). Fully clear at 820x1180 and
  1440x1000.
- Escape from a chip closes the dropdown and focuses Filtros: pass in all 20 cases.
- Pick "Muerto viviente" / "Undead" and press "Ver N criaturas" / "Show N creatures": the
  dropdown closes, the count reads 19, and focus returns to Filtros. Pass in all 20 cases (these
  clicks go through Playwright's actionability). A centre click with the slider on top fails at
  1440x800 150% (F1).
- axe (wcag2a, wcag2aa, wcag21aa) on the open dropdown: clean in all 20 cases.
- Phone (390x844, touch, es/dark and en/light at 150%): the filters Drawer is unchanged (the
  actions row is `position: static`, transparent), axe clean, Escape closes it, no horizontal
  overflow.
- Parent commit comparison at 100% text: the dropdown runs past the viewport bottom (820x900:
  557-1257, 1024x700 and 1440x800: 509-1209). So the commit fixes the CI case at 100% text.

Definition sheet focus (`Espada larga` item card > `cortante`, and character sheet > `Atletismo`),
at 390x844, 820x1180 and 1440x1000, 1x and 6x CPU (`Emulation.setCPUThrottlingRate`):
- A, normal (Enter, wait 600 ms, Escape): focus returns to the term in 618-756 ms. Pass in 12/12.
- B, fast (Enter then Escape at once): the trap focuses "Cerrar definición" inside the closing
  sheet, then the helper returns focus to the term after 29-101 ms. Pass in 12/12. On the parent
  commit focus ends on `body` (fail 4/4: 390 and 1440, 1x and 6x).
- C, Escape 20 ms after Enter: the term is focused after 36-112 ms. Pass in 12/12.
- D, no steal by keyboard (Escape, Tab 60 ms later): focus stays on the next control ("Versátil"
  / "Engaño"). Pass in 12/12.
- E, no steal by programmatic move (Escape, focus the card's "Cancelar" or the "Perfil" button
  40 ms later): focus stays there. Pass in 12/12.
- axe with the definition open over the item card: clean in es/dark and en/light at 390 and 820,
  and Escape returns to the term.

Repository e2e: `CI=1 npx playwright test tests/e2e/bestiary.spec.ts tests/e2e/glossary.spec.ts`
through a temporary config (identity-desktop, identity-tablet and identity-mobile projects,
baseURL 127.0.0.1:4284, retries 0, 4 workers): 77 passed, 1 skipped. The skipped test is the
new filters test on identity-mobile, skipped by design ("Phones use the filters drawer").

## Evidence

In this folder:
- `slider-over-actions-1440x800-150-light.png`: F1, the slider over both action buttons.
- `band-and-focus-1024x700-dark.png`: F2 (dark band inset in the dropdown) and F4 (the ring on
  "Dragón" touching the band).
- `band-1024x700-light.png`: F2 in the light theme (beige band on a white dropdown).
- `offscreen-1024x700-150-dark.png`: F3, the dropdown opened below the fold at 150% text.

## Limitations

- Headless Chromium on Windows does not draw classic scrollbars in these screenshots. Whether
  the dropdown and the page show two visible scrollbars side by side was inferred from geometry
  (the dropdown scrolls, the page scrolls separately), not seen.
- Touch was simulated with CDP touch events. No real device and no iOS Safari.
  `Input.synthesizeScrollGesture` did not move anything in this headless setup and was not used
  as evidence.
- No screen reader run. Reduced motion was not toggled for the dropdown; the definition probes
  ran with default motion.
- Only the default class theme was checked for F2.
- PGlite or hosted Supabase are not involved: the UI ran against the e2e route fixtures.

## Round 2: commit `8d7ebab`

- Reviewed source: local commit `8d7ebab` on top of `eb500db`. Fingerprint, verified in a clean
  worktree at `8d7ebab`: `88aac0eb451de1429be702016bb9a59a39eeb331230517ca63e514e53091089c`
- Date: 2026-11-04
- Change: `Toolbar` measures the space below Filtros when it opens. With less than 16rem, or on a
  phone, the panel opens in a Drawer (bottom on phones, right and 440 px otherwise) instead of the
  Popover. The Popover and the Drawer are now siblings around the same button. The sticky row gets
  `z-index: 2`, the dropdown's own surface (white / dark-6), the full width and a 1 px top border.
  `scroll-padding-bottom` goes to `6rem`. New e2e test for the side sheet.

### Verdict: PASS

### Round 1 findings, re-checked

- F1, resolved in every reachable configuration. The cases from round 1 (1440x800 and 820x900 at
  150%) now open the side sheet. Where the dropdown is still used (at least 16rem below the button),
  `elementFromPoint` at the centre of both action buttons hits the button in all 12 popover cases.
  The slider sits in the top of the content and can't reach the row. A residual gap remains (R2-1).
- F2, resolved. The row background equals the dropdown background in all 12 popover cases
  (dark `rgb(42, 31, 22)`, light `rgb(255, 255, 255)`). The row spans the full width (1 px from the
  border on each side) and has a 1 px top border (`rgb(77, 56, 40)` dark, `rgb(206, 212, 218)`
  light). In the screenshots it reads as the dropdown's footer: `r2-dropdown-1440x800-es-dark.png`,
  `r2-dropdown-1440x800-en-light.png`.
- F3, resolved. Space below vs threshold, and what opened:

  | Viewport | Text | Space below | Threshold | Opens |
  | --- | --- | --- | --- | --- |
  | 820x900 | 150% | 136 / 176 | 384 | side sheet, 660 px wide (27.5rem) |
  | 1440x800 | 150% | 171 | 384 | side sheet |
  | 1024x700 | 150% | 13 / -18 | 384 | side sheet (was off-screen) |
  | 1440x1000 | 150% | 371 | 384 | side sheet |
  | 1024x700 | 100% | 199 | 256 | side sheet, 440 px |
  | 820x1180 | 150% | 416 / 456 | 384 | dropdown, 400-440 px tall, 321-361 px of content |
  | 820x1180, 820x900, 1440x800, 1440x1000 | 100% | 299-631 | 256 | dropdown, at least 215 px of content |

  No dropdown is a sliver any more, and none opens off-screen.
- F4, resolved at the bottom edge. Tab forward through the thumbs, every chip and the actions: the
  focused chip's ring (label plus 4 px) never reaches under the row in all 12 popover cases. The
  top edge is still clipped when moving backwards (R2-2).

### Round 2 findings (all Low, not blocking)

#### R2-1 (Low): the slider thumbs still stack above the sticky row

- Where: `src/features/combat/ui/bestiary.css` (`.bst-filter-dropdown .bst-filter-actions`,
  `z-index: 2`). Mantine's RangeSlider thumb is `z-index: 3`; the track is `z-index: 1`.
- Repro (synthetic, 1440x1000, es/dark): force `.bst-filter-dropdown { max-height: 120px
  !important }`. The track goes under the row, but the max thumb paints over the right end of "Ver
  330 criaturas" (`r2-thumb-over-row-squeezed.png`). Centre hits still reach the button.
- Impact: none in a real layout now, because the 16rem threshold keeps the slider away from the
  row. Use `z-index: 4` or more, or `isolation: isolate` on the slider wrapper, so it can't return
  if the threshold or the layout changes.

#### R2-2 (Low, carried from round 1 F4): Shift+Tab leaves the focused chip partly above the top edge

- Where: `src/features/combat/ui/bestiary.css` (`.bst-filter-dropdown`, which has only
  `scroll-padding-bottom`).
- Measured (820x900, es/dark, 100%): with Shift+Tab, the ring of "Muerto viviente" and "Planta"
  is clipped by 28 px at the top edge, and "Elemental", "Dragón" and "Autómata" by 13 px. The
  same pattern shows at 820x1180 150% and 1440x1000. The cause is the same as in round 1: the
  browser scrolls the chip's hidden 0x0 input into view, not its label.
- Impact: focus is still visible (more than half of the chip is shown) but obscured. A
  `scroll-padding-top` of about 2rem, or scrolling the label into view on `focusin`, would fix
  it.

#### R2-3 (Low, small regression on phones): `aria-expanded` is false while the sheet is open

- Where: `src/features/combat/ui/bestiary.tsx`, the Filtros button inside `Popover.Target`.
  Mantine's `Popover.Target` clones the child with `aria-expanded: ctx.opened`, which overrides the
  button's own `aria-expanded={open}`. The Popover is `open && !sheet`, so whenever a Drawer is
  open the button says `aria-expanded="false"`.
- Measured: false with the side sheet open (all 8 cases) and with the phone bottom sheet open
  (390x844, es/dark and en/light 150%). Before `8d7ebab` the phone button was outside any Popover
  and reported `true`. The phone button also gains `aria-haspopup="dialog"`, which is accurate.
  With the dropdown open the state is right (`true`, and `aria-controls` points to an existing
  element), and after closing it is `false`.
- Impact: a screen reader that reaches the button behind the open sheet hears "collapsed". The
  trigger sits behind a modal with focus trapped, so exposure is small. Fix with
  `withRoles={false}` on the Popover (keeping the button's own `aria-expanded`), or by putting the
  button's ARIA after the target props.

#### Info

The side sheet has no sticky actions. With 150% text at 700-800 px height, "Ver N criaturas" is at
the bottom of the scrolling sheet (`r2-sidesheet-1440x800-es-dark-150.png`). Results apply live
and Escape, the X and the overlay all close the sheet, so this is acceptable. A sticky footer like
the dropdown's would be more consistent.

### Round 2 scenarios (real Chromium via Playwright, production build of `8d7ebab` on 127.0.0.1:4286, supabase mode with e2e fixtures)

- 20 combinations: 820x1180, 820x900, 1024x700, 1440x800 and 1440x1000, each in es/dark,
  en/light, es/dark 150% and en/light 150%. 12 opened the dropdown and 8 the side sheet (table
  above).
- Dropdown (12 cases): it fits the viewport, and the row matches the surface and spans the full
  width (F2). Both buttons are hit at their centre (F1), no horizontal overflow, and Tab forward
  never hides focus under the row (F4). The wheel over the dropdown leaves the page `scrollY`
  unchanged, and axe is clean. Escape closes it, focuses Filtros and sets `aria-expanded` to false.
  Pressing Enter on Filtros, picking Undead / Muerto viviente and pressing Enter on "Ver N" closes
  it: the count reads 19 and focus is on Filtros.
- Side sheet (8 cases): it opens on the right, 440 px at 100% and 660 px at 150%, full height,
  with title "Filtrar y ordenar" / "Filter and sort". Initial focus is on its close button
  ("Cancelar" / "Cancel"). Tab moves through both thumbs, all chips, sort and the actions; every
  focused control stays inside the sheet and in view. axe is clean on the whole page and on the
  sheet. Focus returns to Filtros after each of Escape, Enter on "Ver N", the X button and an
  overlay click.
- Phone 390x844 (touch, es/dark and en/light at 150%): bottom Drawer, full width (375 px CSS
  content), action row static and transparent as before, no popover in the DOM, axe clean. Escape
  closes it and focus returns to Filtros. The only change is the button ARIA (R2-3).
- Definition sheet: not touched by `8d7ebab` (the diff only changes the bestiary toolbar, its CSS
  and one e2e test), so the round 1 results stand. The glossary e2e passed again (below).
- Repository e2e: `CI=1 npx playwright test tests/e2e/bestiary.spec.ts tests/e2e/glossary.spec.ts`
  through a temporary config (identity-desktop, identity-tablet and identity-mobile projects,
  baseURL 127.0.0.1:4286, retries 0, 4 workers): 79 passed, 2 skipped. Both skips are on
  identity-mobile by design: "the filters dropdown fits a short screen…" and "with large text and
  little room, the filters open in a side sheet".

### Round 2 evidence (this folder)

- `r2-dropdown-1440x800-es-dark.png`, `r2-dropdown-1440x800-en-light.png`: F2 resolved (same
  surface, full width, top separator) with a chip scrolled under the row.
- `r2-sidesheet-1440x800-es-dark-150.png`: F3 resolved, the side sheet at 150% text.
- `r2-thumb-over-row-squeezed.png`: R2-1, synthetic squeeze showing the thumb above the row.

### Round 2 limitations

Same as round 1: no visible classic scrollbars in headless Chromium, simulated touch only, no
screen reader run, default class theme only. I did not re-run the definition sheet probes, because
`8d7ebab` does not touch those files; the glossary e2e was re-run.

## Round 3: commit `3f93fe4`

- Reviewed source: local commit `3f93fe4` on top of `8d7ebab`. Fingerprint, verified in a clean
  worktree at `3f93fe4`: `717b0bbe71c6a08a2d8e926684b4013572c10e1a84867fdca14903c9f7500d97`
- Date: 2026-11-04
- Change:
  - The Popover gets `withRoles={false}`.
  - The Filtros button sets its own `aria-haspopup="dialog"` and `aria-expanded={open}`.
  - `Popover.Dropdown` gets `role="dialog"` and keeps its `aria-label`.
  - The sticky row gets `z-index: 4`.
  - The dropdown gets `scroll-padding: 2rem 0 6rem`.
  - The e2e asserts `aria-expanded` and the dropdown's role.
- Build: production `vite build` of `3f93fe4`, supabase mode with the e2e fixtures, served on
  127.0.0.1:4287. Tested in real Chromium through Playwright.

### Verdict: PASS

### R2 findings, re-checked

- R2-1, resolved. In the synthetic squeeze (`.bst-filter-dropdown { max-height: 140 / 120 / 100 /
  90px !important }`, 1440x1000, es/dark), both thumbs overlap the row geometrically.
  `elementFromPoint` on an 8x6 px grid over the whole row (572 points) hits the row every time, so
  nothing in the slider paints above it. The screenshot shows the row with no thumb on "Ver 330
  criaturas" (`r3-thumb-under-row-squeezed.png`, compare `r2-thumb-over-row-squeezed.png`).
- R2-2, resolved. Computed `scroll-padding` is 32px at the top and 96px at the bottom. With
  Shift+Tab through all 24 stops, no focused chip's ring is clipped at the top edge, and none
  reaches under the row:
  - 820x900 at 100%: 0/24 clipped (was up to 28 px in round 2).
  - 820x1180 at 150%: 0/24.
  - 1440x800 at 100%, es/dark and en/light: 0 of 40 Shift+Tab presses each.

  Tab forward stays clear of the row (0 under). Screenshot `r3-shift-tab-top-1440x800-dark.png`:
  "Planta" is focused with its full ring after moving up.
- R2-3, resolved. On the Filtros button:

  | Surface | Before opening | While open | After closing |
  | --- | --- | --- | --- |
  | Dropdown (1440x800, es/dark and en/light) | `false` | `true` | `false` |
  | Side sheet (1024x700, es/dark and en/light) | — | `true` | `false` |
  | Phone bottom Drawer (390x844, es/dark and en/light 150%) | `false` | `true` | `false` |

  `aria-haspopup="dialog"` is set throughout, and `aria-controls` is now absent (no dangling
  reference).
  - The dropdown has `role="dialog"` and `aria-label` "Filtrar y ordenar" / "Filter and sort",
    and no `aria-labelledby`.
  - The Drawers keep Mantine's `role="dialog"`, `aria-modal="true"` and their title as
    `aria-labelledby`.
  - The button returns to `false` after Escape, after "Ver N", and after an outside click.

### Behaviour with roles off (dropdown)

- When the dropdown opens, focus moves inside it.
- Tab 40 times and Shift+Tab 40 times: focus never leaves the dropdown.
- Escape closes it, focus returns to Filtros, and `aria-expanded` goes to `false`.
- Pick Undead / Muerto viviente and press "Ver N": the dropdown closes and focus is on Filtros.
- An outside click closes it, and focus stays where the user clicked (`main`), which is expected
  for a non-modal popover.
- These hold in both themes and languages.

### axe (wcag2a, wcag2aa, wcag21aa)

Clean in every case:
- the dropdown alone and the whole page with it open (1440x800, es/dark and en/light);
- the side sheet alone and the whole page (1024x700, es/dark and en/light);
- the whole page with the phone Drawer open (390x844, es/dark and en/light 150%).

### Spot checks

- 100% dropdown, 1440x800: same surface on the row and the dropdown (dark `rgb(42, 31, 22)`,
  light `rgb(255, 255, 255)`), `z-index: 4`, bottom at 792 px inside the 800 px viewport.
- Side sheet, 1024x700 (the space below is under 16rem, so it opens the sheet):
  - opens by Enter, focus goes inside, and 30 Tabs never leave it;
  - Escape returns focus to Filtros;
  - light theme screenshot `r3-sidesheet-1024x700-light.png`.
- Phone Drawer: bottom sheet, 375 px wide, action row static and transparent, as before.

### Repository e2e

`CI=1 npx playwright test tests/e2e/bestiary.spec.ts tests/e2e/glossary.spec.ts` with a temporary
config (identity-desktop, identity-tablet and identity-mobile projects, baseURL 127.0.0.1:4287,
retries 0, 4 workers): 79 passed, 2 skipped. Both skips are on identity-mobile by design
(bestiary.spec.ts:108 and :134, "Phones use the filters drawer" / "Phones always use the bottom
sheet").

### Round 3 evidence (this folder)

- `r3-thumb-under-row-squeezed.png`: R2-1, the row paints over the thumbs.
- `r3-shift-tab-top-1440x800-dark.png`: R2-2, a chip focused while moving up shows its full ring.
- `r3-sidesheet-1024x700-light.png`: the side sheet in the light theme, en.

### Round 3 limitations

- The 100% dropdown cases were spot-checked only at 1440x800. The geometry of 820x1180, 820x900
  and 1440x1000 is unchanged from round 2, because `3f93fe4` only changes the z-index,
  scroll-padding and ARIA.
- No screen reader run, so the `aria-expanded` changes are verified from the DOM only.
- Simulated touch only, and the default class theme only.
- The definition sheet was not re-probed (untouched since round 1); the glossary e2e passed.
