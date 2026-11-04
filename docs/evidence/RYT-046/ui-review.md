# ui-ux review: RYT-046 to RYT-049 (DM bestiary, editor, add to encounter, console creature)

- Reviewer: `ui-ux` (independent, role `.codex/agents/ui-ux.toml`)
- Date: 2026-11-04
- Verdict: **CHANGES_REQUIRED**

## Scope and source snapshot

- Tickets: RYT-046, RYT-047, RYT-048, RYT-049 (`docs/backlog/items.json`), ADR 028.
- Reviewed working tree on `main` at `da092c9` plus the uncommitted bestiary delivery (all files
  listed in the request: `src/features/combat/ui/{bestiary,new-creature,creature-editor,creature-draft,add-to-encounter,creature-console,combatant-detail,add-combatants,encounter-list}.tsx|ts`,
  `src/features/combat/ui/bestiary.css`, `src/features/bestiary/ui/{stat-block.tsx,bestiary.css}`,
  `src/shared/i18n/bestiary-{es,en}.ts`, DM Center composition).
- Source fingerprint (`node scripts/check-ui-review.mjs --fingerprint`), identical before and after
  the review: `0e7a288bf10128d4dd0aa8c82473577b08ae5bcf8e8e6a5052565d77e25dd1e6`.
- Implementation code was not edited. Temporary review specs (`tests/e2e/zz-review-bestiary.spec.ts`)
  and a temporary `testMatch` entry in `playwright.config.ts` were used and removed; the config was
  restored byte-for-byte (md5 `58a02d19…` before and after).

## Tested scenarios

Browser-tested (built app, in-memory Supabase fixture, Chromium; projects `identity-mobile` 390x844,
`identity-tablet` 820x1180, `identity-desktop` 1440x1000; reduced motion emulated):

1. Delivery spec `tests/e2e/bestiary.spec.ts`, all three projects, `RYT_EVIDENCE=1`: 12/12 passed;
   evidence in `docs/evidence/RYT-046..049/` refreshed and inspected.
2. Spanish dark: touch-target measurements (search, source control, filter button, rows, star,
   chips, CR slider thumbs, sort, filter footer, menus, stepper, trackers, accordion controls,
   checkboxes, entry move/remove, trait library); keyboard search → ArrowDown → rows → Tab → Enter;
   sheet Tab order and Escape; filters popover/drawer open, slider arrows, Escape; no-match and
   empty-favourites states; campaign "quick" creature detail, ⋯ menu, delete modal and Cancel.
3. English light (all viewports): deep link `&creature=srd:adult-red-dragon`, list, stat block,
   new-creature chooser, archetype step, editor, add dialog with no open encounter; axe on each;
   scan for Spanish leftovers (none found).
4. 150% root text (phone and tablet): list, stat-block sheet, add dialog (top and bottom), editor.
5. New creature keyboard flow: chooser initial focus, step change, Back, paste step, paste with an
   unplaceable line (unplaced alert), garbage paste, editor entries add / move up / remove, trait
   library search and pick, phone preview switch, Escape with unsaved edits, click outside (desktop),
   Escape on an open Select inside the editor.
6. Add to encounter: keyboard open, stepper, submit with Enter, success state, Escape; slow
   `list_encounters` (2.5 s) to see the loading state; Escape with focus inside the dialog opened
   from the phone/tablet sheet; ⋯ → Duplicar → editor → Escape; ⋯ → Copiar como texto.
7. DM console: SRD creature with alias, recharge and uses trackers, stat block accordion, use pips,
   reveal by keyboard, set a new alias by keyboard; console "Añadir combatientes" creature picker
   search (phone and desktop); old `combat?tab=bestiary` link redirect.
8. Filter popover reach at 1440x1000 and 1366x768.

Screenshot inspection: all PNGs listed below were opened and reviewed.
Code inspection only: reduced-motion behaviour (global `prefers-reduced-motion` rule in
`src/app/styles.css:648`; emulation was on during runs but motion itself was not measured), image
upload on the campaign token, stale-revision error in the editor, class themes other than Default.

Evidence: `docs/evidence/RYT-046/review/*.png` (89 captures, names `<scenario>-<viewport>.png`), e.g.
`add-loading-*.png`, `t150-list-mobile.png`, `t150-add-mobile.png`, `t150-sheet-mobile.png`,
`filters-cr-*.png`, `console-alias-trackers-*.png`, `console-form-search-mobile.png`,
`en-light-*.png`, `paste-editor-*.png`, `editor-entries-*.png`.

What works well (verified): axe (WCAG 2.0/2.1 A/AA) clean on list, stat block, filters, chooser,
archetype, editor (incl. unplaced alert), add dialog and console in both themes and languages; no
horizontal page overflow at any viewport or at 150%; English catalogue complete; rows, star, menus,
stepper, trackers, accordion controls and entry buttons are 44px; arrow/Home/End list navigation;
the sheet takes focus on its close button and Escape returns focus to the row; filters Escape
returns focus to "Filtros"; search Escape clears; Escape on an open Select only closes its listbox;
delete modal starts on Cancel; the old combat bestiary tab redirects to the Command Center; the
stat block reads well and its ability tiles expose full text.

## Findings

### F1 major: Escape in any dialog opened from the phone/tablet stat-block sheet also closes the sheet

- Where: `src/features/combat/ui/bestiary.tsx:341-362` (sheet `Drawer`), dialogs at
  `bestiary.tsx:367-485`, `add-to-encounter.tsx:104`, `creature-editor.tsx:423`.
- Viewport/theme/language: 390px and 820px, any theme, any language.
- Reproduction: open a creature (sheet), tap "Añadir a un encuentro", focus "Nombre para la mesa",
  press Escape. Both the dialog and the sheet close; focus lands on `<body>`. Same with ⋯ →
  Duplicar → editor → Escape (measured: dialogs 0, sheet 0, focus BODY on phone and tablet).
- Impact: the DM loses the stat block and their place in the list; contradicts the design system
  ("Escape closes only the topmost", "return focus for overlays").

### F2 major: Add-to-encounter dialog has no loading/error state and offers to create a new encounter while encounters load

- Where: `src/features/combat/ui/add-to-encounter.tsx:60-79` (`creating = open.length === 0`
  ignores `encounters.isPending`/`isError`), `136-160`.
- Viewport: all. Reproduction: open the bestiary fresh (encounters not cached) with an open
  encounter "Cripta" and tap "Añadir a un encuentro": the dialog shows "Nuevo encuentro · No hay
  encuentros abiertos: crea uno con este nombre" (`add-loading-*.png`), then swaps to the encounter
  Select (`add-loaded-*.png`) and focus drops to `<body>`. If the query fails the wrong state stays.
- Impact: misleading copy, a DM who types quickly creates an unwanted encounter, keyboard focus
  lost; no visible error/retry (design system requires loading and error states).

### F3 major: The creature editor discards all edits on Escape, the close button, Cancel or a click outside, without asking

- Where: `src/features/combat/ui/creature-editor.tsx:423-437` (Modal `onClose`), `482-484`; also the
  paste step textarea `new-creature.tsx:91-99`.
- Viewport: all. Reproduction: customise or duplicate a creature, change the name, press Escape (or
  click the backdrop on desktop): the editor closes and the draft is gone (measured: editor count 0).
- Impact: data loss on a long form; the app's homebrew glossary editor already asks before
  discarding (`glossary/ui/homebrew-editor.tsx:74-140`), so behaviour is inconsistent.

### F4 major: Segmented controls clip their labels at 150% text on phones (WCAG 1.4.4)

- Where: `src/features/combat/ui/bestiary.css:31-40` (`.bst-source`, labels do not wrap),
  `src/features/combat/ui/add-to-encounter.tsx:210-238` (hit-point options).
- Viewport: 390px, 150% text, dark, Spanish. Reproduction: `html { font-size: 150% }`; the source
  control shows "Favor" instead of "Favoritas" (`t150-list-mobile.png`); the add dialog shows
  "Tirar 19d12 +" with the formula cut (`t150-add-mobile.png`; labels measure 166+212px in 357px).
- Impact: options and the dice formula become unreadable at enlarged text.

### F5 major: Filter controls are below the 44px touch target rule

- Where: `src/features/combat/ui/bestiary.css:49-51` (type/size chips `min-height: 36px`, measured
  36px tall at all viewports), `bestiary.tsx:519-535` (CR `RangeSlider` thumbs 16x16px);
  also the editor's "Competente en salvación" checkboxes are 24x24px
  (`creature-editor.tsx:338-349`).
- Viewport: 390px and 820px touch (also desktop). Reproduction: open Filtros and measure.
- Impact: AGENTS.md and the design system require 44px targets; other chip filters in the app use
  44px (`.kind-filter`, `.access-chips`, `.condition-chip` in `src/app/styles.css`). Fourteen small
  chips in a bottom drawer are the main phone filter surface.

### F6 major: Overlays opened from the ⋯ menu do not return focus

- Where: `src/features/combat/ui/bestiary.tsx:129-132` (`restore` skips disconnected nodes),
  `914-950` (menu items pass `e.currentTarget`, the menu item, as opener; it unmounts with the menu).
- Viewport: all. Reproduction: ⋯ → Eliminar → Escape/Cancel (phone, tablet: focus BODY); ⋯ →
  Duplicar → Escape (desktop: focus BODY). Completar la ficha from the menu is affected the same way.
- Impact: keyboard and screen-reader users are dropped at the top of the document; violates "return
  focus for overlays". Return to the ⋯ trigger instead.

### F7 minor: Focus is dropped when content swaps in place

- Where: `new-creature.tsx:80-89, 114` (step change and "Otras formas": focus BODY; the next Tab
  recovers inside the dialog), `add-to-encounter.tsx:113-126` (success state: focus BODY),
  `creature-console.tsx:84-129` (reveal and set alias: focus BODY on the console page),
  `bestiary.tsx:726-733` (empty-state "Ver todas las criaturas": focus BODY).
- Viewport: all. Impact: no announcement of the new step/state; in the console the keyboard user
  loses their place after revealing a name. Move focus to the new step's first field, the success
  message/primary action, the alias field or reveal button, and the search or first row.

### F8 minor: Console creature picker and "Desde el SRD" do not ignore accents or match English names

- Where: `src/features/combat/ui/add-combatants.tsx:299-301`, `new-creature.tsx:212-226` (Mantine
  default filter on Spanish labels).
- Viewport: all. Reproduction: console → Añadir combatientes → "Del bestiario", type "dragon rojo jo"
  → "Ninguna criatura coincide" (`console-form-search-mobile.png`). "aguila", "Wolf" also fail.
- Impact: inconsistent with the bestiary search (accents ignored, both languages). While the empty
  dropdown is open axe reports `aria-required-children` (listbox with no options).

### F9 minor: Recharge tracker button's accessible name does not contain its visible label (WCAG 2.5.3)

- Where: `src/features/combat/ui/creature-console.tsx:147-166`.
- Visible "Disponible · recarga 5–6", accessible "Marcar Aliento de fuego (recarga 5–6) como
  gastada", plus `aria-pressed` while the label also flips. Voice-control users cannot say what they
  see. Keep the visible state in the name (e.g. "Aliento de fuego: disponible") and use either
  `aria-pressed` or a changing label, not both.

### F10 minor: At 150% text the phone sheet's sticky action bar takes 235px and wraps to three rows

- Where: `src/features/combat/ui/bestiary.css:192-203`. `t150-sheet-mobile.png`: "Añadir a un
  encuentro" on two lines, Personalizar + star, then ⋯ alone on a third row; about half the sheet
  remains for the stat block. Consider icon-only secondary actions or one row with ⋯ holding
  Personalizar on narrow/large-text layouts.

### F11 minor: In the phone/tablet sheet the actions come last in the tab order

- Where: `bestiary.tsx:1001-1019` (`{inSheet && actions}` after the stat block). Measured Tab order
  from the close button goes through every glossary term first. The bar is always visible, so a
  keyboard user expects to reach it early. Place the actions before the stat block in DOM order or
  add a skip.

### F12 nit: The sheet's accessible name is always "Bestiario"

- Where: `bestiary.tsx:350, 357`: the `title` wins over `aria-label={selected?.name}` (measured:
  `aria-labelledby` → "Bestiario"). Announce the creature name.

### F13 nit: Row meta breaks inside value pairs

- Where: `bestiary.tsx:780-789`, `bestiary-es.ts:41-42` (and English). In the 380px desktop list and
  on phones "CA / 17" and "PG / 150" split across lines (`en-light-statblock-desktop.png`,
  `kbd-row-open-desktop.png`). Use non-breaking spaces inside "VD 1/4", "CA 17", "PG 150".

### F14 nit: Visual details

- Archetype cards: the hover fill (`--app-hover`) is stronger than the selected tint in light mode,
  so a hovered card looks selected (`bestiary.css:264-268, 322-326`; `en-light-archetype-mobile.png`).
- CR slider value bubble overlaps the "Valor de desafío" heading while focused (`filters-cr-*.png`).
- Phone dialog footers wrap awkwardly: "Otras formas" above a left-aligned "Abrir en el editor"
  (`step-srd-mobile.png`), "Seguir en el bestiario" above "Abrir el encuentro" (`add-success-mobile.png`).
- Drafts from paste/archetype start with "Texto fijo" type line; a pasted "caótico malvado" keeps
  "sin alineamiento" in the Alignment field (`paste-editor-desktop.png`).
- The DM's initiative rows give no hint that a creature has a table alias (only the detail shows it).

## Limitations and untested states

- Chromium emulation only; no real iOS Safari/Android touch, no screen reader run (names and roles
  were read from the DOM).
- In-memory fixture, not hosted Supabase; server-side rolled HP, recharge rolls and Player/table
  alias projection were not reviewed in the UI (covered by the delivery's SQL/e2e tests, not here).
- Not exercised: creature image upload on the campaign token, editor stale-revision conflict,
  catalogue/body loading and error states (`bodiesPending`), class themes other than Default,
  landscape phones, 200% zoom, the trait library on a phone with the on-screen keyboard.
- Reduced motion verified by code inspection plus emulation, not by measuring transitions.

## Verdict

**CHANGES_REQUIRED** for source digest `0e7a288bf10128d4dd0aa8c82473577b08ae5bcf8e8e6a5052565d77e25dd1e6`.
Blocking for PASS: F1, F2, F3, F4, F5, F6 (major). F7 to F14 should be fixed or explicitly deferred.
After fixes, request a focused re-review of the affected flows (sheet layering and focus, add dialog
loading, editor discard, 150% phone controls, filter targets, menu focus return).

---

## Re-review 1 (2026-11-04): fixes for F1–F14

- Verdict: **CHANGES_REQUIRED**
- Source fingerprint reviewed (`node scripts/check-ui-review.mjs --fingerprint`, stable before and
  after): `d7f9123659ae97b6c4ef196483a3327f42918e322196cf6f8f3491736558305b`.
- Method: same rules as above. A temporary spec (`tests/e2e/zz-review-bestiary.spec.ts`) with a
  temporary `testMatch` entry ran in `identity-mobile`, `identity-tablet` and `identity-desktop`
  (Spanish dark, plus English light and 150% text where noted). Both were removed afterwards and
  `playwright.config.ts` was restored byte-for-byte (md5 `58a02d19…`). Captures:
  `docs/evidence/RYT-046/review/rr-*.png` (62 files), all opened and inspected.
- Browser-tested: sheet layering and Escape (add dialog, Duplicar editor, Eliminar modal, Completar
  la ficha); add dialog error (HTTP 500), Reintentar, slow load (2.5 s), loaded, success, Escape;
  editor discard flow (Escape, Escape on the confirm, backdrop click on desktop, Cancel then
  Descartar cambios, unchanged editor); new-creature step focus; SRD and console pickers (accents,
  English names, empty state with axe); filters (chip and thumb sizes, slider keyboard, Escape); list
  meta; 150% text list, sheet and add dialog; console alias row, recharge and uses trackers by
  keyboard, reveal and set alias by keyboard; English light stat block and add dialog with axe;
  customise draft fields in Spanish and English and the "Generar" type line.

### Status of the original findings

| Finding | Status | Evidence |
| --- | --- | --- |
| F1 Escape closes the sheet | Fixed | Phone/tablet: Escape in the add dialog and in the Duplicar editor leaves the sheet open (dialogs 0, sheet 1); focus returns to "Añadir a un encuentro" / "Más acciones para Lobo". |
| F2 add dialog loading/error | Fixed | Error: "No se pudieron cargar los encuentros." with Reintentar, submit disabled (`rr-add-error-*.png`); loading: "Cargando los encuentros…", submit disabled (`rr-add-loading-*.png`); loaded: encounter Select; a normal open focuses "Cuántas". Residual R5. |
| F3 editor discards without asking | Fixed | Escape, X, Cancel and backdrop with edits open "¿Descartar los cambios?" focused on "Seguir editando"; Escape there returns to the editor with edits kept and focus on Nombre; Descartar closes and refocuses "Personalizar"; an unchanged editor closes directly (`rr-discard-mobile.png`). axe clean. |
| F4 segmented labels clip at 150% | Partly fixed | Add dialog HP options wrap ("Tirar 19d12 + 133" on two lines, `rr-t150-add-mobile.png`); no clipped source labels. Residual R3. |
| F5 targets below 44px | Partly fixed | Chips 44px tall; save checkbox rows 44–48px. CR thumbs 28x28; residual R4. |
| F6 menu overlays lose focus | Fixed | Duplicar, Eliminar and Completar la ficha return focus to "Más acciones para …" on all viewports. |
| F7 focus dropped on swaps | Fixed | SRD/archetype/paste steps focus their first field; Otras formas focuses the first card; add success focuses "Abrir el encuentro"; reveal focuses the alias field; setting an alias focuses "Revelar que es …"; "Ver todas las criaturas" focuses the search. |
| F8 picker accents/English | Fixed (nit left) | Console and SRD pickers: "dragon rojo jo" finds Dragón rojo …, "aguila" finds Águila, "Wolf" finds Lobo …. With the empty dropdown open axe still reports `aria-required-children` (Mantine empty listbox), and "dragon rojo jo" lists "Dragón rojo adulto" before "joven" ("jo" matches "rojo"). |
| F9 recharge label in name | Fixed | Name is the visible state ("Disponible · recarga 5–6"), described by the tracker label and the action hint; no `aria-pressed`. |
| F10 150% sheet action bar | Changed, regression | Bar is 171px at 150% (was 235px) but the secondary button label is clipped; see R1. |
| F11 actions last in tab order | Fixed | After the close button, Tab reaches Añadir a un encuentro, Personalizar, star, ⋯. |
| F12 sheet name | Fixed | `getByRole('dialog', { name: 'Dragón rojo adulto' })` resolves on phone and tablet. |
| F13 meta line breaks | Fixed | Non-breaking spaces; "CA 17 · PG 150" stays together (`rr-list-desktop.png`). |
| F14 visual details | Fixed, one regression | Archetype hover lighter than selected (`rr-archetype-hover-desktop.png`); phone dialog actions stack full width with the main action on top (`rr-add-success-mobile.png`, `rr-step-srd-mobile.png`); archetype drafts keep the auto type line; pasted alignment is read ("caótico malvado"); initiative rows show "mesa: Sombra alada" (`rr-console-rows-desktop.png`). Tag parsing regressed; see R2. |

### New and residual findings

#### R1 major: At 150% text on phones the sheet's secondary button label is clipped

- Where: `src/features/combat/ui/bestiary.css:215-229` (`.bst-actions-secondary` nowrap row,
  `min-width: 0` on the button) with Mantine's fixed-height Button label.
- Viewport: 390px, 150% text, Spanish and English. Measured label scrollWidth 131px vs clientWidth
  97px (es "Personalizar"), 113 vs 97 (en "Customise"); `rr-t150-actions-es-mobile.png` shows
  "Personali". It was readable before the F10 change. WCAG 1.4.4, same category as F4.
- Fix idea: let the secondary button grow (`flex: 1`) or wrap with auto height, or fall back to an
  icon button with the name in `aria-label` and a tooltip at this size.

#### R2 major: Drafts put the whole size and type into "Etiquetas", and "Generar" doubles it

- Where: `src/features/combat/ui/creature-draft.ts:213`: `/(([^)]+))/` has unescaped parentheses,
  so it captures everything before the comma instead of the text inside "( )".
- Viewport: all; Spanish and English. Reproduction: Personalizar the SRD wolf; Etiquetas shows
  "Bestia Mediana" (en Tags "Medium Beast"); press Generar and the type line becomes "Bestia Mediana
  (Bestia Mediana), sin alineamiento" (en "Medium Beast (Medium Beast), Unaligned"). A pasted
  "Grande gigante (goblinoide), caótico malvado" gives Etiquetas "Grande gigante (goblinoide".
- Impact: every SRD customisation, duplicate and paste starts with wrong tags, and regenerating the
  type line yields visibly wrong text that is then saved. Use `/\(([^)]+)\)/`.

#### R3 minor: Source control labels break mid-word at 150% on phones

- Where: `bestiary.css:36-45` (`overflow-wrap: anywhere`). `rr-t150-list-mobile.png`: "Toda|s",
  "Cam|paña", "Favor|itas". Nothing is lost, but one-word labels split at arbitrary letters. Prefer
  normal wrapping plus a 2x2 or full-width layout when the labels do not fit.

#### R4 minor: The CR slider's 44px hit area does not apply

- Where: `bestiary.css:61-65` targets `.mantine-Slider-thumb::after`, but RangeSlider thumbs only
  carry `mantine-RangeSlider-thumb` (measured class list; `::after` content `none`). Thumbs are
  28x28px. Target `.mantine-RangeSlider-thumb`.

#### R5 minor: Focus is dropped after "Reintentar" and after toggling trackers

- Where: `add-to-encounter.tsx:160` (Reintentar unmounts while loading; focus on BODY after the
  encounters load, all viewports); `creature-console.tsx:62, 178, 208` (`disabled={pending || …}`
  disables the recharge toggle and use pips during the request, so the browser blurs them; focus on
  BODY after Enter on either, all viewports).
- Impact: keyboard users lose their place on a control used every round. Keep the control enabled
  and ignore repeats while pending (or restore focus after the request), and focus the encounter
  field after a successful retry.

### Limitations

Same as the first review: Chromium emulation only, no screen reader or real iOS/Android, in-memory
fixture instead of hosted Supabase, image upload and stale-revision states not exercised, Default
class theme only. Many files outside the bestiary are modified in the working tree
(`amount-dialog.tsx`, `combat-log.tsx`, `dm-console.tsx`, `initiative-rail.tsx`, …); they were not
reviewed beyond what the bestiary flows touch.

### Verdict (re-review 1)

**CHANGES_REQUIRED** for source digest
`d7f9123659ae97b6c4ef196483a3327f42918e322196cf6f8f3491736558305b`. Resolved: F1, F2, F3, F6, F7,
F9, F11, F12, F13. Partly resolved: F4, F5, F8, F10, F14. Blocking for PASS: R1 and R2 (major).
R3–R5 and the F8 nit should be fixed or explicitly deferred. Request a focused re-review of the 150%
sheet actions, draft tag parsing, the slider hit area and tracker focus.

---

## Re-review 2 (2026-11-04): R1–R5 and the F8 nit

- Verdict: **PASS**
- Source fingerprint reviewed (`node scripts/check-ui-review.mjs --fingerprint`, stable before and
  after): `0eb562ba6e522f7d0ddf4075e59816f288a944040f9ecea29674a5826bdcf674`.
- Working tree: `git diff --ignore-cr-at-eol` shows only bestiary-related files; the combat files
  flagged in re-review 1 were line-ending-only and are restored.
- Method: same rules. A temporary spec ran in `identity-mobile`, `identity-tablet` and
  `identity-desktop` and was deleted; `playwright.config.ts` was restored byte-for-byte (md5
  `58a02d19…`). The delivery spec `tests/e2e/bestiary.spec.ts` passes 12/12 on this snapshot (all
  three projects). Captures: `docs/evidence/RYT-046/review/r2-*.png` (15 files), all inspected.

| Item | Status | Evidence (browser-tested) |
| --- | --- | --- |
| R1 150% sheet secondary label | Fixed | 390px at 150%: "Personalizar" 219x47, label 131/131px; "Customise" 113/113px; no clipping (`r2-t150-actions-{es,en}-mobile.png`). Bar 171px (es) / 142px (en); 117px at 100% (`r2-sheet-100-*-mobile.png`). Page overflow none. Nit: the nowrap secondary row is 34px (es) / 16px (en) wider than its box at 150%, so ⋯ sits in the bar's side padding; it stays fully on screen and tappable. |
| R2 draft tags | Fixed | Customise SRD wolf: Etiquetas "", Alineamiento "sin alineamiento"; Generar keeps "Bestia Mediana, sin alineamiento". Chain devil: Etiquetas "diablo", "legal malvado", Generar "Infernal Mediano (diablo), legal malvado". English: Tags "" / "Devil", Generate unchanged. All viewports. |
| R3 mid-word breaks | Fixed | At 150% on 390px the source labels hyphenate at syllables ("To-das", "Cam-paña", "Favo-ritas", `r2-t150-source-es-mobile.png`) instead of breaking at arbitrary letters; nothing clipped; English fits on one line; tablet single line. |
| R4 slider hit area | Improved, minor remains | The `::after` now applies (36x36px measured, thumb 28px), but a point 20px from the thumb centre does not hit it, so the effective target is about 36px, not 44px (the inset is measured from the padding box inside the thumb border). The full-width track and arrow keys remain usable. Use `inset: -12px` (or size the pseudo-element to 44px). Severity: minor. |
| R5 focus after Reintentar / trackers | Fixed | Enter on Reintentar moves focus to "Cuántas", where it stays after the encounters load. Recharge toggle and use pips keep focus during a slow write (`aria-disabled="true"` while busy); a second Enter during the write is ignored (one write recorded); focus stays on the control after the write with the new state ("Gastada · recarga 5–6", "Uso 1 de 3: gastado"). axe clean. |
| F8 nit ranking | Fixed in the console, nit remains in "Desde el SRD" | Console picker "dragon rojo jo": Dragón rojo joven first, and ArrowDown+Enter picks it. The new-creature "Desde el SRD" picker still lists "Dragón rojo adulto" first for the same text (the ranking is not applied there). Nit. |
| F8 axe on empty listbox | Classified: nit, accepted upstream limitation | Mantine renders the "nothing found" text inside `role="listbox"`, so axe reports `aria-required-children` only while an open dropdown has no options. The message is still exposed and announced, nothing is hidden or unusable, and it is transient. Not blocking; track as a known Mantine limitation (an `aria-live` empty message outside the listbox would remove it if wanted). |

### Remaining items (non-blocking)

- R4 (minor): CR slider thumb hit area is about 36px instead of 44px (`bestiary.css:63-67`).
- Nit: ⋯ overflows the secondary row into the bar padding at 150% on phones (`bestiary.css:215-236`).
- Nit: "Desde el SRD" picker ranking (`new-creature.tsx`, Select filter) differs from the console.
- Nit: axe `aria-required-children` on Mantine's empty open listbox (accepted, see above).

### Limitations

Chromium emulation only, no screen reader or real iOS/Android, in-memory fixture rather than hosted
Supabase, Default class theme only, 200% zoom and landscape phones not exercised. This re-review
re-tested R1–R5 and F8; the flows verified as fixed in re-review 1 were rechecked only through the
delivery spec and the scenarios above.

### Verdict (re-review 2)

**PASS** for source digest `0eb562ba6e522f7d0ddf4075e59816f288a944040f9ecea29674a5826bdcf674`.
No blocker or major finding remains. R4 (minor) and the three nits are recommended follow-ups and
can be fixed or deferred explicitly without invalidating this verdict; any source change makes the
review stale.
