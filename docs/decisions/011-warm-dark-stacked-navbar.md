# ADR 011: Warm hearth dark palette, stacked two-row navbar and resource ergonomics

## Context

The user reviewed the D&D Sync reference audit and requested three foundational UI/UX changes for Rytta (`RYT-022`):

1. **Mobile-first stacked top navigation without a left sidebar**:
   - Remove the fixed left sidebar and mobile navigation drawer.
   - Row 1 of the top header displays the application logo and `RYTTA` brand on the left, and quick utility actions on the right: DM Player POV switcher (when applicable), a direct `ES`/`EN` language toggle button, a direct dark/light theme icon toggle button, and a unified `Profile` menu button containing user identity, `My campaigns` (`Mis campañas`), `App setup` (`Ajustes`), and `Sign out` (`Cerrar sesión`).
   - Row 2 of the top header displays the module navigation (`Camp`, `Party`, `Members & invitations`, and planned modules) as a single horizontal row of scrollable columns/tabs.
2. **Warm hearth dark palette**:
   - Replace the green/bluish dark theme with a deep warm espresso/charcoal-brown dark palette (`#140f0b` background, `#1e1610` surface, `#2a1f16` raised surface) paired with warm amber, orange, and gold accents (`#eda145`, `#f6c478`) and warm cream typography (`#f5ebd6`, `#cbb699`).
3. **D&D Sync-inspired resource cards and steppers**:
   - Add semantic color tokens and icon-accented resource tiles for Gold, Water rations, Food rations, and Exhaustion on character cards.
   - Add 44px `−` and `+` touch stepper buttons to the DM resource editor modal alongside direct numeric inputs.

## Decision

- Update `index.html`, `src/app/theme.ts`, `src/app/styles.css`, and `src/shared/ui/preferences-controls.tsx` with the warm hearth dark palette and parchment light palette, preserving WCAG AA contrast across all states.
- Refactor `src/app/layout.tsx` into a sticky two-row `<header className="app-header">` with `.topbar` (Row 1) and `.nav-tabs-row` (Row 2), removing `<aside className="sidebar">` and `<Drawer>`.
- Consolidate the header's right-side account and settings triggers into a single `Profile` (`Perfil`) menu trigger while exposing direct 44px `ES`/`EN` and theme toggle buttons to its left.
- Enhance `src/features/characters/ui/party.tsx` with semantic resource icons/tiles and 44px `−`/`+` steppers in the resource editor modal.

## Consequences

- Full screen width is available to main content on desktop, tablet, and mobile without a permanent left column or hidden drawer navigation.
- Language and appearance can be toggled in one tap from the top bar or configured inside the `App setup` dialog from the `Profile` menu.
- All interactive controls maintain `44x44px` minimum touch targets, keyboard/Escape support, 150% text zoom fit, and WCAG AA contrast.
