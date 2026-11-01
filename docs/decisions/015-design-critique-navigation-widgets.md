# ADR 015: Bottom navigation, folded planned modules and table widgets

Status: accepted for `RYT-025`. Supersedes the parts of ADR 011 that placed direct `ES`/`EN`
and theme toggles in the header and listed planned modules in the navigation row, and the
part of ADR 012 that rendered every DM Command Center panel on one page.

## Context

A design critique of the deployed app (2026-11-01) found that on a 390px phone the stacked
module row wrapped into a column of 13 pills (about 560px) before any campaign content. Eight
of those destinations were "Planned module" placeholders, repeated again as home cards and as
DM visibility cards. The DM Command Center showed tabs but rendered all panels at once
(about 4000px). Resource steppers, hit dice, conditions and the module/revelation visibility
controls used plain buttons. Type sizes were about 60 loose values, badges were 10px uppercase,
and phones forced body copy to 14px. The user asked for all proposals to be implemented.

## Decision

- **Navigation.** Only reachable destinations are navigation items. Phones (`< 48em`) use a
  fixed bottom bar (64px items, 22px icons, 12px labels, safe-area padding). When there are more
  than five destinations, the first four are shown and the rest go in a `More` bottom drawer
  (Mantine `Drawer`, Escape closes it and focus returns to its trigger). Tablets and laptops keep
  a single non-wrapping, horizontally scrollable row. The DM entry is second in both and uses a
  shorter bottom label (`Mando DM` / `DM Command`) that the full accessible name contains.
- **Header.** Row 1 keeps the brand, a DM `Player view` switch (`role="switch"`) and the
  Profile menu. Appearance and language become non-closing toggle items in the Profile menu.
  The `App setup` dialog keeps the full preferences. With one Player, the switch enters the
  preview directly. With several, a controlled popover lists them. While the preview is on, a
  sticky status banner names the viewed Player and offers `Back to DM view`.
- **Campaign home.** DMs see the available modules (implemented or enabled) as cards with one
  shared visibility badge shape (icon plus text, success tint when visible). Planned modules
  fold into one `Coming soon` accordion. Players see only their enabled modules, as larger tiles.
  Counts use i18next plurals. The Spanish role label is `Jugador`.
- **DM Command Center.** Mantine `Tabs` show one panel at a time: vertical on `>= 62em`,
  horizontal and scrollable below that. Module visibility is a compact switch list with 56px
  rows. Revelations use a `Visible to the party` switch. The audit log is a `Timeline` with
  relative timestamps and a `SegmentedControl` filter. A single `RefreshControl` sits outside
  the tablist.
- **Party.** Each card has one primary call to action from the sheet state. Linking, unlinking,
  editing resources and opening the sheet move into a per-card `More actions` menu. Resource
  values use the h2 size. A short press on a stepper changes the value by 1. Holding it for
  500ms changes it by 5, and every press still goes through the idempotent RPC. Exhaustion
  from 0 to 6 is a six-step track of 44px buttons. Values above 6 keep the numeric stepper.
  Touch screens get pull-to-refresh as an extra to the visible refresh button.
- **Character sheet.** HP is a `RingProgress` (temporary HP drawn as a second segment) with the
  −1/+1 quick buttons. Damage, Heal and Temp open a dialog with a mode `SegmentedControl`, the
  typed amount field, quick chips (1/5/10), a 3×4 number pad and a live result preview. Hit
  dice are tappable pips labelled with the die. Conditions are toggle `Chip`s. At `>= 75em`
  vitals and attacks stick in a left column next to the tabs, which gives three columns on the
  summary.
- **Wizard and inventory.** The class picker becomes a 2/3/4-column icon card grid with a
  large hit die. Satchel tiles scale with `clamp()`, and the phone category rail fades at its
  edge to show that it scrolls. Route headings no longer draw a focus ring on programmatic focus.
- **Type and layout tokens.** `--fs-display`, `--fs-h1..h3`, `--fs-stat`, `--fs-body`,
  `--fs-meta` and `--fs-tag` (12px minimum) replace the loose sizes. Badges are sentence case.
  The content width is `--content-max` (1280px), or 1360px in DM layouts.

## Consequences

- Phones reach campaign content at once. Navigation never shows a link to a placeholder.
- DMs still enable planned modules from the switch list. An enabled planned module then becomes
  a reachable placeholder page, as before.
- New shared infrastructure: `relative-time`, `RefreshControl`, `PullToRefresh` and
  `useLongPress` in `src/shared`. All are generic and import no feature code.
- E2E selectors moved from buttons to `switch`, `tab`, `menuitem` and group roles. Tests that
  pinned the old header toggles or panel layout were updated rather than deleted.
- Pull-to-refresh and long press are not verified on real iOS Safari. Chromium touch emulation
  only.
