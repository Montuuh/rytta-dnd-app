# ui-ux review, final wave: W2-1..W2-6 re-review and RYT-034 player trades

- Reviewer: `ui-ux` (independent, role `.codex/agents/ui-ux.toml`)
- Date: 2026-11-03
- Source snapshot: `main` at `af95cec`. Implementation code was not modified. The working tree
  already had an untracked root `CLAUDE.md` and `docs/evidence/ui-review/wave2/` before this review.
- Verdict: **CHANGES_REQUIRED**

## Method

I ran the browser checks myself. A temporary Playwright config built the identity bundle
(`VITE_DATA_MODE=supabase`, routed RPC fixtures from `tests/e2e/fixtures`, including the shared
in-memory `tradeServer()` for two browser contexts) and served it on port 4574. The config, spec,
build output and logs were deleted afterwards. Projects: 390x844 touch (`m-`), 820x1180 touch
(`t-`) and 1440x1000 (`d-`, for W2-2 and one trade run). Coverage: es/en, dark/light, 150% root
font size, reduced motion, axe (wcag2a/2aa/21aa), a scan for targets under 44px, horizontal
overflow and clipped-text measurement (`scrollWidth` against `clientWidth`, text range against the
card padding), Tab cycling inside dialogs, Escape and focus return. 16 scenarios passed in the
final run (5 skipped by design for viewports), plus a first run of 42 measurements and 1 probe.
I inspected the screenshots by eye. I did not re-run the full e2e suite.

Axe reported no violations in any scenario. No interactive target under 44px was found in the
trade dialogs, the dock, the Party entry points or the W2 screens. Clipped-text hits on
`VisuallyHidden` text (for example "Oro que da Bea:") are expected and not defects.

## Re-review of wave-2 findings

| Finding | Status | Evidence |
| --- | --- | --- |
| W2-1 sheet header at 390 | Fixed at 100%: 44px themed icon buttons with names and tooltips; labelled buttons at 820; focus returns to "Historial" after Escape (probe, 500 ms settle). **Regression at 150%** (FW-1) | `m-*-w2-1-sheet-header.png`, `m-es-dark-150-w2-1-sheet-header.png` |
| W2-2 shop name single line | Fixed at 390, 820 and 1440 in es/en: one line, badges drop to the next row on phones and sit beside the name at 820/1440 | `*-w2-2-storefront-market.png` |
| W2-3 assignment badge vs toggle at 390 | Fixed at 100% (toggle wraps to its own line, no overlap, badge not truncated). **Still truncated at 150%** (FW-2) | `m-*-w2-3-dm-party.png`, `m-es-dark-150-w2-3-bea-head.png` |
| W2-4 `.choice-hint` overflow | Fixed: no tagline crosses the card padding at 390/820 (hyphenates "predetermi-nado") | `*-w2-4-settings-themes.png` |
| W2-5 counter-offer price | Fixed: the struck 15 po appears once on the line row, on one line; "Pagarás" shows 18 po once | `*-es-light-w2-5-counter-card.png` |
| W2-6 price sync strike / disabled delete | Strike fixed (only the old amount is struck). **Disabled delete still stock grey in light** (FW-3) | `*-w2-6-price-sync.png`, `*-w2-6-delete-blocked.png` |

## Findings

### FW-1 - Medium - W2-1 regression: the sheet header overflows at 390px with 150% text

- Paths: `src/features/characters/ui/sheet/character-sheet.tsx:133` (`Group wrap="nowrap"`),
  `src/app/styles.css:669-674` (`.sheet-back` `flex-shrink: 0; white-space: nowrap`),
  `character-sheet.tsx:157-167` and `sheet-history.tsx:44-55` (`ActionIcon size={44}` scales to
  about 66px with the root font).
- Viewport: 390px, es dark (also measured in en), 150% text, DM on Arin's sheet.
- Observed: the document is 391px wide; the "Editar ficha" icon button ends at x=391 and is cut
  by the viewport edge (`m-es-dark-150-w2-1-sheet-header.png`).
- Impact: horizontal scroll and a clipped primary action at large text on the target device.
- Expected: allow the back link to shrink/wrap (or drop its label to an icon with name) or let the
  header row wrap when the actions do not fit.

### FW-2 - Low - W2-3 residual: the assignment badge truncates at 150% on phones

- Paths: `src/features/characters/ui/party.tsx:199-203`, `src/app/styles.css:3670-3673`.
- Viewport: 390px, es dark/light, 150% text, DM Party.
- Observed: "Asignado …" (label 190px needed, 103px available) (`m-es-dark-150-w2-3-bea-head.png`).
  Fine at 100% and at 820.
- Expected: let the badge label wrap, or use the shorter "Asignado"/"Assigned" copy.

### FW-3 - Low - W2-6 residual: the disabled "Eliminar objeto" keeps Mantine's stock fill in light

- Path: `src/app/styles.css:4209-4215`. The rule sets `--button-bg`, `--button-color` and
  `--button-bd`, but Mantine's disabled state paints `--mantine-color-disabled*` directly, so the
  rule never applies.
- Viewport: 390 and 820, en light (blocked delete dialog for "Espada larga").
- Observed: background `rgb(233,236,239)`, text `rgb(173,181,189)`, transparent border; no dashed
  danger tint (`m-en-light-w2-6-delete-blocked.png`, `t-en-light-w2-6-delete-blocked.png`). Dark
  looks themed only because the class themes override Mantine's dark slots.
- Expected: override `background-color`/`color`/`border` on `:disabled, [data-disabled]` (or the
  Mantine disabled variables) with theme tokens.

### T-1 - Medium - RYT-034: on phones the trade status line and the partner's gold are off-screen

- Paths: `src/features/trades/ui/trade-window.tsx:201-214` (status rendered after both columns),
  `src/features/trades/ui/trades.css:474-497` (stacked layout, sticky footer).
- Viewport: 390px, es/en, dark/light (100% and worse at 150%).
- Repro: both open the trade, Bea accepts, Arin adds one gold.
- Observed: on Bea's screen the only visible change is that her seal opens; "La oferta cambió:
  los dos tenéis que aceptar de nuevo." sits below the partner column, behind the sticky footer
  (`m-es-dark-034-window-unlocked.png`; compare `t-es-dark-034-window-unlocked.png`, where it is
  visible). The same applies to "Bea ha aceptado esta oferta" and "Guardando tu oferta…". Arin's
  offered gold is also below the fold when Bea reviews before accepting.
- Impact: the "any change unlocks both" rule is the key trust moment of the feature; on the main
  device the explanation is hidden, and a player can accept without having seen the partner's
  gold. The `aria-live` region still announces it for screen readers.
- Expected: show the status next to the seam or directly above the accept button on phones, and
  make the partner offer reachable without scrolling (for example compact empty slots or put the
  partner summary near the footer).

### T-2 - Medium - RYT-034: the gold and quantity steppers use stock Mantine buttons

- Path: `src/features/trades/ui/stepper.tsx:345-352` and `368-375` (`ActionIcon variant="default"`).
- Viewport: all, light scheme (dark is masked by the theme's dark slots).
- Observed: white buttons with a grey border and a grey `#e9ecef` disabled "−"
  (`m-en-light-034-picker.png`, `t-en-light-034-window-empty.png`, `m-es-light-150-034-picker.png`).
- Impact: conflicts with the user's "no stock buttons" preference and with the themed sheet
  steppers; does not follow the class theme.
- Expected: themed stepper buttons with tokens (raised/border/accent) and a themed disabled state.

### T-3 - Medium - RYT-034: slot names are unreadable at 150% text

- Path: `src/features/trades/ui/trades.css:74-136` (fixed 4-column grid, `--fs-tag` text,
  2-line clamp, `.user-copy` `overflow-wrap: anywhere`; quantity badge absolutely positioned).
- Viewport: 390 and 820, es light, 150% text.
- Observed: "Poció n de..", "Gema de…", "Añadir un…", and the "×2" badge collides with the icon
  (`m-es-light-150-034-window-partner-accepted.png`, `t-es-light-150-034-window-partner-accepted.png`).
- Impact: at large text the player cannot tell which item is on the table without opening it.
- Expected: fewer columns or wider slots at large text, wrap on word boundaries, keep the
  quantity clear of the icon.

### T-4 - Low - RYT-034: the phone picker is a full-height panel, not a bottom sheet

- Path: `src/features/trades/ui/item-picker.tsx:284-295`.
- Viewport: 390px, all schemes.
- Observed: the drawer content measures top 0 / bottom 0 (full height); the list and "Dar" occupy
  the top half and the rest is empty (`m-es-dark-034-picker.png`).
- Expected: a content-height sheet anchored to the bottom (with a max height), with the primary
  action in the thumb zone.

### T-5 - Low - RYT-034: picker listbox without arrow-key navigation

- Path: `src/features/trades/ui/item-picker.tsx:215-237` (`role="listbox"` / `role="option"`
  buttons).
- Observed: ArrowDown on the first option does not move focus or selection; each option is a
  separate Tab stop. Axe passes, but the listbox keyboard contract is not met.
- Expected: roving arrow keys, or drop the listbox roles and use a radio group or plain buttons.

### T-6 - Low - RYT-034: focus after closing the picker lands on the window, not the slot

- Path: `src/features/trades/ui/trade-window.tsx:251-262` (picker unmounted on close).
- Viewport: 390 and 820.
- Observed: after Escape in the picker, focus is on the trade dialog container ("Trueque con
  Bea"), not on "Añadir un objeto" or the filled slot that opened it. A second Escape correctly
  minimizes to a focused dock.
- Expected: return focus to the slot that opened the picker.

### T-7 - Low (observation, not blocking) - accepting an empty trade is allowed

- Path: `src/features/trades/ui/trade-window.tsx:242`. "Aceptar el trato" is enabled while both
  sides offer nothing (`t-en-light-034-window-empty.png`). Consider disabling it with a hint.

## RYT-034: verified OK

- Party: "Comerciar" sits on teammate cards as a full-width 44px row with icon and accessible name
  "Comerciar con Bea"; "Proponer un trueque" opens a menu of characters with 44px items; Escape
  returns focus to the trigger. While trading, the partner card reopens the trade.
- Invitation: centered on 390/820/1440, focus on "Abrir el trueque", focus trapped (Tab cycles
  Rechazar → Decidir más tarde → Abrir el trueque), ring timer with an accessible name, Escape
  postpones to a dock that receives focus and sits above the phone bottom bar (dock 714-768, nav
  at 779). "Rechazar" notifies the initiator. The initiator gets a "Esperando a Bea · m:ss" dock
  with a 44px withdraw button.
- Window: full screen on phones, two columns with a seal seam at 820/1440, eight slots per side,
  gold stepper with purse, seals lock per side with text ("Aceptado"/"Editando") and icons, not
  colour alone. Any change reopens both seals; double accept completes; Tab order inside the
  window is logical and trapped; Escape minimizes to a focused "Volver al trueque con Bea" dock.
- Completion: centered summary with Recibes/Entregas regions, focus on "Hecho"; the stamp
  animation is `none` under reduced motion. History card lists both sides with date.
- Picker: modal on 820/1440, drawer on phones, focus moves to the quantity input.
- Copy is complete in es and en; light and dark contrast passes axe; no page errors.

## Limitations / not tested

- Routed fixtures only: hosted Supabase, Realtime delivery (stubbed closed; the polling fallback
  ran) and the RYT-034 migration were not tested. Real devices, iOS Safari and screen readers were
  not tested. The fixture keeps Party gold at 25 while the trade server holds 120/109, so the purse
  shown in the trade window and the Party card disagree; this is a fixture artefact.
- Class themes other than Default were not captured for RYT-034.
- Full-page captures show fixed elements (dock, bottom bar) over content; that is a capture
  artefact.
- The pre-existing "Damag" label at 390 en and clipped resource labels at 150% are outside scope.

## Evidence

`docs/evidence/ui-review/final/*.png` (60 files). Naming:
`{m=390|t=820|d=1440}-{lang}-{scheme}[-150]-{w2-N|034}-{screen}.png`.
