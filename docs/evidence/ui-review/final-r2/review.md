# ui-ux focused re-review: final findings FW-1..FW-3 and T-1..T-7

- Reviewer: `ui-ux` (independent, role `.codex/agents/ui-ux.toml`)
- Date: 2026-11-03
- Source snapshot: `main` at `d041829` (fix commit `966ff00`). Fingerprint
  `8515228facb65626e5870a1f2496b3a76f022ee63ad1dabf9eae9bc104b0c9c0`.
  Implementation code was not modified.
- Scope: the findings of [the final review](../final/review.md), plus a class-theme spot check
  (Warlock) on the trade window. Tickets RYT-028..RYT-034.
- Verdict: **PASS**

## Method

Same method as the final review. A temporary Playwright config built the identity bundle
(`VITE_DATA_MODE=supabase`, routed RPC fixtures, shared in-memory `tradeServer()` for two browser
contexts) and served it on port 4574. The config, spec, build output and logs were deleted
afterwards. Projects: 390x844 touch (`m-`) and 820x1180 touch (`t-`). 16 scenarios passed, with
88 measurement records: es/en, dark/light, 150% text, reduced motion, Warlock dark, axe
(wcag2a/2aa/21aa), a scan for targets under 44px, viewport overflow, text clamping, element
overlap, focus location after Escape and keyboard checks. I inspected the screenshots by eye.

Axe reported no violations. No targets under 44px were found, and there were no page errors in
any scenario. The full e2e suite was not re-run by me.

## Results

| Finding | Status | Evidence |
| --- | --- | --- |
| FW-1 sheet header at 390/150% | Fixed. The back label wraps to two lines and the document is 375px (no overflow). "Editar ficha" ends at x=373; nothing is clipped. 100% and 820 unchanged | `m-es-dark-150-fw1-sheet-header.png`, `m-es-dark-100-fw1-sheet-header.png` |
| FW-2 badge at 150% | Fixed. "Asignado a un jugador" wraps to two lines inside the card and is not truncated | `m-es-dark-150-fw2-bea-head.png` |
| FW-3 disabled delete | Fixed. Danger-tinted fill, danger text and a dashed border from tokens in light and dark (no Mantine grey) | `*-fw3-delete-blocked.png` |
| T-1 phone status/partner offer | Fixed. The status line now sits directly above "Aceptar el trato" and is in view at 390 at 100% and 150%, tinted with an icon when the offer changed. A "Bea da · 1 objeto · 0 po" summary with a seal sits beside it and scrolls to the partner column. Hidden on 820 | `m-*-window-unlocked.png`, `m-es-dark-window-peek-scrolled.png` |
| T-2 stock stepper | Fixed. Themed segmented stepper (tokens, accent icons, themed disabled, 3px focus ring), 44px targets, follows Warlock | `m-en-light-stepper-focus.png`, `*-picker.png` |
| T-3 slot names at 150% | Fixed. Slots widen to two columns at 150%. Names are not clamped ("Poción de curación"), and the quantity sits in the top row without overlapping the icon (0 overlaps at 390/820) | `*-es-light-150-window-partner-accepted.png` |
| T-4 phone picker | Fixed. A content-height bottom sheet (top 405, bottom 0, height 439 of 844) with rounded top corners and a full-width "Dar" in the thumb zone | `m-*-picker.png` |
| T-5 listbox keys | Fixed. One Tab stop (`tabindex` 0/-1/-1). ArrowDown moves focus and selection together, and End/Home work | log only |
| T-6 picker focus return | Fixed. After Escape and after picking, focus returns to the add slot. The first Escape closes only the picker, and a second Escape minimizes to a focused dock (390 and 820) | log only |
| T-7 empty deal | Fixed. Accept is disabled with a themed dashed look, and the status reads "Añade un objeto u oro para poder aceptar." | `*-window-empty.png` |
| Class theme (Warlock, dark) | Accent, secondary (add slot, changed notice), steppers, seals and accept follow the theme at 390 and 820. Axe is clean | `*-es-dark-warlock-*.png` |

## Non-blocking observations (Low, follow-up polish)

- N-1: at 820 with 100% text the slot grid now has 3 columns, so the 8 slots sit in a 3/3/2
  layout with a gap at the end (`t-es-dark-window-unlocked.png`). The minimum slot width in
  `src/features/trades/ui/trades.css:79-80` (`max(4.5rem, …)`) wins over a quarter of the column.
  A 4x2 or 2x4 layout would read cleaner.
- N-2: in the picker the quantity stepper border stretches to the full sheet/modal width while
  its buttons stay at the left, leaving an empty bordered area (`t-es-dark-picker.png`,
  `m-es-dark-picker.png`). `.trade-picker-amount` is a column flex container
  (`trades.css:454-460`) that stretches `.trade-stepper`.
- N-3: in light mode the phone sheet header keeps the body parchment while the sheet body uses
  `--app-surface`, so a visible band separates them (`m-en-light-picker.png`).
- The themed disabled delete is strongly tinted. It stays distinguishable from the enabled solid
  danger button by its dashed border and the alert above it, so this is not a defect.

## Limitations / not tested

- Routed fixtures only: hosted Supabase, Realtime and the new
  `20261103160000_trade_empty_guard.sql` migration were not tested. That migration is backend and
  outside UI review.
- No real devices, iOS Safari or screen readers. Only one class theme (Warlock, dark) was checked
  on the trade window. The 1440px viewport was not re-captured in this pass.
- Approval applies only to the fingerprinted source snapshot above.

## Evidence

`docs/evidence/ui-review/final-r2/*.png` (47 files). Naming:
`{m=390|t=820}-{lang}-{scheme}[-150][-theme]-{screen}.png`.
