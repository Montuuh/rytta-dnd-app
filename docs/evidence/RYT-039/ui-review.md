# RYT-039 independent UI/UX review: combat conditions linked to the glossary

- Reviewer: `ui-ux` role (`.codex/agents/ui-ux.toml`), run as an independent subagent.
- Date: 2026-11-03.
- Reviewed source: local `main` at base `21fd92a` with uncommitted changes (only
  `src/features/combat/ui/combatant-detail.tsx` in the UI). Fingerprint
  `4e3e321d3c3c0f079a251505c95f38d679c6dbf172d05ce59ac267e3b29ab218`. I copied the working
  tree into the session scratchpad; the copy produces the same fingerprint, and I built from
  it.
- Setup:
  - Production build (supabase mode, mocked backend `tests/e2e/fixtures/identity.ts` and
    `tests/e2e/fixtures/combat.ts`) served on port 4180.
  - Viewports: 390×844 and 820×1180, both touch enabled, plus 1280×900 for the wide layout
    without a drawer. Spanish, dark theme, reduced motion emulated.

## Verdict: PASS

The links fit the existing combat detail without layout shift. Keyboard, Escape and focus
behave correctly in the drawer and in the wide layout. The definition sheet stacks above the
combat drawer and works alongside the sticky error and `onlyTopDialog`. There are no blocker
or major findings.

## How it was tested (real browser)

### Setup per role

- **DM (encounter page):**
  - Opened Goblin 1.
  - "Cambiar", then turned on Derribado, Agarrado, Envenenado and Asustado (pills wrap to
    two rows at 390px), then "Listo".
- **Player (own panel, "¡Te toca!"):**
  - "Cambiar", then Derribado, then "Listo".
- **Timed effects with a condition:** the combat fixture does not implement
  `add_combat_effect`; the Effect dialog shows "No se pudo guardar". So a review-only init
  script added effects to the `get_combat_state` responses: "Inmovilizar persona ·
  Paralizado" on Goblin 1 and "Telaraña · Apresado" on Arin.

### Visual fit (computed styles and screenshots)

- **Titles:** "Estados", "Concentración" and the unlinked "Efectos" and "Controles del DM"
  all stay Georgia 16px at 23px height. Heights are identical before and after linking at
  every viewport, so there is no layout shift. The Brain icon and its gap are kept on
  "Concentración".
- **Pills:** the tags keep Inter 14px inside their outline, with the dotted accent underline
  inside the pill. Pills wrap normally.
- **Effect line:** reads "Inmovilizar persona · Paralizado", with the condition underlined.
- Screenshots: `{mobile,tablet,desktop}-dm-detail.png`, `{mobile,tablet,desktop}-player-own.png`.

### Hit areas and neighbouring controls

- I probed every button, input and checkbox in the detail at its four edges with
  `elementFromPoint`. None is covered by a term's 44px hit area. That includes "Cambiar" next
  to the "Estados" title, "Añadir efecto", the Conjuro field, "Concentrarse" and the effect
  remove button.
- Each term is reachable 9px above and below its text.
- The only overlaps are between terms (see M1).

### Keyboard (390px, 820px and 1280px)

- **Tab order:** "Cambiar" → "Derribado: ver definición".
- **Enter:** opens the dialog named "Derribado" (headword in the title).
- **First Escape:** closes only the definition; focus returns to the pill term and the combat
  drawer stays open.
- **Second Escape:** closes the combat drawer; focus returns to the Goblin 1 row button.
- **Wide layout (no drawer):** the first Escape closes the definition with focus back on the
  term; a second Escape does nothing.
- **Player:** Enter on "Apresado" (effect line) opens its definition, and Escape returns
  focus to the term.

### Screen reader names

Accessible names are "Derribado: ver definición", "Estados: ver definición",
"Concentración: ver definición", "Paralizado: ver definición" and "Apresado: ver
definición". axe found no violations with the definition open over the drawer, for DM and
Player, at every viewport.

### Stacking and close logic

- The definition is on top (`elementFromPoint` inside the sheet hits the sheet):
  - 390px: bottom sheet, 0–118 → 844.
  - 820px: 440px side sheet.
  - 1280px: 440px side sheet.
- **Close button path:** "Cerrar definición" closes only the definition (focus on "Estados"),
  then the drawer's own close button closes the drawer, with focus on the row. A definition
  left mounted does not block `onlyTopDialog`.
- **Overlay path:** a tap on the definition's overlay closes only the definition; the drawer
  stays.
- **Sticky error:** I made `set_combat_condition` fail with a 503, toggled "Cegado", and the
  inline error appeared. Opening "Derribado" over it puts the sheet on top. The first Escape
  closes only the sheet and the error stays in place. The second Escape closes the drawer.
- No page errors in any run.

## Findings

### M1 (minor): neighbouring term hit areas overlap

- **Where:** the "Estados" title and the first row of pills, and between wrapped pill rows.
  The inline term hit area comes from `glossary.css` (`::after` inset −12px).
- **When:** all viewports.
- **Reproduction:** at 390px with four conditions, a tap 9px below "Estados" opens
  "Derribado", and a tap 9px below "Derribado" or "Asustado" opens the term on the next row.
- **Impact:** a tap between rows can open the neighbouring definition. Taps on the text are
  always correct and no control is covered.
- This is the same accepted trade-off as RYT-008 F7, so it is not blocking. If the
  pills ever feel unreliable at the table, consider making the whole pill the button instead
  of the inner text, while keeping the 44px hit area.

### M2 (minor, test coverage)

- **Gap:** the effect line (condition named on a timed effect) is not exercised by the new
  e2e test, because the combat fixture has no `add_combat_effect`. I could verify it only
  through injected state.
- **Suggestion:** add effect support to `tests/e2e/fixtures/combat.ts`, or seed an effect,
  so that `RYT-039` also asserts the effect-line link.

## Untested states and limitations

- I did not check the light theme, the class themes, English or 150% text for this change.
  The terms use the same tokens and component as the RYT-008 terms, which were reviewed in
  those modes, but the pills were not rendered in them.
- No real devices or screen reader.
- I did not run the repo e2e or `npm run check`.
- Effect lines were tested with injected state, not through the real RPC.
- The read-only table display and the initiative rail badges are deliberately unlinked. I
  confirmed that they render unchanged, for example the "Derribado" badge on Arin's rail row.
- This approval applies only to fingerprint
  `4e3e321d3c3c0f079a251505c95f38d679c6dbf172d05ce59ac267e3b29ab218`.

## Screenshots

These are in the session scratchpad and are not committed:
`/tmp/claude-0/-home-user-rytta-dnd-app/63bbd363-2400-5756-80a5-86a53f7c2ad4/scratchpad/ui-review/shots8/`

- **DM detail:** `{mobile,tablet,desktop}-dm-detail.png` and `-dm-detail-err.png`
- **DM definition:** `{mobile,tablet,desktop}-dm-sheet.png` and `-dm-sheet-err.png` (with the
  sticky error)
- **Player:** `{mobile,tablet,desktop}-player-own.png` and `-player-sheet.png`
- **Fixture limitation:** `mobile-effect-dialog-Apresado.png`, showing the effect save failing
  in the fixture
