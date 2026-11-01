# RYT-025 verification

Date: 2026-11-01. Source: branch `claude/ecstatic-clarke-dz03w7`. Decision record:
[ADR 015](../../decisions/015-design-critique-navigation-widgets.md).

## Automated checks

| Check                                                    | Result                                                   |
| -------------------------------------------------------- | -------------------------------------------------------- |
| `npm run check` (typecheck, lint, contracts, unit, build) | Pass                                                     |
| `npm run format:check`                                   | Pass                                                     |
| `npm run test:e2e` (desktop, tablet, mobile, identity-*) | 177 passed with 2 workers                                |
| `npm run check:ui-review`                                | Pending the independent ui-ux verdict (see below)        |

The first full e2e run (6 workers on a 4-CPU container) had 70 failures. Most came from
selectors bound to the replaced controls: header language/theme buttons, `Mostrar a
jugadores` buttons, the `Vista Player` menu, card-level `Vincular jugador` and `Editar
recursos` buttons, and the Spanish `Player` role copy. Those tests were rewritten for the new
`menuitem`, `switch`, `tab` and card-menu roles; none were deleted or skipped. Some
character-sheet failures were 30s timeouts from CPU contention and passed unchanged with 2
workers. The run also found one real accessibility defect, fixed before the final run: axe
`aria-required-children` because the refresh control sat inside the DM `tablist`. The new
exhaustion pips first had duplicate accessible names; each pip now has a unique
`Exhaustion level N` label.

New e2e coverage:

- `character-sheet.spec.ts`: HP number pad, quick chips, backspace and clear, mode switch,
  live preview, focus return, hit-die pips spend/recover, condition chip toggle.
- `characters.spec.ts`: bottom bar on phones / single-row tabs on tablet and laptop, no
  planned modules in navigation, active link `aria-current`, exhaustion track set and step down.
- `identity.spec.ts`: DM tabs show one panel, audit segmented filter, module and revelation
  switches, Player view switch with banner and exit.

## Rendered evidence

Captures from the production build against the e2e Supabase HTTP fixture (dark unless named):

- Before: `before/campaign-m.png`, `before/members-m.png`, `before/sheet-m.png`.
- After, phone 390px: `campaign-m.png`, `members-m.png`, `party-m.png`, `sheet-m.png`,
  `inventory-m.png`, `create-m.png`, `pcampaign-m.png` (Player), `light-sheet-m.png`.
- After, tablet 820px: `campaign-t.png`.
- After, laptop 1440px: `campaign-d.png`, `members-d.png` (vertical tabs), `sheet-d.png`
  (three columns), `inventory-d.png`, `light-campaign-d.png`.

## Not covered

- Real iOS Safari and Android devices: pull-to-refresh, long press ×5 and safe-area insets were
  checked only with Chromium touch emulation and code review.
- The `More` drawer appears only with more than five reachable destinations. No current
  fixture enables that many modules, so it has code and keyboard review but no e2e assertion.
- Hosted Supabase was not exercised. No database or RLS changes are part of this ticket.

## Independent UI/UX review

Pending: see `reviewer/review.md` once the independent ui-ux review completes.
