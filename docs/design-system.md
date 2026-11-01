# Design system

A quiet field journal: warm paper, forest green, serif headings and readable system-font
body text. Clear hierarchy suits dim tables and short mobile visits. This shell is the
foundation, not final design approval for every gameplay screen.

## Appearance and language

Dark is the first-visit default, regardless of the OS preference. The warm hearth palette
uses background #140F0B, surface #1E1610, raised surface #2A1F16, warm cream text #F5EBD6,
secondary sand text #CBB699 and amber/orange accents #EDA145. Warm gold #F6C478 is the focus
indicator. Filled amber controls use deep espresso text #181009, including their hover state.

Light mode uses warm parchment #F7EFE2, surface #FFFDF9, text #2A1C11, secondary text #664F3A
and roasted chestnut accents (#6E3410 for primary buttons). Focus uses #844112. Both palettes
preserve the same hierarchy; the palette is a product choice verified with contrast tests.

Semantic tokens live in src/app/styles.css and feed Mantine variables. Avoid hardcoded
light backgrounds or white text on pale dark-mode accents. The header has no left sidebar.
Row 1 shows the logo, the RYTTA brand and the campaign name, plus a DM `Player view` switch
and a unified Profile menu (My campaigns, appearance toggle, language toggle, App setup,
Sign out). Tablets and laptops show reachable modules in a second row: one non-wrapping,
scrollable line. Phones (< 48em) use a fixed bottom bar with up to five destinations; when
there are more, the extras go in a `More` drawer. Planned modules are never navigation items.
They fold into the campaign home `Coming soon` accordion and the DM module switch list. A
sticky banner marks the Player preview. All controls have 44px targets. Preferences persist
locally and remain usable in memory if storage is blocked (ADR 015).

## Type scale and layout

Use the fluid tokens instead of literal sizes: `--fs-display` (HP), `--fs-h1..h3`,
`--fs-stat` (stat values), `--fs-body` (16px; never shrink body copy on phones),
`--fs-meta` (14px) and `--fs-tag` (12px minimum for badges and labels). Badges are sentence
case. Content width is `--content-max` (1280px); DM layouts use 1360px. Reuse
`RefreshControl` for refresh actions (icon button plus a visible relative timestamp),
`PullToRefresh` as a touch-only addition, `useLongPress` for ×5 steppers, `Switch` for
visibility toggles, `Chip` for multi-select states, pips for spendable uses and `Tabs` for
panels that are shown one at a time.

Spanish is the first-visit language even on English browsers. English is selectable.
Use src/shared/i18n catalogs and typed keys for visible text, accessible names, loading,
empty/error states and route titles. Update the document language. Never machine-translate
user campaign content. Sample campaign copy is localized because it is application-owned.

Mantine is the single component kit: accessible dialogs/drawers, forms, menus, tabs,
notifications and layout. Lucide supplies icons. Reuse official patterns rather than
maintaining duplicate widgets or adding Tailwind/shadcn alongside Mantine.

Theme tokens: src/app/theme.ts. Layout: src/app/styles.css. Keep campaign art optional;
the compass is decorative. Self-host future fonts and document licenses.

## Interaction

- Prioritize glanceable resources and the next useful action.
- Minimum 44px touch targets; essential information cannot depend on hover.
- Focus trapping, Escape and return focus for overlays; focus content on navigation.
- Preserve reduced motion, text zoom, landmarks and heading hierarchy.
- Show loading, empty, error, forbidden, stale and offline states where relevant.
- No fake mutations. Planned screens clearly say they are planned.
- WCAG AA contrast; never convey roles/status by color alone.

## Verification

Playwright covers 1440px desktop, 820px tablet and a 390px touch phone profile.
Inspect captures and exercise keyboard, drawer/Escape, direct links, 150% text and reduced motion.
Axe supplements visual/touch review; mobile Chromium emulation does not verify iOS Safari.
Every interface change requires the independent ui-ux verdict described in [UI review](ui-review.md).
