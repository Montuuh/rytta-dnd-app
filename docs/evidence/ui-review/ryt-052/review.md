# RYT-052 independent ui-ux review

- Reviewer: `ui-ux` (independent subagent applying `.codex/agents/ui-ux.toml`)
- Date: 2026-11-04
- Source fingerprint (`node scripts/check-ui-review.mjs --fingerprint`):
  `35c01d87dd061c8cd3bdbea7e2c7250ce8588815e576bae36bcc2f386944523c`
- Scope: RYT-052 changes on top of the uncommitted RYT-051 (RYT-051 has its own PASS; only the
  RYT-052 delta was judged, but pre-existing issues seen along the way are listed as notes)

## Verdict: CHANGES_REQUIRED

Two of the new sticky surfaces cover keyboard focus completely (WCAG 2.2 SC 2.4.11 Focus Not
Obscured (Minimum), AA). The project already handles the same problem for the bottom nav
(`src/app/styles.css:1950-1953`, `scroll-padding-bottom`) and for the desktop filters popover
(`src/features/combat/ui/bestiary.css:125-131`, `scroll-padding: 2rem 0 6rem`). The two new sticky
elements in RYT-052 have no matching scroll padding. Everything else in the delta works as
described.

## Findings

### F1 - Major: the sticky search row covers focused list rows when tabbing backwards

- Path: `src/features/combat/ui/bestiary.css:37-44` (`.bst:not([data-split]) > .bst-toolbar-search`,
  `position: sticky; top: 0`). Nothing reserves its height in the scrollport.
- Viewport/theme/language: 390x844 dark ES (measured). The rule is the same at 820 tablet. At 150%
  text the row is 159px tall, so more is covered.
- Repro: open the bestiary, focus the search, press Tab about 40 times into the list, then press
  Shift+Tab. Chrome scrolls the previous element only until it reaches the viewport top, which is
  under the sticky row.
- Measured (search row bottom = 89px): 7 of 30 Shift+Tab steps were obscured. The bookmark buttons
  ("Añadir Árbol despertado a favoritas", "Añadir Aparición…", "Añadir Alfombra asfixiante
  animada…", "Añadir Águila…") had 0px of 44px visible, so they were fully hidden. Row buttons
  showed only 14-57px of 102-145px. Tabbing forward is fine.
- Impact: keyboard and switch users lose the focus indicator in the main list. This fails SC 2.4.11
  (AA) in a fully hidden way.
- Suggested fix: when the row is sticky, add scroll padding for its height to the page scroller
  (`html:has(.bst:not([data-split]) > .bst-toolbar-search) { scroll-padding-top: … }`, measured or
  as a CSS variable), or give `.bst-row` a `scroll-margin-top` for it. Re-check at 150% text.
- Evidence: `probe-focus-back.png` (the focus ring of the focused row shows just under the search
  row at the top).

### F2 - Major: the filters sheet's sticky footer covers the focused size tiles

- Path: `src/features/combat/ui/bestiary.css:149-158` (`.bst-filter-sheet .bst-filter-actions`,
  `position: sticky; bottom: 0`). The drawer scroll container has no `scroll-padding-bottom`. The
  desktop popover has one at lines 125-131.
- Viewport/theme/language: 390x844 dark ES (phone drawer).
- Repro: open Filtros, press Tab through the slider, CR bands and type tiles into "Tamaño". The
  native inputs are 1px. Chrome treats a 1px input just above the bottom edge as already visible and
  does not scroll, so the painted 78px tiles sit under "Quitar filtros / Ver N criaturas".
- Measured: focus on Diminuto, Pequeño and Mediano with 0px of the 78px tile visible
  (tile top 12px below the footer top).
- Impact: SC 2.4.11 failure in the new sheet footer. A keyboard user picks sizes without seeing
  them.
- Suggested fix: give the drawer's scroll container a `scroll-padding-bottom` of at least the footer
  height plus the focus ring, as the popover already does. Also consider a `scroll-margin` on the
  tile labels so scrolling follows the painted tile, not the 1px input.
- Evidence: `probe-filter-partial-21.png`, `-22.png`, `-23.png`.

### F3 - Minor: the "hidden" success fact is plural and feminine even for one creature

- Path: `src/shared/i18n/bestiary-es.ts:72` (`'bestiary.add.doneHidden'`: "Ocultas para los
  jugadores hasta que las reveles."). This is not pluralised. EN line 72 also capitalises "Players".
- Repro: Add 1 × Dragón rojo joven with "Añadir oculta" on. The success state says "Ocultas … las
  reveles" for a single creature.
- Impact: a number mismatch in the line that confirms visibility. It also goes against the delivery's
  own note about avoiding gendered participles in notices. A `_one/_other` split, or wording like
  "Los jugadores no la verán hasta que la reveles" / "…no las verán…", fixes it.

### F4 - Minor: at 390px with 150% text the detail action bar wraps "⋮" onto its own third row

- Path: `src/features/combat/ui/bestiary.css` (`.bst-actions-secondary`, `flex-wrap: nowrap` changed
  to `wrap` in this delivery).
- Viewport: 390 dark ES at 150% text, SRD detail sheet.
- Result: "Añadir a un encuentro" (2 lines), then "Personalizar" and the bookmark, then "⋮" alone.
  The sticky actions take about 240px of the 844px sheet, which leaves about 200px for the stat
  block. It is readable and every target is 44px, but the orphaned overflow button looks broken.
  Keeping the bookmark and "⋮" together (e.g. nowrap on the icon pair) would avoid it.
- Evidence: `m390-dark-es-150-4-detail.png`.

### Notes (not counted for this verdict)

- Pre-existing from RYT-051 (NumberDial), visible in the Add dialog: at 150% text the 44px (2.75rem)
  steppers render 66x66 inside a 54px dial. The disabled "−" fill sticks 6px above and below the dial
  frame (`zoom-dial-150.png`, measured `Restar a Cuántas` 66x66 at top 261 vs dial top 267). This
  is cosmetic and was not raised in the RYT-051 review.
- Pre-existing: the source SegmentedControl (All/SRD/Campaign/Favourites) has controls wider than
  the viewport at 390 EN 150%. It was not changed in RYT-052, and the document does not scroll
  sideways.
- The ES summary uses feminine "oculta" (agreeing with "criatura"). This is acceptable.

## What works (browser-verified)

- Sticky search: sticks at top 0 on 390 and 820. The app header scrolls away and the row never
  overlaps it. At 390 the bottom nav (779-844) and the row (0-89, or 0-159 at 150%) do not overlap.
  On 1024/1440 split layouts it is not sticky (`data-split`). The search clear button measures
  44x44.
- Filters drawer: app-token surfaces in both themes. The footer stays at the bottom (776-843 of
  844) with Clear and "Ver N criaturas". Range thumbs are 28px visually, with a 44px `::after` hit
  area.
- Add dialog disclosure: a native `<button>` with `aria-expanded` false/true and an `aria-controls`
  id that exists. While collapsed the region is `display:none` with `inert` and `aria-hidden`, so
  Tab goes from the toggle to Cancelar. Enter and Space both toggle. Tab after expanding reaches
  the alias field. The summary updates live ("Enemigo · visible · nombre real", then
  "Enemigo · oculta · Dragón A"). The switch state renders correctly (accent track, thumb moved).
- Autofocus lands on the count dial input. The submit reads "Añadir a Cripta" (1) or
  "Añadir N a Cripta".
- Success state: the title "En el encuentro" labels the dialog. It shows a token stack, "En Cripta:
  Dragón rojo joven.", "PG fijos: 178." and the hidden fact. Focus moves to the primary "Abrir el
  encuentro" link, Tab reaches the close button, and Escape closes and returns focus to "Añadir a un
  encuentro" in the sheet. EN reads "Added to Crypt…" / "Open the encounter".
- Glyph tokens: the creature-type glyph inside the hexagon is legible in dark and light at 390, 820
  and 1024. The SRD detail token shows the glyph.
- SRD "⋮" menu shows only "Copiar como texto" (Duplicate removed). Personalizar opens the editor
  titled "Nueva criatura · basada en Dragón rojo joven". The quick creature title copy and "Borrar"
  copy were checked by inspection only.
- Stat block core numbers wrap to 2 columns at 390 with 150% text.
- The ES errata "las t iradas" has 0 occurrences in `es.json`, and `TEXT_ERRATA` is present in the
  build script.
- axe (wcag2a/2aa/21aa/22aa): 0 violations on the list, filters, add dialog and success state for
  every variant run.
- Document overflow: none (`scrollWidth <= clientWidth`) on all variants, including 390 at 150% ES
  and EN.

## Tested scenarios

Browser (Playwright Chromium against the production build at `/rytta-dnd-app/`, port 4175, with the
fixture combat server and the "Cripta" encounter, reduced motion):

- Full flow (list, scroll, filters, detail, add, table options, submit, success) with axe and
  overflow checks for: 820x1180 dark ES, 820x1180 light EN, 1024x768 light ES, 390x844 light ES,
  390x844 dark EN at 150%, 390x844 dark ES at 150%.
- Keyboard probes at 390 dark ES: Tab and Shift+Tab focus-obscured measurement in the list, the Add
  dialog disclosure (Enter/Space/Tab), success focus, Tab and Escape, filters-sheet Tab sequence
  against the footer, drawer target sizes, search clear size.
- SRD overflow menu contents and the Customise editor title (390 dark ES).

Inspection only (code and diff): the Duplicate path for campaign creatures, delete-confirmation
copy, quick dialog title, new-creature archetype seal icon, CR band stripe removal and type-tile seal
ring, editor entry-tools wrap, `useDeferredValue` filtering.

## Untested states

- Real touch devices and iOS Safari (sticky and `env(safe-area-inset-bottom)` behaviour). Firefox
  and WebKit.
- Screen reader output (NVDA/VoiceOver) for the disclosure and the success `role="status"`.
- Roll-HP success text, counts above 5 (the "+N" stack) in the success state, encounter creation
  from the dialog (no open encounters), loading and error states of the encounter query.
- Campaign (homebrew) creature Duplicate and Delete flows in the browser. Light theme at 150%.
- 1440 desktop and 390 dark ES at 100% for the delta. The implementer's captures in
  `docs/evidence/RYT-052/` were viewed but not re-run.

## Evidence

Reviewer captures (scratch, not committed):
`C:/Users/dmont/AppData/Local/Temp/claude/0f049fd8c6ab0dac/edcb4093-8367-4eb9-933f-f629280bcdef/scratchpad/rev52/`

- `probe-focus-back.png` (F1), `probe-filter-partial-21.png`, `-22.png`, `-23.png`,
  `probe-filters-tabbed.png` (F2)
- `probe-options-filled.png`, `probe-done-hidden.png` (disclosure and success with hidden)
- `m390-dark-es-150-4-detail.png` (F4), `zoom-dial-150.png` (pre-existing dial note)
- `{t820-dark-es,t820-light-en,d1024-light-es,m390-light-es,m390-dark-en-150,m390-dark-es-150}-{1-list,2-scrolled,3-filters,4-detail,5-add,6-add-options,7-done}.png`

Implementer captures: `docs/evidence/RYT-052/` (desktop/mobile 1-6).

The temporary `tests/e2e/_shots/rev52*.shots.ts` harness files were deleted after the run.
Implementation code was not modified.

## Re-review request

After fixing F1 and F2 (F3 and F4 are recommended), re-run a Shift+Tab sweep through the phone and
tablet list and a Tab sweep through the filters sheet (including 150% text). Then ask for a focused
re-review against the new fingerprint.

---

## Round 2 (focused re-review)

- Date: 2026-11-04
- Source fingerprint: `aff4410accf7d872f7990941ad3b4fd93c68cee92402e83382f1a9041e074bc9`

### Verdict: CHANGES_REQUIRED

F1, F2 and F3 are resolved. The F4 fix keeps "⋮" on the row, but it now clips the "Personalizar"
label mid-word at 150% text.

### Round 1 findings

- **F1: resolved.** `bestiary.css:46-50` adds `html:has(.bst:not([data-split])) { scroll-padding-top: 7.5rem }`.
  - Sweep: Tab 40 times, then Shift+Tab 30 times, measuring each focused element against the sticky
    row's bottom edge.
  - Results, with search row bottoms of 89, 159, 89 and 107px: 0 obscured at 390 100%, 390 150%,
    820 100% and 820 150%.
  - At 1440 the split layout keeps the row `static`, and `html` computes `scroll-padding-top: auto`,
    so the rule does not leak to desktop.
- **F2: resolved.** The drawer content has `scroll-padding-block: 2rem 6.5rem`, and the tile inputs
  now cover the whole tile.
  - A 60-step Tab sweep through the filters sheet at 390 (100% and 150%) reached all 6 size tiles.
  - 0 tiles were obscured by the sticky footer or the drawer header (`r2-f2-w390-150-size.png`:
    Mediano fully visible with its ring above the footer).
  - Clicking a tile still toggles it (pointer-events pass through to the label). axe reports 0
    violations in the sheet at both sizes.
- **F3: resolved.** For 2 hidden creatures the success state reads "En Cripta: 2 × Dragón rojo joven.
  | PG fijos: 178 cada una. | Fuera de la vista de los jugadores hasta que se revelen." `_one` and
  `_other` exist in ES and EN, and EN uses lowercase "players". The count is passed
  (`add-to-encounter.tsx:176`).
- **F4: partly resolved, and the fix causes a regression (R2-1).** "⋮" stays on the row: the
  secondary row is one line, Personalizar (185x47) plus the bookmark and "⋮" (66x66 each), and the
  action bar is 171px tall instead of about 240px.

### R2-1 - Major: the "Personalizar" label is clipped at 150% text

- Path: `src/features/combat/ui/bestiary.css:449-454`
  (`.bst-actions-secondary > .mantine-Button-root { min-width: 0 }`) together with Mantine's
  `.mantine-Button-label { overflow: hidden }`.
- Viewport/theme/language: 390x844, dark ES, 150% text, SRD detail sheet (Dragón rojo joven). Fine at
  100%: the label measures 88/88.
- Repro: open any SRD creature on a phone with 150% text. The sticky bar shows "Personali".
- Measured: `.mantine-Button-label` has scrollWidth 131 and clientWidth 97 with `overflow: hidden`. A
  single word cannot wrap, so `min-width: 0` truncates it instead of wrapping as intended. No ellipsis
  is shown.
- Impact: the one copy path for SRD creatures shows a cut word. Text at 150% loses content, which
  fails the intent of SC 1.4.4 Resize Text (AA, which allows up to 200%). The accessible name is
  still complete.
- Suggested directions (any one):
  - Keep the label's intrinsic width (`min-width: max-content` on the label only) and let the icon
    pair, kept together, wrap beneath it.
  - Hide the leading wand icon and tighten the padding in narrow containers.
  - Move the bookmark into the "⋮" menu on phones.
  - Then re-check 390 at 100% and 150%, in ES and EN ("Customise").
- Evidence: `r2-f4-actions-150.png`, `r2-f4-sheet-150.png`.

### Round 2 tested scenarios (browser, Playwright Chromium, production build on port 4175)

- F1: 390x844 and 820x1180, each at 100% and 150%, dark ES.
- F2: 390x844 at 100% and 150%, dark ES. Tab sweep, tile click toggle, axe.
- F3/F4: 390x844 dark ES at 150%. Detail action bar geometry and label measurement (also at 100%).
  Add 2 hidden creatures, then the success text.
- 1440 sanity (dark ES): split layout with a non-sticky search, detail pane, filters popover, Add
  dialog with Table options open. axe reports 0 violations on the filters and add screens.

### Round 2 untested

Light theme and English for the Round 2 fixes, 820 filters (it uses the popover, not the drawer),
real touch devices, Safari, Firefox, screen readers. Everything else listed as untested in Round 1
is still untested.

### Round 2 evidence

Scratch, not committed: `C:/Users/dmont/AppData/Local/Temp/claude/0f049fd8c6ab0dac/edcb4093-8367-4eb9-933f-f629280bcdef/scratchpad/rev52/`

- `r2-f1-{w390,w390-150,w820,w820-150}.png`
- `r2-f2-{w390,w390-150}-size.png`
- `r2-f3-done.png`
- `r2-f4-sheet-150.png`, `r2-f4-actions-{100,150}.png`
- `r2-1440-{detail,filters,add}.png`

The temporary `tests/e2e/_shots/rev52r2.shots.ts` and `rev52r3.shots.ts` were deleted. Implementation
code was not modified.

---

## Round 3 (focused re-review of R2-1)

- Date: 2026-11-04
- Source fingerprint: `ce1b3e9b82244df5479a9a04dddb6593f30401c05110d3fa0bf24b4b80395ad7`

### Verdict: PASS

R2-1 is resolved, and F1, F2 and F3 still hold. No blocking findings remain.

### R2-1: resolved

The bookmark and "⋮" now sit together in `.bst-actions-icons` (`bestiary.tsx:1176`,
`bestiary.css:856-861`). `.bst-actions-secondary` wraps, and the text button keeps
`min-width: max-content; max-width: 100%` (`bestiary.css:440-465`).

Measured on the SRD sheet (Dragón rojo joven / Young Red Dragon), dark theme:

| Viewport | Text | Lang | Label | Label clip | Icons | Bar height | Bar/sheet/doc overflow |
|---|---|---|---|---|---|---|---|
| 390 | 100% | ES | Personalizar | 0 | same row, 44x44 | 117px | 0/0/none |
| 390 | 150% | ES | Personalizar | 0 | own row, 66x66 | 221px | 0/0/none |
| 390 | 100% | EN | Customise | 0 | same row, 44x44 | 117px | 0/0/none |
| 390 | 150% | EN | Customise | 0 | own row, 66x66 | 193px | 0/0/none |
| 820 | 100% | ES | Personalizar | 0 | same row | 117px | 0/0/none |
| 820 | 150% | EN | Customise | 0 | same row | 142px | 0/0/none |
| 1440 (pinned) | 100% | ES | Personalizar | 0 | same row | 69px | 0/0/none |

- The whole word shows in every case (`r3-bar-*.png`). At 150% the icon pair drops together onto
  its own line, left-aligned, so "⋮" is never left alone.
- Tab order through the bar follows the visual order in every variant: Add, Personalizar/Customise,
  bookmark, then "⋮".
- axe (wcag2a/2aa/21aa/22aa) reports 0 violations on each detail sheet variant.
- Observation, not blocking: at 390 with 150% text the sticky bar takes 221 of 844px (26%). This is
  the cost of large text plus 66px targets and is less than in Round 1 (about 240px). The stat
  block keeps scrolling above it.

### Regression checks

- F1: 30 Shift+Tab steps with 0 obscured at 390 150% ES and at 820 100% ES.
- F2: a 60-step Tab sweep through the filters sheet at 390 150% ES, with 12 focus steps landing on
  size tiles and 0 obscured.
- F3: 1 hidden creature gives "Fuera de la vista de los jugadores hasta que se revele." (singular).
  Round 2 already checked the plural.

### Round 3 tested scenarios

Browser (Playwright Chromium, production build on port 4175, fixture server): the table above, plus
the F1/F2/F3 checks. Inspection: the CSS and TSX diff for `.bst-actions-icons` and
`.bst-actions-secondary`.

### Round 3 untested

Light theme for the action bar. Campaign (homebrew) creatures, where the button reads "Editar" and
the menu has Duplicate. Real touch devices, Safari, Firefox and screen readers. Everything listed as
untested in earlier rounds is still untested.

### Round 3 evidence

Scratch, not committed: `C:/Users/dmont/AppData/Local/Temp/claude/0f049fd8c6ab0dac/edcb4093-8367-4eb9-933f-f629280bcdef/scratchpad/rev52/`

- `r3-bar-{w390-100-es,w390-150-es,w390-100-en,w390-150-en,w820-100-es,w820-150-en,w1440-100-es}.png`
- `r3-sheet-*.png` (same variants)

The temporary `tests/e2e/_shots/rev52r3.shots.ts` was deleted. Implementation code was not modified.
