# ADR 021: one settings home and class themes

Date: 2026-11-03. Status: accepted for RYT-033.

Appearance and language used to be controlled from three places: quick toggles in the profile
menu, a settings dialog opened from that menu and the Settings page. The user asked for one
home for these preferences and for themes inspired by the twelve D&D classes.

## Decision

- The Settings page (`#/settings`) is the only place to change appearance, language and class
  theme. The profile menu keeps a plain link to it (My campaigns, Settings, Sign out). This
  replaces the preferences dialog from ADR 008 and the menu toggles from RYT-025.
- Settings groups each preference in a section with a heading and help text. Each section has
  one radio group of native radios painted as cards: light/dark preview tiles, a gallery of 13
  theme cards (class glyph, name and tagline) and a language pair. Arrow keys, Tab, focus rings
  and screen readers work like native radios.
- Class themes are Default (the existing amber hearth) plus Barbarian, Bard, Cleric, Druid,
  Fighter, Monk, Paladin, Ranger, Rogue, Sorcerer, Warlock and Wizard. Each theme has a Mantine
  10-shade primary palette and its own semantic token set for both light and dark. The tokens
  are background, surface, raised, hover, border, hero, text, muted, accent, secondary accent,
  focus and on-accent.
- `src/shared/theme/class-themes.ts` is the single source of truth. `src/app/class-themes.css`
  is generated from it and imported with the main bundle, so no theme loads late and causes a
  flash. The inline script in `index.html` sets `data-rytta-theme` before the first paint, next
  to the color scheme. `MantineProvider` switches `primaryColor` to the theme palette.
- The theme is a local preference (`rytta-theme`). If the stored value is unknown, the app
  falls back to `default`. If storage is blocked, the theme still works for the current visit.
  It is never sent to the server.
- Resource colors (gold, water, rations, danger, success and rarity) keep their meaning across
  themes. They are not tinted.

## Consequences

`tests/unit/class-themes.test.ts` checks every theme in both schemes against WCAG AA. Text,
muted and accent colors need 4.5:1 on every surface. On-accent text needs 4.5:1 on the accent
and on the filled hover shade, and the focus ring needs 3:1. The test checks that the CSS
file and the default tokens in `styles.css` match the source, and that the bootstrap theme list
matches `classThemeIds`. To pass it, the default light secondary accent changed from #9e5114
to #974d13, since the old value measured 4.35:1 on the hero surface.

See [RYT-033 verification](../evidence/RYT-033/validation.md).
