# RYT-024 independent ui-ux review

- Reviewer role: `.codex/agents/ui-ux.toml` (independent subagent, read-only on implementation)
- Reviewed: 2026-10-30, uncommitted working tree
- Source fingerprint (`node scripts/check-ui-review.mjs --fingerprint`, taken before and after
  the browser run): `c713678ebaed903d0cdce89de9ec0d736d27a26abe499d55fa35bb980c37b6d4`

## Verdict

**CHANGES_REQUIRED**

There are no blockers. Three major issues remain: the rest dialog does not return focus, the
new routes have the wrong document title, and "Save and exit" is blocked by the validation of
the current step. The sheet itself works well at the table: the hit points are large, the
steppers and pips are 44px or larger, and the hierarchy is clear in both themes and both
languages.

## Findings

### Major

1. **The rest dialog loses focus on Escape, Cancel and confirm.**
   `src/features/characters/ui/sheet/sections.tsx:351-375`.
   - Tested on: 390px and 820px, dark, Spanish.
   - Reproduce: open the Features tab, focus "Descanso largo", press Enter, then press Escape.
     `document.activeElement` is then `<body>`. Its innerText starts with the skip link and
     the header, so it is not the opener. Confirming the rest also leaves focus on `<body>`.
   - Cause: the Modal is mounted only while `rest` is set (`{rest && <Modal opened>}`).
     Closing it unmounts the Modal at once, so Mantine's `returnFocus` cannot run. The HP
     dialog handles this with an opener ref plus `requestAnimationFrame`. Escape on the HP
     dialog returned focus to "Daño" as expected.
   - Impact: this breaks the design-system rule "Focus trapping, Escape and return focus for
     overlays". Keyboard and screen-reader users are sent back to the top of the page. The
     existing e2e test only checks that the dialog closes.

2. **The sheet and wizard routes are titled "Page not found".**
   `src/app/layout.tsx:199-208` (title resolution). The routes were added in
   `src/app/router.tsx:54-55`.
   - Tested on: 390px and 820px, Spanish and English.
   - What happens: on `#/campaign/:id/party/:characterId`, `page.title()` is
     "Página no encontrada · Rytta". On `.../create` in English it is "Page not found · Rytta".
     The title lookup only matches exact module paths, so the new nested routes fall back to
     `page.notFound`.
   - Impact: screen readers announce the wrong page, and the browser tab and history show an
     error on a working screen. The design system requires translated route titles.
     Suggested titles: "Ficha de personaje / Character sheet" and the wizard title.

3. **"Guardar y salir" (Save and exit) is blocked when the current step is incomplete.**
   `src/features/characters/ui/creation/character-creation.tsx:148-155` calls `save(false, …)`,
   which runs `validateStep` (line 115).
   - Tested on: 390px and 820px, dark, Spanish, 150% text.
   - Reproduce: create a character as the Player, choose Mago, press Next to reach Origen,
     then press "Guardar y salir" without choosing a species. The page stays on `/create` and
     shows "Elige o nombra una especie." and "Elige o nombra un trasfondo."
   - Impact: the one action that promises a safe exit cannot be used mid-step. The only other
     way out is the "Ficha de personaje" back link, which silently discards any edits on the
     current step. A player who is called back to the table cannot leave cleanly. Fix: save
     the draft without blocking on step validation (drafts are allowed to be incomplete), or
     relabel the action and warn before discarding edits.

### Minor

4. **Resuming a draft starts at step 1.**
   `character-creation.tsx:100` (`useState(0)`). After two saved steps, "Continuar ficha"
   opens "Clase y nivel" again. The data is kept (Mago still selected), but the player has to
   click forward. Consider opening the first incomplete step.
   Tested on: 390px and 820px.
5. **The step count changes during the wizard.** It shows "Paso 1 de 6" before a class is
   chosen and 7 steps once a spellcasting class is chosen (`stepApplies`). Seen in
   `mobile-wizard-class-error-150.png`. It is honest, but it may surprise users. Consider a
   short hint.
6. **At 150% text on 390px, the stat tiles break words with hyphens and uneven rows**
   ("Compe-tencia", "Percep-ción pasiva", "30 / pies"), and the four tabs wrap onto two rows.
   `styles.css` (`.sheet-stat dt` uses `hyphens: auto`; grid `minmax(96px,1fr)`). Everything
   is still readable with no overflow, but scanning is harder. Consider shorter labels or 2
   columns at narrow widths with large text.
   Evidence: `mobile-sheet-es-dark-150-full.png`, `mobile-hp-dialog-es-dark-150.png`.
7. **Spell and feature accordions use a cool grey background in light mode**, not the warm
   parchment surface tokens. This is the default background of Mantine's `separated` variant.
   `sections.tsx:334, 451`. Evidence: `tablet-spells-en-light-150-full.png`.
8. **In read-only views, disabled pips keep their action labels.** Screen readers announce
   "Gastar un espacio…" (spend a slot) and "Éxitos: +1" as disabled buttons on a sheet the
   viewer cannot edit. The three death-save pips per row also share identical names.
   `pips.tsx:213-219`. Consider rendering read-only pips as non-interactive with a
   count-only name.
9. **The wizard's not-found state uses a red error Alert**
   (`character-creation.tsx:52-59`), while the sheet uses a neutral Paper. The wizard's
   loading state (line 51) also has no back link. Both are small consistency gaps.
10. **The HP amount field ends up with `inputmode="decimal"` in the DOM** even though the
    code passes `inputMode="numeric"` (`vitals-panel.tsx:440`; Mantine overrides it). Phones
    may show a decimal keypad for whole numbers. Low impact.

## Tested scenarios

### In a real browser

Chromium at `/opt/pw-browsers/chromium`, running the supabase-mode build against
`identityFixture`. Viewports were 390x844 with touch and 820x1180 with touch.

- Sheet, Spanish, dark, at 100% and 150% text: axe (wcag2a/2aa/21aa/22aa) reported 0
  violations. There was no horizontal overflow, and no visible control in `main` or the
  dialog was under 44px. Checkboxes and radios were excluded from that check because their
  label targets are 44px or more.
- Keyboard order on the sheet: header, tabs, back, Edit sheet, −1 and +1, Damage, Heal, Temp
  HP, tab list, Spend hit die, death-save pips, inspiration, add condition. The order is
  logical.
- HP dialog: Enter opens it and focus moves to the amount input. Escape closes it and focus
  returns to "Daño". Healing 999 clamps to 38/38, and the +1 stepper is then disabled. The −1
  stepper takes from temporary HP first (38/38 stays, temporary goes from 5 to 4).
- Adding a condition: the remove button is 54x54.
- Rest dialog: Escape, Cancel and confirm all lose focus (finding 1). On confirm, the live
  region announces "Descanso aplicado."
- Sheet, English, light, at 150% text: Summary and Spells tabs had 0 axe violations and no
  overflow, and the English text was complete. Notes was opened.
- Party as DM, Spanish, dark: the summary bar shows class and level, "PG 30/38 +5", CA 14 and
  an HP bar with numeric text, so status is not shown by colour alone. The `aria-describedby`
  on the "Ver ficha" link resolves to "Arin". 0 axe violations, no small targets.
- Player POV preview (DM previewing "Arin"): the sheet shows "Vista de solo lectura" (read
  only). The only enabled buttons are the 4 tabs, and all 6 pips are disabled. The wizard URL
  shows "Solo el jugador asignado o un DM pueden editar esta ficha."
- Wizard as Player, Spanish, dark, at 150% text:
  - Pressing Next with no class shows an alert above the fold, and focus stays on Next.
  - After moving to a new step, focus goes to the step's h1.
  - The sticky action bar is pinned to the bottom of the viewport (y = 779 of 844 on mobile,
    1115 of 1180 on tablet).
  - The draft is saved on Next, and the Party card shows "FICHA PENDIENTE / Continuar ficha".
  - Resuming keeps the data (finding 4). Save and exit is blocked (finding 3).
  - The class, origin, abilities and skills steps had 0 axe violations, no overflow and no
    targets under 44px. (The abilities and skills probes actually ran on the Origen step,
    because the run stopped at Origen validation.)
- Error state (HTTP 500 on `character_sheets`, English): shows the error message plus "Try
  again", with 0 axe violations. Not-found states on the sheet and the wizard both show "This
  character does not exist or you cannot see it."
- Document titles: see finding 2.

### From screenshots and code inspection only

- Ability tiles mark proficient saves with an accent border plus "●" and a spoken
  "competente" (proficient).
- Skill markers use P/E letters and a legend, so they do not rely on colour.
- The HP tone is shown by the left border and the bar, alongside the numeric value.
- The SRD CC-BY attribution is shown on the sheet.
- Compared with D&D Sync, the patterns are similar without being copied: big HP with
  steppers, ability tiles, a skills list and tappable pips.

## Evidence

All under `docs/evidence/RYT-024/reviewer/`:

- `mobile-sheet-es-dark-100-viewport.png`: first viewport at the table (glanceability)
- `mobile-sheet-es-dark-150-full.png`: 390px, 150% text, full summary
- `tablet-sheet-en-light-150-full.png`: 820px, English, light, two-column summary
- `tablet-spells-en-light-150-full.png`: spell slots and pips, accordion background (finding 7)
- `mobile-hp-dialog-es-dark-150.png`: HP dialog at 150%
- `mobile-wizard-class-error-150.png`: wizard validation, sticky bar, header wrap
- `mobile-party-dm-es-dark.png`: Party summary bar
- `mobile-pov-sheet.png`: read-only Player POV sheet

Raw logs are in the reviewer's scratchpad and are not committed.

## Limitations and untested states

- The browser run used 390px and 820px only. 1440px desktop was not run by this reviewer.
- I did not reproduce the stale-revision alert or the stale reload in the wizard; I read the
  code instead. The implementer's e2e test covers stale vitals on the sheet.
- I did not separately emulate reduced motion beyond the existing spec. I did not check the
  loading state visually, because the fixture responds instantly.
- Not walked in this run: the full wizard to completion with all seven steps, the homebrew
  class form, point buy, and the spells and details editors. The skills and abilities probes
  ran on the Origen step.
- In the Party view under Player POV, the fixture character has no assigned player, so the
  Party view showed "Tu DM todavía no te ha asignado un personaje." This comes from the
  fixture, so the read-only state of the Party summary bar in POV was not exercised.
- No hosted Supabase. Mobile Chromium emulation does not verify iOS Safari or real touch
  hardware. Contrast in dim light was judged from screenshots, and axe found no contrast
  violations.
