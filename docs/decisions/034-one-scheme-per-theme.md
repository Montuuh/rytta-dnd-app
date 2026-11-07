# ADR 034: one color scheme per theme, and Settings as a drawer

Date: 2026-11-07. Status: accepted for RYT-069. Supersedes the appearance switch, the
"every theme in light and dark" rule and the Settings page of
[ADR 021](021-settings-class-themes.md).

ADR 021 gave every class theme a light and a dark token set and kept appearance (light or dark)
as a second, independent choice: 13 themes times 2 schemes. In light mode most class colors had
to be darkened to brown or olive to reach 4.5:1, so they lost the color that names the class
(Monk kept 52% of its chroma, Sorcerer 59%, Cleric and Paladin 66%). The user asked to unify the
two choices, as D&D Sync does: its themes (`navy`, `light`, `toxic`, `plant`) are each either
dark or light, and dark mode follows from the theme.

## Measurement

Contrast of each palette's most saturated mid shade (the class color) on the theme's dark
background against its light background:

| Theme            | On dark | On light | Scheme          |
| ---------------- | ------- | -------- | --------------- |
| Monk             | 10.0    | 1.7      | dark            |
| Fighter          | 9.6     | 1.8      | dark            |
| Paladin          | 8.0     | 2.2      | dark            |
| Ranger           | 7.2     | 2.4      | dark            |
| Druid            | 6.9     | 2.5      | dark            |
| Hearth (default) | 6.5     | 2.6      | dark            |
| Sorcerer         | 6.3     | 2.8      | dark            |
| Rogue            | 5.4     | 3.2      | dark            |
| Cleric           | 5.2     | 3.3      | dark            |
| Bard             | 4.4     | 3.9      | dark (near tie) |
| Warlock          | 3.4     | 5.2      | light           |
| Wizard           | 3.6     | 4.9      | light           |
| Barbarian        | 3.6     | 4.8      | light           |

Bright hues (gold, amber, orange, lime, pale steel) only keep their identity on dark
backgrounds; deep hues (blue, violet, blood red) read best on light ones. The user accepted the
split as measured, including Warlock as light and Bard as dark.

## Decision

- A theme owns one scheme. Dark (10): Hearth, Bard, Cleric, Druid, Fighter, Monk, Paladin,
  Ranger, Rogue and Sorcerer. Light (4): Parchment, Barbarian, Warlock and Wizard. Parchment is
  a new neutral light theme that keeps the former default light tokens, for players who need a
  light screen without a class color. 14 token sets replace 26.
- The light class themes move their accent toward the class color: Wizard `#224fa7` (was
  `#0f3a90`), Warlock `#7d4dbe` (was `#531d8d`) and Barbarian `#ac0311` (was `#650006`). Their
  palettes keep the light tints Mantine uses for light variants (shades 1–2) and place the
  accent at shade 8, so the global primary shade (`light: 8, dark: 3`) and the filled red and
  green controls do not change. Warlock's hero tint lightened to `#e9e3f7` to keep the accent at
  4.5:1.
- Settings has one Theme section with one radio group, split into Dark and Light subgroups
  (`role="group"`, moon and sun glyphs, a one-line hint). The Appearance section is removed.
  Arrow keys move across both subgroups because the radios share a name.
- Theme choices are small swatch tiles, after D&D Sync's appearance tiles (reviewed from the
  user's screenshot): each tile is painted in its own theme (background, border, text) with a
  round seal in the theme's surface showing the class glyph in the accent and a secondary
  ring, and the theme name below. The tagline stays as the radio's description for screen
  readers. Selection is a 2px accent frame plus a check badge, not an all-caps "active" label.
  The tiles fill five per row in the drawer (the ten dark themes make two full rows) and four
  on phones; the 4.75rem minimum fits the longest name and grows with enlarged text.
- Settings is no longer a page. The profile menu's Settings item opens a right-hand Mantine
  drawer (`calc(min(100vw - 1.5rem, 30rem))`: a medium panel, with a strip of the page still
  visible on phones) over the current screen, so the route, title and scroll stay. Language
  comes first, then the theme tiles, then the saved-on-this-device note. Escape, the close
  button (44px, "Close settings") and the overlay close it, and focus returns to the profile
  button. Old `#/settings` links open the drawer over the home screen.
- The scheme follows the theme everywhere: the store sets `data-rytta-theme` and
  `data-mantine-color-scheme` together, `MantineProvider` receives `forceColorScheme`, and its
  color scheme manager only reports the theme's scheme. Mantine no longer stores a scheme.
- Migration: `localStorage['rytta-color-scheme']` is read only as legacy input. A visitor with
  the default theme (or none) and a stored light scheme gets Parchment; any class keeps its
  class, now in its own scheme. Choosing a theme removes the legacy key. The `index.html`
  bootstrap applies the same rule before the first paint.
- No quick sun/moon toggle is added; the Settings drawer stays the only home for the look.

## Consequences

`tests/unit/class-themes.test.ts` checks each theme only in its own scheme, the dark/light
grouping, the bootstrap lists and the legacy migration. The e2e preference tests cover the
drawer (menu, deep link, Escape and focus return, language before theme), the grouped picker,
keyboard movement across groups, migration and axe for every theme inside the drawer (the page
behind the modal overlay is dimmed on purpose and is audited on its own). Screens
tested in "light mode" through the legacy key now render Parchment, which has the same tokens as
the old default light scheme. A player who used a dark-only class in light mode (for example
Druid in daylight) now has to pick a light theme instead.

See [RYT-069 verification](../evidence/RYT-069/validation.md).
