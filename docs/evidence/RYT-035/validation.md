# RYT-035 verification: full review fixes and visual polish

Date: 2026-11-03. Scope: frontend only, no database change. Decision record:
[ADR 023](../../decisions/023-review-fixes-visual-polish.md).

## Review that produced the ticket

A frontend and UI/UX review covered every DM and Player screen (hub, DM Command Center and its
four panels, Party, sheet, creation wizard, inventory, shops admin and ledger, storefront buy,
sell and orders, settings) at 1366×768, 820×1180, 1180×820 and a 390×844 Pixel 7 profile, plus
light theme, English with the Wizard theme, 150% text and the main overlays. Captures used the
committed HTTP fixtures (`tests/e2e/fixtures`) against a Supabase-mode build.

## Fixed

| Finding                                                                  | Fix                                                                                      |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Shops shown as "Coming soon" in Active modules                           | One module catalogue (`campaigns/ui/module-catalog.ts`) for switches and navigation      |
| Planned modules could be enabled and appeared in Player navigation       | Switches for planned modules are disabled; navigation only lists implemented modules     |
| DM price modifier read "20 % discount for you"                           | DM-specific `admin.modifier.discount/markup` copy                                        |
| One quick resource step blocked every character's steppers               | `useResourceAction`: optimistic, queued per character (mutation scope)                   |
| Character changes refetched every query of the user                      | Invalidation scoped to the campaign                                                      |
| `crypto.randomUUID` fails on a LAN preview over http                     | `newRequestId()` with a `getRandomValues` fallback (unit tested)                         |
| Forbidden or missing sheet had no h1                                     | Heading on loading, error and not-found states                                           |
| Phone overlays painted the desktop drawer first                          | `usePhone` / `useWide` read the query on first render                                    |
| Phone bottom sheets were always full height                              | `--drawer-size-auto: auto` (Mantine 9 resolved `size="auto"` to an undefined variable)   |
| Red subtle and outline buttons were almost white in dark mode            | Mantine red variants map to the contrast-tested `--danger` token (≥4.96:1)               |
| `max-width: 48em/62em` rules overlapped `min-width` rules at 768/992px   | Phone and tablet rules use `47.99em` / `61.99em`                                         |
| Save pill stacked above dialogs                                          | z-index below Mantine overlays                                                           |
| Phone page heads pushed content below the fold                           | `PageHead`: h1, one-line lede, actions and refresh on one band; shorter DM lede          |
| Header campaign name wrapped; switch label crowded the phone header      | Ellipsis and a short "Jugador" label on phones (full accessible name kept)               |
| DM Command Center tabs hid panels behind a scroll on phones              | 2×2 grid on phones                                                                       |
| "Leave campaign" box broke the two-column layout; disabled role button   | Leave box inside the members column; inline "only DM" hint under the disabled button     |
| Party: holes in the resource grid, exhaustion pips wrapped 5+1           | Gold row, water/rations pair, exhaustion value in the label row and six pips on one row  |
| Party: redundant assignment badges and icon-only live-sharing toggle     | One "Player: name" badge; labelled `Switch` "Visible al grupo"                           |
| Three different exhaustion meters                                        | Read-only exhaustion is one dot meter (Player card and teammates)                        |
| Sheet "Temp HP" wrapped inside its button                                | Icon above a one-line label                                                              |
| Inventory "Sin carga" with 23 lb carried; tiny laptop tiles              | "Sin penalización"; larger tiles from 62em                                               |
| Slider thumb covered the middle mark; "+50 %" overflowed at 150%         | Marks sit below the thumb and stay bare numbers                                          |
| Ledger cards too narrow; ledger views clipped at 150%                    | 360px minimum order cards; shrinking segmented labels                                    |
| Storefront purse took a full card; kind chips wrapped; orders scope      | One-line purse, scrolling chips on phones, "orders in every shop" note                   |
| Hub: redundant RYTTA eyebrow, uneven cards, plain "Decline"              | `PageHead`, equal-height cards, red decline, full-width actions on phones                |
| Settings showed backend setup text and stale "modules still planned"     | Installation section only in demo mode; Back button when reached from the app            |
| Wizard "Save and exit" looked like text; SRD template field was empty    | Default button with icon; placeholder                                                    |
| Party "Satchel" button vs "Inventory" navigation                         | Same name as the destination                                                             |

## Independent ui-ux review

[Report](../ui-review/RYT-035/review.md). The first round on `dd34abb` returned CHANGES_REQUIRED:
two blocking findings (phone header and bottom bar wrapping at 150% text, and the DM Command
Center head filling the first phone screen at 150%), two major (shop title breaking inside
words, AC shown two ways) and minor items. All were fixed in `c9e651c`, and the focused re-review
returned PASS for source fingerprint
`ee12b28ee283d10eaf3b78bbbccec8bddd9afa5cc6655c11bff1a7c737a1b050`. Advisory note N1 (phone
refresh stamp announced instead of shown) is recorded in `docs/design-system.md`; N2 (campaign
name truncated in the DM header at 150%) is the accepted cost of a one-row header.

## Checks

- `npm run check`: typecheck, lint, architecture, docs, AI contracts, 162 unit/SQL tests, build.
- `npm run test:e2e` (all projects, chromium): see the delivery report for the final run.
- Review captures (92 screens and 32 variants, DM and Player, four viewports): no axe
  WCAG 2.1 AA violations, no horizontal overflow, no visible control under 44px, every screen
  has one h1.

## Evidence

`dm-center-mobile.png`, `dm-party-mobile.png`, `dm-sheet-mobile.png`, `player-party-mobile.png`,
`player-shops-mobile.png`, `item-sheet-mobile.png`, `party-150-mobile.png` (390px);
`dm-items-tablet.png`, `player-inventory-tablet.png` (820px); `dm-party-laptop.png`,
`dm-modules-laptop.png`, `settings-laptop.png` (1366px).

## Not tested

Real Supabase and Realtime (fixtures only), iOS Safari, phone landscape, the trade window flow
outside its e2e spec and the More drawer (unreachable with three implemented modules).
