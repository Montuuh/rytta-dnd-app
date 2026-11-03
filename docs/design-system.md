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
and roasted chestnut accents (#6E3410 for primary buttons, #974D13 secondary). Focus uses
#844112. Both palettes preserve the same hierarchy; the palette is a product choice verified
with contrast tests. These values are the Default ("Hearth") class theme described below.

Semantic tokens live in src/app/styles.css and feed Mantine variables. Avoid hardcoded
light backgrounds or white text on pale dark-mode accents. The header has no left sidebar.
Row 1 shows the logo, the RYTTA brand and the campaign name, plus a DM `Player view` switch
and a unified Profile menu (My campaigns, App setup, Sign out). Appearance, language and class
theme are changed only on the Settings page (RYT-033, ADR 020). Tablets and laptops show reachable modules in a second row: one non-wrapping,
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

## DM tools and item lists (RYT-027)

DM-only tools live in the DM Command Center tabs (`?panel=` deep links), not in separate
navigation items. Item collections use dense 64px rows (rarity-tinted icon, name, one meta
line, icon actions) with an optional compact grid. Actions that fit stay as 44px icon buttons
with accessible names; on phones they fold into one ⋯ menu. Avoid stacks of plain text
buttons on cards. Campaign pages share one width for every role.

## Settings and class themes (RYT-033)

Settings (`#/settings`) is the single home for appearance, language and class theme. Each
preference is a section: an h2 with one line of help (beside the controls from 62em, stacked
below), then one radio group. Radio cards are native radios kept in the accessibility tree and
painted as cards (`.choice-card`). They have a 1px border, a 2px accent border plus a check
badge when selected (never color alone), a 3px `--app-focus` ring on keyboard focus and at
least 56px of height. Arrow keys move the selection, and Tab moves between groups. Do not
reintroduce quick toggles in the profile menu or elsewhere.

- Appearance: two preview tiles draw a miniature screen in the active class theme for each
  scheme.
- Class theme: a gallery of 13 cards. Each card has a medallion with the class glyph in the
  theme's own background, accent and secondary ring, plus the name and a short tagline. The
  glyphs are Lucide icons: Compass, Axe, Music, HandHeart, Leaf, Swords, HandFist,
  ShieldHalf, BowArrow, VenetianMask, Flame, Eye and WandSparkles.
- Language: Español and English cards with a language-tagged label.

Themes: Default/Hearth (campfire amber), Barbarian (blood and embers), Bard (velvet and rose),
Cleric (radiant gold), Druid (moss and bark), Fighter (tempered steel), Monk (saffron and jade),
Paladin (gold and silver), Ranger (forest and leather), Rogue (charcoal and crimson), Sorcerer
(dragonfire), Warlock (eldritch violet) and Wizard (arcane blue).

How it works:

- Source of truth: `src/shared/theme/class-themes.ts`. Each theme has a Mantine 10-shade
  palette (lightest first) and `dark`/`light` token sets. The token sets cover `--app-bg`,
  `--app-surface`, `--app-raised`, `--app-hover`, `--app-border`, `--app-hero`, `--app-text`,
  `--app-muted`, `--app-accent`, `--app-accent-secondary`, `--app-focus` and
  `--app-on-accent`. In dark mode they also override Mantine's `dark-4..8` slots.
- `--app-accent` is always the Mantine filled shade: `palette[3]` in dark mode and
  `palette[8]` in light mode. Filled primary controls use `--app-on-accent` text.
- `src/app/class-themes.css` is generated. Do not edit it by hand. After changing the
  source, run `UPDATE_THEME_CSS=1 npx vitest run tests/unit/class-themes.test.ts`. The
  Default tokens stay in the base blocks of `src/app/styles.css`, and the test keeps them equal.
- Applied as `html[data-rytta-theme]`. The `index.html` bootstrap sets it before the first
  paint. `MantineProvider` switches `primaryColor`, and one effect in `providers.tsx` keeps
  `<meta name="theme-color">` equal to the theme background. The theme persists in
  `localStorage['rytta-theme']`. Invalid values fall back to `default`, and blocked storage
  keeps the choice in memory.
- Contrast is enforced in `tests/unit/class-themes.test.ts`. Text, muted, accent and secondary
  accent need 4.5:1 on bg, surface, raised and hero. On-accent needs 4.5:1 on the accent and
  on the filled hover shade, and Mantine's light and outline variants need 4.5:1. The focus
  ring needs 3:1 on every surface. A new theme must pass this test, and axe on Settings in
  both schemes, before it ships.
- Never hardcode a theme color in components. Use the tokens. Resource and status colors
  (gold, water, rations, danger, success, rarity) keep their meaning across themes.

## Glossary (RYT-008)

The glossary reads like a field dictionary: serif headwords and rules text, a quiet sans UI.

- Search is the page's lead element: one large serif field (press `/`), Enter opens the best
  match, ArrowDown moves into the results, Escape clears. Categories are underlined `Tabs`
  with counts. Results are ranked; without a query the index is alphabetical with a thumb index
  (44px letter targets) and sticky letter rules. No card grids or pills.
- From 62em the index and the reader sit side by side; below, the reader is its own route with
  a back link. Entries show category glyph, headword, the other language's name as a gloss,
  a stat-block "At a glance" list (Lucide icons, ruled like a monster stat block), the rules
  text, house rules in a gold callout, the 2014 rule in an Accordion and the SRD page.
- Inline terms anywhere: dotted accent underline, no background, 44px hit area via a
  pseudo-element. They open the reference sheet (bottom sheet on phones, side sheet from 48em,
  z-index above other drawers). Never wrap a term inside another control.
- Homebrew uses a side drawer form; entry actions live in a ⋯ menu. Saving moves focus to
  the saved headword instead of showing a toast (top-right toasts would cover entry actions).
