# ui-ux review, wave 2: F1-F6 re-review, RYT-031, RYT-032, RYT-033
n> Screenshots (227 PNG) were kept out of the repository for size; verdict superseded by final-r2.


- Reviewer: `ui-ux` (independent, role `.codex/agents/ui-ux.toml`)
- Date: 2026-11-03
- Source snapshot: `main` at `5f742cb`. Implementation code was not modified. The working tree
  already had four modified `docs/evidence/RYT-031/*.png` files and an untracked root
  `CLAUDE.md` before this review; neither came from this review.
- Verdict: **CHANGES_REQUIRED**

## Method

I ran the browser checks myself. A temporary Playwright config built the identity bundle
(`VITE_DATA_MODE=supabase` with the routed RPC fixtures from `tests/e2e/fixtures`) and served
it on port 4574. The config, specs and build output were deleted afterwards. Projects:
390x844 touch (`m-`) and 820x1180 touch (`t-`). Coverage: es/en x dark/light, 150% root font
size, reduced motion, eight class themes (default, warlock, druid, paladin, barbarian, rogue,
wizard; bard via keyboard), axe (wcag2a/2aa/21aa), a scan for targets under 44px, horizontal
overflow, label truncation measurements (`scrollWidth` against `clientWidth`, and the right
edge against the card padding), keyboard, Escape and focus return. 54 review scenarios ran,
plus 8 focused debug probes. I inspected the screenshots by eye.

Axe reported no violations and there was no horizontal overflow in any scenario.
Every interactive target was at least 44px. The only flagged control was a 24px checkbox
on the sheet page behind the history drawer, which predates RYT-031.
I did not re-run the full e2e suite.

Note: after the delete-impact step, the RYT-032 captures for price sync, add-to-shop, forge
and the chooser were taken at 150% text, because hash navigation keeps the injected style. I took
separate 100% captures (`*-100-032-*`, and the themed `*-forge.png` from the RYT-033 runs).

## Findings

### W2-1 - Major - RYT-031: the "Historial" button label is clipped on phones

- Paths: `src/features/characters/ui/sheet/character-sheet.tsx:121-140` (header `Group`
  `wrap="nowrap"`), `src/features/characters/ui/sheet/sheet-history.tsx:34-41`.
- Viewport: 390px, es and en, dark and light (DM, sheet page).
- Repro: sign in as the DM and open Arin's sheet.
- Observed: the button reads "Hist" (es) or "Histo" (en). Its label `scrollWidth` is larger
  than its `clientWidth`. "Volver a Grupo" and "Editar ficha" wrap to two lines beside it
  (`m-es-dark-031-sheet.png`, `m-en-light-031-sheet.png`). It also uses Mantine
  `variant="default"`, the stock grey/white button the user asked to avoid.
- Impact: the entry point to the new audit history is unreadable on the main target device.
- Expected: let the header wrap or use a 44px icon button with an accessible name (and an
  optional tooltip) on phones, styled with the theme tokens.

### W2-2 - Medium - F3 is still open: the shop name wraps although the row has room

- Paths: `src/app/styles.css:2785-2792` (`.shop-title`), `2826-2838` (`.shop-picker-trigger`,
  `margin-left: -8px; max-width: 100%`), `2843-2847` (`.shop-picker-name`,
  `max-width: calc(100% - 28px)`).
- Viewports: 820px (and 390px), es/en, dark/light, as the Player on Tiendas.
- Observed: "Mercado del puerto" and "El Yunque de Ámbar" still break onto two lines in a
  665px row, and the badges sit beside the name (`t-en-light-storefront-1.png`,
  `t-es-dark-tooltip.png`). Measured: the name needs 198.6px on one line but is capped at
  190.6px. The h2 shrink-to-fit width loses the trigger's -8px margin, and the name's
  percentage max-width then removes exactly the 8px it needed.
- Expected (unchanged from wave 1): keep the name on one line while it fits, and drop the
  badges to the next row first.

### W2-3 - Medium - RYT-031: the DM assignment badge is truncated on phones

- Paths: `src/features/characters/ui/party.tsx:199-203` (Badge), `235-243` (new
  `LiveShareToggle` in the same header row).
- Viewport: 390px, es and en, all themes (DM Party).
- Observed: "Asignado a un j…" and "Assigned to a P…" (label 97px wide, truncated)
  (`m-es-light-031-dm-party.png`). At 820px the label fits.
- Impact: the assignment state is cut off. The new 44px toggle takes the header width the
  badge used.
- Expected: let the badge wrap, shorten the copy ("Asignado" / "Assigned"), or move the toggle
  out of the title row on phones.

### W2-4 - Low - RYT-033: the Hearth tagline overflows its card at 390px in Spanish

- Path: `src/pages/settings-page.css:101-105` (`.choice-hint` has no `overflow-wrap`).
- Viewport: 390px, es, 100% text, all schemes.
- Observed: "Ámbar predeterminado" runs 12px into the right padding and touches the border
  (`m-es-dark-033-hearth-card.png`, `m-es-dark-warlock-033-settings.png`). It fits at 150%
  (one column) and at 820px.

### W2-5 - Low (not blocking) - F6 residual: the counter-offer still repeats 15 → 18

- Path: `src/features/shops/ui/orders.tsx:91-127` (`GoldFlow` with `counter`) and the line
  row above it.
- Observed: the compare box is gone (improvement), but the line row shows "~~15 po~~ 18 po" and
  the "Pagarás" row repeats "~~15 po~~ → 18 po". At 390px the arrow and the new total wrap onto
  a second line, away from the struck amount (`m-es-light-counter-card.png`). The pills are down
  to the kind label plus "Te toca responder". This is acceptable but could be tighter.

### W2-6 - Low - RYT-032 polish

- `src/features/inventory/ui/price-sync.tsx:81`: the struck text includes the word "Ahora" or
  "Now" ("~~Now 50 gp~~ → 60 gp"), so the struck label says "now" for the old price. Strike
  only the amount, or label it "Antes"/"Was" (`t-en-light-032-price-sync.png`).
- The disabled "Eliminar objeto" in the blocked dialog uses Mantine's stock grey disabled
  fill, not theme tokens (`m-en-light-032-delete-blocked.png`).
- Unselected rarity gems all share one neutral tint, so rarity reads from the label only
  (`t-en-light-wizard-forge.png`). This is an observation and not blocking.

### Process note (not a UI defect)

`tests/e2e/characters.spec.ts:519-523` writes `docs/evidence/RYT-031/*.png` on every
mobile/tablet run, unlike RYT-032, which is gated by `RYT_EVIDENCE`. This explains the
modified RYT-031 evidence files in the working tree.

### Pre-existing, outside this delivery

- The sheet's "Damage" button reads "Damag" at 390px in en (`m-en-light-031-sheet.png`).
- The labels of the DM shop visibility segmented control ("Todo el grupo", "Algunos
  personajes") are clipped at 390px (`m-es-dark-warlock-shops.png`).

## Re-review of wave-1 findings

| Finding | Status | Evidence |
| --- | --- | --- |
| F1 DM preview equip/unequip/portrait | Fixed. 11/11 sockets enabled; unequip through the drawer returns focus to "Torso: vacío"; portrait camera control present; sheet shows "Editar ficha" in preview | `*-es-dark-f1-preview-*.png` |
| F2 picker at 390px | Fixed. Dropdown x=16, w=320 inside 390; Escape returns focus to the trigger | `m-*-picker-open.png` |
| F3 title/badge wrapping | **Open** (W2-2) | `t-*-storefront-*.png` |
| F4 discount badge at 150% | Fixed. Badge wraps to two lines, not truncated | `m-es-dark-150-storefront-1.png` |
| F5 themed tooltip | Fixed. Dark bg `--app-raised` #2a1f16 / text #f5ebd6; light #efe3cf / #2a1f16; Escape closes | `*-tooltip.png` |
| F6 counter card | Improved; residual Low (W2-5) | `*-counter-card.png` |

## New deliveries: verified OK

- RYT-031, Player: the own card keeps its resources. Bea's compact card shows HP 9/24,
  +3 temporary, an AC 16 shield, exhaustion pips and Poisoned/Prone, with no gold, water or
  rations. Cato is absent. The card is readable in all four combinations and at 150%.
- RYT-031, DM: the per-card toggle is 44x44 with `aria-pressed`, the tooltip opens on focus,
  and Enter toggles while keeping focus. Hidden cards show "Oculto al grupo" with an icon,
  not colour alone. The design system names `Switch` for visibility toggles; the icon toggle
  is acceptable with its text note.
- RYT-031, history drawer: right side at 820px and a bottom sheet at 390px. It has a
  timeline with icons, diffs and the author. Escape closes it and focus returns to the button.
- RYT-032: the delete dialog lists its impact (shops, holders, "nothing is taken away"),
  focuses "Conservar", and when blocked shows the open-orders alert with Delete disabled;
  Escape returns focus to the row action. The price-sync dialog lists checkbox cards per shop.
  The add-to-shop drawer is a bottom sheet at 390 (375x844) and on the right at 820 (x=175,
  w=630). The forge has a live preview, category tiles, rarity gems, a dashed drop zone and
  an icon grid, with arrow-key radios and a visible focus ring. The "Añadir objeto" chooser
  offers two large option cards, existing search with a stepper, and Back; Escape returns
  focus. Everything passed axe at 100% and 150%.
- RYT-033: the profile menu has only "Mis campañas", "Ajustes" and "Cerrar sesión", with no
  toggles. Settings has radio cards with check badges. Arrow keys change the theme
  (Hearth→Barbarian→Bard), and Tab moves to the Language group. The theme applies to header,
  nav, buttons, forge, party and shops in the eight themes checked, in both schemes. Labels
  fit at 150%. Axe is clean.

## Limitations / not tested

- Routed fixtures only: hosted Supabase was not tested, and RYT-031/032 migrations were not
  verified as applied. Real iOS/Android touch, screen readers and drag-and-drop onto the
  drop zone were not tested. The tooltip tap toggle was tested only as a focus emulation.
- Six class themes (bard as a full page, cleric, fighter, monk, ranger, sorcerer) were not
  captured by me; the implementer's axe loop covers every theme on Settings.
- 1440px desktop was not re-captured in this wave.
- The full-page phone captures show the fixed bottom bar over the content. This is a capture
  artifact and not a defect.

## Evidence

`docs/evidence/ui-review/wave2/*.png`. Naming: `{m=390|t=820}-{lang}-{scheme}[-{theme}][-150|-100]-{screen}.png`.
