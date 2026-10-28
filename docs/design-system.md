# Design system

A quiet field journal: warm paper, forest green, serif headings and readable system-font
body text. Clear hierarchy suits dim tables and short mobile visits. This shell is the
foundation, not final design approval for every gameplay screen.

## Appearance and language

Dark is the first-visit default, regardless of the OS preference. The night-forest palette
uses background #121A17, surface #1B2722, raised surface #24362D, ivory text #F0EFDF,
secondary text #B1BCAE and sage accents #B8D18C. Gold #D9BC78 is the focus indicator.
Filled sage controls use deep-green text #14241D, including their hover state.

Light mode uses warm paper #F7F7F2, surface #FFFEFA, text #292F27, secondary text #626B5B
and forest accents (#304923 for primary buttons). Focus uses #796329. Both palettes
preserve the same hierarchy; the palette is a product choice verified with contrast tests.

Semantic tokens live in src/app/styles.css and feed Mantine variables. Avoid hardcoded
light backgrounds or white text on pale dark-mode accents. The header shows the campaign name and right-aligned account/settings actions. The account
menu owns campaign-home and logout; campaign home has no duplicate account/logout block.
The hamburger opens a compact menu anchored below the right-hand trigger, containing one
Settings action that opens a centered large preferences dialog. Moon/sun choices retain
localized radio labels and selected states without visible text labels. Campaign invitations
use a distinct panel with clear recipient, pending actions, empty guidance and query recovery.
Mobile campaign navigation has its own control. All controls have
44px targets. Preferences persist locally and remain usable in memory if storage is blocked.

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
