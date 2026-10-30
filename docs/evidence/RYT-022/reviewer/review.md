# RYT-022 Independent UI/UX Review

- **Ticket:** `RYT-022` — Stacked mobile navbar, warm dark palette and resource ergonomics
- **Reviewer role:** `ui-ux` (`.codex/agents/ui-ux.toml`)
- **Verdict:** `PASS`
- **Reviewed at:** `2026-10-29T19:13:00Z`
- **Reviewed source digest:** `da5f48cf6f7b173fe9e40be946810ebc9656f77b515ce9f50f94e734898c067b`

## Summary

The `RYT-022` interface delivery meets all acceptance criteria and design-system requirements across mobile (`390×844`), tablet (`820×1180`) and desktop (`1440×1000`) viewports, in both Spanish (`es`, default) and English (`en`), across both the warm hearth dark palette (default) and warm parchment light palette, at `100%` and `150%` text scaling, and under reduced motion:

1. **Two-row stacked top header without left sidebar or drawer:** `.sidebar` and the mobile navigation drawer are removed. `.app-header` renders a sticky two-row top header across mobile, tablet and desktop.
2. **Row 1 brand and action bar:** Left side displays the compass emblem, `RYTTA` brand title, and active campaign name (or localized tagline outside a campaign). Right side displays the DM `Vista Player` / `Player view` selector (or `Volver a DM` / `Return to DM` active toggle), direct `ES`/`EN` language toggle (`44×44px` minimum target with localized `aria-label` and `title`), direct dark/light `ActionIcon` toggle (`44×44px` with `Sun`/`Moon` icon and localized `aria-label`/`title`), and the unified `Perfil` / `Profile` menu (`Mis campañas` / `My campaigns`, `Ajustes` / `App setup`, `Cerrar sesión` / `Sign out`).
3. **Row 2 horizontal module navigation:** Campaign and demo modules render in `.nav-tabs-row > .nav-tabs` as a horizontally scrollable tab strip with `44px` minimum height, clear active state (`var(--app-accent)` fill with `var(--app-on-accent)` text), and disabled planned modules with explicit badges (`Módulo previsto` / `Planned module`), without causing horizontal page overflow at `100%` or `150%` text.
4. **Warm hearth dark palette & WCAG AA contrast:** First-visit default dark mode uses `#140f0b` background, `#1e1610` surface, `#2a1f16` raised surface, `#f5ebd6` primary cream text, `#cbb699` muted sand text, `#eda145` / `#f6c478` amber-gold accents, and `#181009` deep espresso text on filled primary controls. Light mode uses warm parchment `#f7efe2` / `#fffdf9` with roasted chestnut `#6e3410` accents. Automated axe (`wcag2a`, `wcag2aa`, `wcag21aa`) and visual checks pass with zero violations.
5. **Semantic resource tiles and `44px` touch steppers in Party:** Character cards display 2-column resource tiles with semantic icons (`Coins`, `Droplets`, `Utensils`, `Flame`), soft tinted icon badges, tabular numerals, and full-width spanning for billion-scale values. The DM resource editor modal pairs each integer `NumberInput` with `44×44px` `Minus` and `Plus` `ActionIcon` steppers that clamp to `[0, maxVal]`, disable at bounds or while pending, and expose localized accessible names (`Aumentar`/`Reducir {{field}}`, `Increase`/`Decrease {{field}}`).

## Findings

No blocking (`critical`, `high`, or `medium`) issues found.

### Non-blocking observations (`low`)

1. **Mid-word wrapping in `.resource-label` at `150%` text on `390px` mobile**
   - **Severity:** `low` (non-blocking polish)
   - **Location:** `src/app/styles.css:434-444`, `src/features/characters/ui/party.tsx:143-158`
   - **Viewport / Theme / Language:** `390×844` mobile at `150%` text (`es` dark/light and `en` dark/light)
   - **Observation:** Inside the 2-column `.resource-cell` grid on a `390px` viewport at `150%` text size, the `26px` `.resource-icon` sits inline beside `.resource-label` (`overflow-wrap: anywhere`), leaving narrow horizontal space per column and causing longer labels (`Raciones de agua`, `Raciones de comida`, `Agotamiento`, `Exhaustion`) to wrap mid-word (`Racione` / `s de` / `agua`, `Agotam` / `iento`, `Exhausti` / `on`). No horizontal overflow or clipping occurs, and all labels and values remain legible.
   - **Note on earlier evidence capture:** `docs/evidence/RYT-022/mobile-editor-es-dark-150.png` showed the bottom edge of `Guardar recursos` clipped by the `fullPage` screenshot boundary; live browser re-verification on the current snapshot (`da5f48cf6f7b173fe9e40be946810ebc9656f77b515ce9f50f94e734898c067b`) in `docs/evidence/RYT-022/reviewer/e2e/characters-es-dark-party-editor-and-account-menu-at-150-text-identity-mobile/editor-es-dark-150.png` confirms `yOffset="2dvh"` and `gap="xs"` render the entire `Guardar recursos` button cleanly inside the modal.

## Tested Scenarios & Inspected Evidence

### Code Inspection
- `index.html` (initial `#140f0b` / `#f7efe2` theme-color and first-paint styles)
- `src/app/theme.ts` (warm hearth dark scale, amber/chestnut `forest` scale, `variantColorResolver` for `--app-on-accent`, `44px` component minimums)
- `src/app/styles.css` (semantic palette tokens, `.app-header`, `.topbar`, `.nav-tabs-row`, `.nav-tabs`, `.resource-cell*`, `.resource-stepper*`, reduced-motion media query)
- `src/app/layout.tsx` (2-row header, brand bar, DM Player POV menu/toggle, direct `ES`/`EN` button, direct `Sun`/`Moon` button, unified `Profile` menu, horizontal `Navigation`, focus management)
- `src/shared/ui/preferences-controls.tsx` (theme radio group with `44px` targets and `NativeSelect` language control)
- `src/features/characters/ui/party.tsx` (`resourceIcons`, semantic resource tiles, `CharacterEditor` with `44×44px` `Minus`/`Plus` steppers)
- `src/shared/i18n/{es,en,characters-es,characters-en}.ts` (Spanish and English completeness for toggles, profile menu, and stepper labels)
- `tests/e2e/{scaffold,preferences,identity,characters}.spec.ts`

### Live Browser Checks Executed (Isolated Output)
Ran Playwright against the built preview servers (`http://127.0.0.1:4173/rytta-dnd-app/` and `http://127.0.0.1:4174/rytta-dnd-app/`) with `--output=docs/evidence/RYT-022/reviewer/e2e`:
- `preferences.spec.ts` (`en light overview and settings are accessible and fit` on `mobile` `390×844` and `tablet` `820×1180`)
- `characters.spec.ts` (`DM creates before assignment, edits whole homebrew units and recovers from a stale editor` on `identity-mobile` and `identity-tablet`, including `Aumentar Oro` stepper interaction)
- `characters.spec.ts` (`es dark` and `en light` `party, editor and account menu at 150% text` on `identity-mobile` and `identity-tablet`, verifying `scrollWidth <= innerWidth`, axe WCAG 2.1 AA, keyboard `Escape` focus restoration, and modal/menu rendering)

### Inspected Screenshots
- Delivery evidence in `docs/evidence/RYT-022/`:
  - `mobile-es-dark-camp.png`, `tablet-es-dark-camp.png`
  - `mobile-party-es-dark-100.png`, `tablet-party-es-dark-100.png`
  - `mobile-editor-es-dark-150.png`, `tablet-editor-es-dark-150.png`
  - `mobile-compact-settings-menu.png`, `tablet-compact-settings-menu.png`
  - `mobile-hub-es-dark-100.png`, `tablet-hub-es-dark-100.png`
- Reviewer-generated captures in `docs/evidence/RYT-022/reviewer/e2e/`:
  - `preferences-en-light-overv-1c0cc-ings-are-accessible-and-fit-mobile/en-light-camp.png`
  - `preferences-en-light-overv-1c0cc-ings-are-accessible-and-fit-tablet/en-light-camp.png`
  - `characters-en-light-party--b692b-nd-account-menu-at-150-text-identity-mobile/{party-en-light-100,party-en-light-150,editor-en-light-150,menu-en-light-150,settings-en-light-150}.png`
  - `characters-en-light-party--b692b-nd-account-menu-at-150-text-identity-tablet/party-en-light-100.png`
  - `characters-es-dark-party-editor-and-account-menu-at-150-text-identity-mobile/{party-es-dark-150,editor-es-dark-150,menu-es-dark-150,settings-es-dark-150}.png`

## Limitations
- Browser verification used Playwright Chromium desktop, tablet (`820×1180`) and mobile (`390×844` Pixel 7 touch emulation) against deterministic local fixtures; real iOS Safari hardware and live multi-account hosted Supabase sessions remain covered under `RYT-015`.
