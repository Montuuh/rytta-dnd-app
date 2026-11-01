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
- The `More` drawer appears only with more than five reachable destinations. The e2e
  regression test reaches it by enabling two planned modules (phone project only).
- Hosted Supabase was not exercised. No database or RLS changes are part of this ticket.

## Independent UI/UX review

Round 1 (source `3872bd3`): `CHANGES_REQUIRED`, recorded in `reviewer/review.md`. Fixes:

1. Blocker, focus lost: steppers, exhaustion pips and the module and revelation switches now
   use `aria-disabled` plus a handler guard instead of native `disabled` while the RPC runs.
   `Back to DM view` returns focus to the `Player view` switch. Regression test: `RYT-025
   keyboard focus stays on steppers, preview switch and More drawer choices`.
2. Major, full-screen More drawer: the sheet now sizes to its content (max 70dvh, full width)
   and sits flush at the bottom. The test asserts its geometry.
3. Phone rules use `max-width: 47.99em`, so a 768px tablet keeps the top row.
4. Choosing a destination in the More drawer focuses main content. Escape still returns focus
   to `More`.
5. Bottom bar labels wrap to two hyphenated lines at 150% text instead of truncating.
6. The Coming soon copy now says DMs can show planned modules as a preview page.
7. The tablet and laptop nav row has an edge fade with trailing padding.

The full e2e run after the fixes found one intermittent axe `aria-required-children`: the
Mantine focus placeholder inside the card `More actions` menu while it closed. It was fixed
with `withInitialFocusPlaceholder={false}`, and the affected specs passed twice in a row (36/36).

Round 2 (source `71e3b89`): `CHANGES_REQUIRED`. Six findings were fixed, but the revelation
switch still lost focus because `useCampaignAction` removed every cached campaign query
before refetching, which remounted the list. Visibility toggles (`revelationVisibility`,
`modules`) now only invalidate. Membership and role actions still remove private campaign
data first. The keyboard focus regression test now also toggles a revelation twice by
keyboard. Results: `npm run check` and format pass. E2E: characters and identity 102/102;
sheet, inventory, scaffold and preferences 78/78.

Round 3: pending a focused re-review.
