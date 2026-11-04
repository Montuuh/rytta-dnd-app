# ui-ux review: RYT-051 bestiary instruments

- Reviewer: `ui-ux` (independent subagent applying `.codex/agents/ui-ux.toml`)
- Date: 2026-11-04
- Source snapshot: uncommitted working tree on `main` (base `bdb1484`)
- Reviewed fingerprint (`node scripts/check-ui-review.mjs --fingerprint`):
  `284ce04d8a4cadd7161d7857b54d62a54129c6da5f9f2380f40084aee2a54eee` (same value before and after review)

## Verdict: CHANGES_REQUIRED

Most of the delivery works. The instruments are native radios, checkboxes, ARIA spin buttons and
buttons. Keyboard, focus rings, Escape and focus return behave correctly. All measured targets are at
least 44px, and text contrast passes in both themes. Two Major layout defects remain. They break
words in half in core controls at supported viewports (390px phone, 1024px desktop and 820px tablet
at 150% text), in both languages.

## Findings

### F1 — Major: the Side toggle in the editor splits "Enemigo"/"Enemy"/"Aliado" mid-word
- Path: `src/features/combat/ui/bestiary-widgets.css:162-178` (`.bst-side` grid with
  `.bst-side-name { overflow-wrap: anywhere }`), placed in `.bst-grid-wide` next to the CR dial at
  `src/features/combat/ui/creature-editor.tsx:219-235` (`bestiary-widgets.css:408-410`).
- Viewport/theme/language: 1024×768 dark ES ("Ene / mig / o", "Alia / do"), 1024×768 dark EN
  ("Ene / my"), 820px dark ES at 150% text ("Enemi / go"). Correct at 1440px and 390px.
- Repro: open Lobo, then Personalizar. In Identidad, look at Bando beside VD. Or create from
  Arquetipo, then Crear borrador.
- Impact: the most important label in the control (which side the creature joins) becomes hard to
  read, and the tile grows to three lines. The editor's two-column layout (form and live preview)
  leaves about 200px for the 2-up side grid, minus a 36px token and padding. Fix: let the side
  toggle span the full row (`grid-column: 1 / -1`) in the editor, or stack token over name when narrow
  (a container query). Do not break the word with `overflow-wrap: anywhere`.

### F2 — Major: Size scale labels are hyphenated or split mid-word on phones
- Path: `src/features/combat/ui/bestiary-widgets.css:122-160` (6-column
  `repeat(auto-fit, minmax(min(100%, 3rem), 1fr))`, and `.bst-size-name` with
  `overflow-wrap: anywhere; hyphens: auto`).
- Viewport/theme/language: 390px ES dark and light: "Dimi-nuto", "Pe-queño", "Me-diano",
  "Gar-gan-tuesco". 390px EN: "Mediu m" and "Gargant uan", split with no hyphen. At 390px with
  150% text it wraps to 4+2 and is still hyphenated. Fine at 820px and wider.
- Repro: at 390px, open Filtros and scroll to Tamaño. The same SizeScale appears in Arquetipo
  y VD and in the editor's Identidad.
- Impact: phones are the primary target. Size names become hard to read, and labels of 1–3 lines
  push the bases to different heights. That breaks the "one baseline" metaphor in ADR 029. Fix: use 3
  columns (2 rows) below about 480px, or shorten labels to an abbreviation (Dim./T, Peq./S, Med./M,
  Gra./L, Eno./H, Garg./G) with the full name kept as the accessible name. Remove
  `overflow-wrap: anywhere` from the labels.

### F3 — Minor: the tile check seal overflows the dialog body at 390px with 150% text
- Path: `src/features/combat/ui/bestiary-widgets.css:60-71` (`.bst-tile-seal { top:-6px;
  right:-6px }`).
- 390px, 150% text, ES/EN, both themes. The Add-to-encounter sheet body measures
  `scrollWidth 383` against `clientWidth 373`, a 10px horizontal scroll. The causes are the
  seals of the right-hand HP and Side tiles (right edge 355 against a content limit of 350).
- Impact: a small sideways wobble inside the sheet. Fix: give tile grids `padding-inline-end: 6px`
  or `padding-top: 6px`, or place the seal inside the tile (`top:4px; right:4px`).

### F4 — Minor: Georgia old-style figures make dial values read as letters
- Path: `src/features/combat/ui/bestiary-widgets.css:226-233` and `261-271` (dial input and CR
  value in `Georgia, Cambria, serif`, `font-variant-numeric: tabular-nums`).
- All viewports and themes. "0" renders at x-height like the letter "o", "12" sits at x-height and
  "7"/"9" drop below the line (zoomed capture of the Quick creature dials).
- Impact: in editable numeric fields at arm's length, 0 and o look alike. Fix: add `lining-nums`.
  Where the installed Georgia lacks it, use the UI face for editable values and keep the serif for
  the read-only stat block.

### F5 — Minor: some selected states still rely mostly on tint and border weight
- Paths: die-face tiles `creature-editor.tsx` (`TileGroup ... seal={false}`, `bst-dice`) and CR
  bands `bestiary-widgets.css:370-375`.
- Both themes. Selected d8 or a pressed band differs from its neighbours only by a 1px→2px accent
  ring and a tint. In light theme the tinted d8 is close to its neighbours. Tiles elsewhere add the
  check seal.
- Impact: ADR 029 says "never colour alone". The border change is a weak non-colour cue. Fix: keep
  the seal on dice and bands, or add a check glyph or an underline bar.

### F6 — Minor (copy): Spanish CR band names mix gender and number
- Path: `src/shared/i18n/bestiary-es.ts` (`bestiary.tier.*`): "Esbirros", "Bajo", "Medio", "Alto",
  "Épicas".
- Impact: they read inconsistently as a set. Suggestion: "Esbirros / Bajos / Medios / Altos /
  Épicos" (agreeing with *desafíos* or *VD*), or "Nivel bajo / medio / alto / épico". The English set is fine.

### Observations (not blocking, not introduced here)
- At 390px with 150% text, the editor body overflows by 6px because of a Mantine `Group`
  holding a `Select` and the `.bst-editor-footer`. Neither is in this diff, so they are likely
  pre-existing. Track them separately.
- At 390px the Add-to-encounter token stack moves from beside the count dial (count 1) to its own
  row (count ≥2), so the content below shifts once as the DM taps +. This is acceptable.
- On phones the 5 CR bands wrap 4+1, leaving "Épicas"/"Epic" alone on a second row. Consider a
  `repeat(5, 1fr)` row when it fits, or 3+2.

## Tested scenarios

Browser testing used a Playwright scratch harness (`tests/e2e/_shots/shots.config.ts`: production
subpath build on 127.0.0.1:4175 with fixtures, reduced motion). My temporary `review*.shots.ts`
files were deleted afterwards.

Browser (real rendering, scripted interaction and measurement):
- Filters (popover on 820/1440/1024, sheet on 390): type tiles, size scale and sort cards. A CR
  band tap sets `aria-pressed=true` and the slider range; a second tap returns `false`. Covered at
  390/820/1440 × dark ES, light ES, dark EN, dark ES 150%, light EN 150%, plus 1024 dark ES.
- Add to encounter (Dragón rojo joven): count dial, token stack at 1 and 7 ("+2"), HP choice cards
  (range 102–255 is correct for 17d10+85), side toggle enemy→ally. Same matrix.
- Quick creature: side toggle, HP/AC/initiative/legendary dials. Same matrix.
- Archetype y VD: CR dial, size scale, type tiles, then Crear borrador into the editor: size/type/CR
  side, AC, hit dice and initiative dials, die-face tiles, ability dials, saving-throw seal. Same
  matrix, plus 1024 ES and EN (Lobo, Personalizar).
- Keyboard (390/820/1440, dark ES):
  - Space toggles a type checkbox, Tab moves to the next tile, Enter toggles a band.
  - ArrowRight moves the sort radio and the size radio; ArrowDown moves the HP radio.
  - CR spin button: ArrowUp, PageUp (+4), End (30), ArrowRight stays at 30, Home (0); ArrowDown,
    PageDown and ArrowLeft clamp at 0.
  - Count dial: Enter and Space on "Sumar a Cuántas" step +1 each. A 700ms hold steps +5. Typing 45
    clamps to 20 on blur, and + is then disabled.
  - Initial focus is on Cuántas.
  - Escape closes Filters (focus returns to the Filtros button) and the archetype dialog (no dialogs
    left). In the editor, Escape returns focus to Personalizar.
  - The archetype dialog's Tab order follows the visual order and focus stays trapped. A disabled
    stepper is skipped.
  - Seal checkbox: click toggles false→true, Space toggles back, and the 3px focus ring is visible.
  - Die tiles: ArrowRight from d6 selects d8. Focus rings are visible on tiles, bands, spin button
    and steppers.
- Touch targets: every visible `.bst-tile`, `.bst-tier`, `.bst-dial-step`, `.bst-seal` and ability
  input is ≥44×44 in all 15 combinations (27 in Filters, 6 in Add, 38 in the editor).
- Contrast (computed text or glyph colour against the composited background), lowest values:
  - Dark: 6.23 for text (tier range and choice help), 5.95 for glyphs and seal checks.
  - Light: 4.82 for text, 6.33 for glyphs.
  - Editor seal and ability text: 9.08 in dark, 7.65 in light.
  - All pass AA.
- Horizontal overflow: checked in every dialog, sheet and popover body (F3 and the observation
  above are the only cases).
- 1024×768: filters, detail, editor (F1).

Screenshot inspection (captures from the runs above): every scenario listed was viewed, with zoomed
crops for F2 and F4. I also inspected the delivery's own evidence in `docs/evidence/RYT-051/`.

Code inspection: `bestiary-widgets.tsx/.css`, the diffs of `bestiary.tsx`, `add-to-encounter.tsx`,
`new-creature.tsx`, `creature-editor.tsx`, `stat-block.tsx`, CSS, the i18n ES/EN keys, the new e2e
test, ADR 029 and the design-system paragraph.

## Untested states

- Real touch devices and screen readers (NVDA/VoiceOver announcement of the CR spin button
  `aria-valuetext` and of the seal name). Only the accessibility tree and attributes were checked.
- Long-press with real touch (`pointerdown` hold), contextmenu suppression on iOS, and hold on the
  CR dial's steppers (code steps 4).
- The disabled "Tirar" card when a creature has no hit dice, and a homebrew creature with an image
  in the token stack.
- Forced colours / Windows High Contrast. The tiles hide native inputs, so the checked state in
  forced colours is unverified.
- axe was not re-run by me. The delivery's e2e runs axe on Filters, Archetype and Editor.
- Hosted Supabase. All checks used browser fixtures.

## Evidence

The screenshots are in the reviewer's session scratchpad. That folder is temporary and was not
copied into the repo, because this review may only write this file:
`C:\Users\dmont\AppData\Local\Temp\claude\0f049fd8c6ab0dac\edcb4093-8367-4eb9-933f-f629280bcdef\scratchpad\shots\`

- F1: `1024-editor-cr.png`, `r2-1024-en-side.png`, `tablet-dark-es-150-editor-cr-side.png`
- F2: `mobile-dark-es-filters-selected.png`, `mobile-dark-en-filters-selected.png`,
  `mobile-dark-es-150-filters-selected-size.png`, `../zoom-size.png`
- F4: `../zoom-quick.png` (from `mobile-dark-es-quick.png`)
- F5: `tablet-light-es-editor-abilities.png`, `desktop-dark-es-filters-selected.png`
- Keyboard focus: `*-kbd-*.png`, `r2-seal-focus.png`, `r2-dice-focus.png`
- Delivery evidence: `docs/evidence/RYT-051/*.png`

## Re-review scope

After F1 and F2 are fixed (F3–F6 recommended), re-check:
- the editor Side/CR row at 1024 ES/EN and at 820px with 150% text;
- the Size scale at 390px ES/EN, at 100% and 150% text, in Filters, Archetype and the editor;
- body overflow of the Add sheet at 390px with 150% text.

---

# Round 2 (focused re-review)

- Date: 2026-11-04
- Reviewed fingerprint: `5c2cb7d976b8e9cd2982a2c1d1532362cfd5543885ecdbfa3f24c7923d919ef5` (same value
  before and after this round)
- Scope: the fixes for F1–F6, as the coordinator requested. The Round 1 findings above are kept unchanged.

## Verdict: CHANGES_REQUIRED

F1, F2 and F4 are fixed. F3 is fixed for the tiles. F5 and F6 are addressed. One new Major
regression came in with the F6 copy change: the "Intermedias" band label is clipped. Two Minor issues
remain.

## Status of Round 1 findings

| # | Status | Browser evidence |
|---|---|---|
| F1 | **Fixed** | 1024 ES/EN and 820px at 150% ES/EN: CR dial and Side are stacked full-width, and "Enemigo"/"Aliado"/"Enemy"/"Ally" sit on one line. |
| F2 | **Fixed** | 390px ES/EN at 100%: 3 columns, one-line names, bases on one baseline per row. 390px at 150%: 2 columns. 820px at 150%: 3 columns. 1024px Archetype and 1440px editor: 6 columns. No size name wraps or clips anywhere. |
| F3 | **Fixed (tiles)** | The seal sits inside the tile. The Add dialog body no longer overflows at 390px with 150% text (`scrollWidth = clientWidth = 373`). Correction to Round 1: the 383/373 sideways scroll comes from the stat-block sheet *behind* the dialog (`.bst-sheet-body`). Its sticky `.bst-actions` row pushes the last ActionIcon to x=384 in ES only. That row is not changed by this delivery apart from the Star→Bookmark swap, which is the same size. See O1. |
| F4 | **Fixed** | Dials, CR value, ability modifiers and dice show lining figures ("0", "12", "VD 2"). |
| F5 | **Fixed** | The chosen die shows the seal and an underline. A pressed band shows a check glyph (`aria-hidden="true"`; accessible name stays "Épicas 17–30"). |
| F6 | **Fixed (copy)**, but see R2-1 | ES: Débiles / Menores / Intermedias / Mayores / Épicas. EN: Weakest / Lesser / Middling / Greater / Epic. |

## New findings

### R2-1 — Major: the "Intermedias" band label is clipped
- Path: `src/shared/i18n/bestiary-es.ts` (`bestiary.tier.mid`) combined with
  `src/features/combat/ui/bestiary-widgets.css:345-349` (`.bst-tiers` grid, `minmax(min(100%, 4.5rem), 1fr)`)
  and `401-408` (`.bst-tier-name`).
- Viewports (ES): the Filters popover at 1440 and 1024, and 820px at 150%, render it as
  "Intermedi…", cut off at the tile edge. At 390px the label also runs past its band.
  The pressed "✓ Épicas" touches the right edge at 1440. EN labels fit.
- Repro: open Filtros and look at the bands under the CR slider.
- Impact: a primary filter label cannot be read. Fix: use a shorter word ("Medias"), or let the bands
  wrap 3+2 or use `minmax(5.5rem, 1fr)`, or allow the name to wrap at a space. Re-check the
  pressed state with its check glyph.

### R2-2 — Minor: type names now hyphenate in compact grids
- Path: `bestiary-widgets.css:86-115`. The `.bst-type` right padding is now 24px for the seal.
- Viewports: in the 1024 editor (ES), "Aberra-ción", "Huma-noide" and "Monstruo-sidad" each take
  two lines. At 390px in Filters, "Monstruosi-dad" does the same (it fit on one line in Round 1). In the
  1024/1440 EN Archetype, "Monstrosity" is clipped by about 1px under the seal.
- Impact: still legible, but it is the same pattern F2 removed from sizes. Suggestion: reserve
  the seal space only when the tile is checked, place the seal over the glyph medallion's corner,
  or use a minimum of `9.5rem` for the compact editor grid.

### R2-3 — Minor: die faces overflow at 390px with 150% text
- Path: `bestiary-widgets.css:88-105` (`repeat(auto-fit, minmax(44px, 1fr))` and `.bst-die` padding).
- 390px at 150%, ES and EN, both themes: "d10", "d12" and "d20" extend past their 44px tiles, and the
  d8 seal covers part of the glyph. This adds to the editor body's 6px sideways overflow
  (379/373), on top of the Round 1 Group/Select and footer observation.
- Fix: use `minmax(3.25rem, 1fr)` so faces wrap to two rows of three at large text.

### Observations
- O1 (not in this delivery's widgets): at 390px with 150% text in ES, the stat-block sheet's sticky
  action row (`.bst-actions`) is 10px wider than the sheet body, so the sheet behind the dialogs
  scrolls sideways. Track it with the Round 1 editor-footer observation.
- The archetype cards still draw their seal at `top:-6px; right:-6px` (`bestiary.css`), unlike the
  tiles, which now place it inside. It caused no overflow in any viewport tested, so it is only a
  visual inconsistency.

## Tested in Round 2

Browser testing used a scratch file, `tests/e2e/_shots/r2.shots.ts`. It type-checked with
`npx tsc -b` (exit 0) and was deleted afterwards.
- Filters (size scale, a type, the Épicas band), Archetype y VD (size and type), the editor
  (size, type, the CR/Side stack, dice) and Add to encounter (side ally), checked in:
  - 390px: dark ES, dark EN, dark ES at 150%, light EN at 150%;
  - 820px: dark ES at 150%, light EN at 150%;
  - 1024px: dark ES, light EN;
  - 1440px: dark ES, light EN.
- For each state: automated detection of labels wrapping to several lines, labels clipped or outside
  their tile, sideways overflow of dialog, drawer and popover bodies, the column count of each size
  scale and the base baselines. Screenshots were inspected for every state.
- Not re-run in this round: the keyboard flows (the widgets' keyboard model did not change), contrast
  values and touch-target sweeps. The seal is now 16px and decorative; tiles stay at least 44px by
  their min-height.

## Round 2 evidence

The screenshots are in the reviewer's session scratchpad, which is temporary:
`C:\Users\dmont\AppData\Local\Temp\claude\0f049fd8c6ab0dac\edcb4093-8367-4eb9-933f-f629280bcdef\scratchpad\shots2\`
- F1: `1024-dark-es-editor-cr-side.png`, `1024-light-en-editor-cr-side.png`,
  `tablet-dark-es-150-editor-cr-side.png`
- F2: `mobile-dark-es-filters-size.png`, `mobile-dark-en-filters-size.png`,
  `mobile-dark-es-150-archetype-size.png`, `1024-dark-es-editor-size.png`
- R2-1: `desktop-dark-es-filters-bands.png`, `1024-dark-es-filters-bands.png`
- R2-2: `1024-dark-es-editor-size.png`, `desktop-light-en-archetype-size.png`
- R2-3: `mobile-dark-es-150-editor-dice.png`
- 1440 sanity pass: `desktop-dark-es-editor-dice.png`, `desktop-light-en-add.png`

## Re-review scope (Round 3)

Check R2-1 (ES bands at 1440, 1024, 820px at 150% and 390px, pressed and unpressed). If changed,
also check R2-2 and R2-3 (editor type tiles at 1024 ES, Filters types at 390px, dice at 390px with
150% text).

---

# Round 3 (focused re-review)

- Date: 2026-11-04
- Reviewed fingerprint: `0efab496cd8560f21b72ca03bab91eadb0dad62eb627dfc0701eb30daecd8ade` (same value
  before and after this round)
- Scope: R2-1, R2-2, R2-3 and how clearly the new glyph-corner seal reads. The findings from Rounds 1
  and 2 are kept above.

## Verdict: PASS

No blocking findings remain. R2-1, R2-2 and R2-3 are fixed. The items below are Minor polish or
were already there before this delivery (see Round 2, O1), and they do not block.

## Status of Round 2 findings

| # | Status | Browser evidence |
|---|---|---|
| R2-1 | **Fixed** | ES bands, unpressed, pressed "Medias" and pressed "Épicas", at 1440, 1024, 820px with 150% text and 390px (dark and light): nothing is clipped or outside its band. Layout is 3+2 in the popover and at 390px, and 2+2+1 at 390px with 150% text. Each band is at least 48px tall (64px at 150%). "✓ Medias" and "✓ Épicas" stay on one line. The automated "wraps" flag on pressed bands came from the inline check SVG's own rect; the screenshots confirm the label is on one line. |
| R2-2 | **Fixed** | Filtros at 390px (ES dark and light): every type name is on one line, including "Monstruosidad". The 1024 editor (ES): "Aberración" and "Humanoide" are back on one line. Only "Monstruosi-dad" (13 letters, compact 3-column grid) and "Muerto viviente" (wrapping at the space) take two lines. The EN "Monstrosity" is no longer clipped. |
| R2-3 | **Fixed** | 390px with 150% text (ES dark, EN light): the dice wrap 3+3 and no face leaves its tile. The seal and underline on d8 are clear. The editor body still overflows by 6px (379/373); with the dice no longer overflowing, that comes from the Round 1 Group/Select and footer observation. |

## Glyph-corner seal

The seal sits 22px right of and 4–7px above the medallion's top-left corner, at 16px. Both themes
were inspected zoomed (`z-seal.png`). The check stroke (on-accent) is legible on the accent disc.
The selected tile also inverts the medallion, adds the accent border, inset ring and tint, so the
state never relies on colour alone.

- Minor (R3-1, polish): the seal disc and the selected medallion share the accent colour, so the disc
  merges into the medallion and reads as a notch with a tick, not a separate badge. Suggestion:
  `box-shadow: 0 0 0 2px var(--app-raised)` (or the tile's checked background) on
  `.bst-type-tiles .bst-tile-seal` to cut it out. This is not blocking.
- The automated "seal overlaps name" flag was a bounding-box touch of about 2px. In no screenshot
  does the seal cover any text.

## Tested in Round 3

Browser testing used a scratch file, `tests/e2e/_shots/r3.shots.ts`. It type-checked with
`npx tsc -b` (exit 0) and was deleted afterwards. It covered the Filtros bands (unpressed, Medias
pressed, Épicas pressed), Filtros types with two selected, and the editor's type tiles and dice in:
- 390px: dark ES, light ES, dark ES at 150%, light EN at 150%;
- 820px: dark ES at 150%, light ES at 150%;
- 1024px: dark ES, light ES;
- 1440px: dark ES, light EN.

Each state had automated clip, overflow and wrap detection, band row count and band height, plus
screenshot inspection. Keyboard, contrast and touch-target sweeps were not repeated, because no widget
behaviour changed; they are covered in Round 1.

## Round 3 evidence

The screenshots are in the reviewer's session scratchpad, which is temporary:
`C:\Users\dmont\AppData\Local\Temp\claude\0f049fd8c6ab0dac\edcb4093-8367-4eb9-933f-f629280bcdef\scratchpad\shots3\`
- R2-1: `desktop-dark-es-bands-mid.png` (crop `../z-bands-1440.png`), `1024-*-bands-*.png`,
  `tablet-*-150-bands-*.png`, `mobile-*-bands-*.png`
- R2-2: `mobile-dark-es-types.png`, `mobile-light-es-types.png`, `1024-dark-es-editor-types.png`
- R2-3: `mobile-dark-es-150-editor-dice.png`, `mobile-light-en-150-editor-dice.png`
- Seal: `../z-seal.png`

This PASS applies only to fingerprint `0efab496cd8560f21b72ca03bab91eadb0dad62eb627dfc0701eb30daecd8ade`.
Untested, as in Round 1: real touch devices, screen readers, forced colours and hosted Supabase.
