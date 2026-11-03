# RYT-033 verification

Date: 2026-11-03. Branch `worktree-agent-a870aff3433ab90d0`, based on `main` at `36ec84c`
(this includes RYT-028 to RYT-030).
Decision record: [ADR 020](../../decisions/020-settings-class-themes.md).
Frontend only: no migrations, RPCs or RLS changed.

## Automated checks

| Check | Result |
| --- | --- |
| `npm run check` (typecheck, lint, contracts, unit tests, build) | Pass |
| `tests/unit/class-themes.test.ts` (13 themes × 2 schemes, sync and bootstrap) | 30 passed |
| `npm run test:e2e`, full suite on temporary ports 4473/4474 | 283 passed, 11 skipped, 3 failed (see below) |
| PKCE sign-in test on standard ports 4173/4174 | 3 passed |
| Independent `ui-ux` review | Pending (not run by the implementing agent) |

The full suite ran with a temporary copy of `playwright.config.ts` on ports 4473/4474,
deleted afterwards. The three Google sign-in tests in `identity.spec.ts` assert the literal
`127.0.0.1:4174` callback, so they fail on other ports. On the standard config they passed.

The first contrast run found one existing failure: the default light secondary accent #9e5114
measured 4.35:1 on the hero surface. It is now #974d13 (4.67:1).

The first e2e runs found three test problems, all fixed:

- `locator.check()` cannot act on the visually hidden radio. The test now clicks the card.
- The gallery read ran before the lazy page had loaded. The test now waits for the heading.
- A hash-only `page.goto` sometimes landed on Party. The test now navigates through the
  profile menu.

## Coverage

- `tests/e2e/preferences.spec.ts`:
  - The profile menu has one item, which links to Settings, with no dialog or toggles.
  - Appearance, class theme and language persist across navigation and reload, and
    `--app-accent` and `theme-color` follow the theme.
  - The gallery is a 13-radio keyboard group: arrows select, the focus ring is visible, Tab
    moves to the next group, and targets are at least 44px.
  - Axe passes for es/en × dark/light × Default/Warlock on Party and Settings, with no
    overflow and labels that fit at 150% text.
  - Axe (WCAG AA) passes on Settings for every theme in both schemes.
  - Invalid stored values fall back to the defaults.
  - With storage blocked, all three preferences still work and the page logs no errors.
- `tests/e2e/identity.spec.ts` and `tests/e2e/scaffold.spec.ts` now expect the smaller menu
  and the Settings page in place of the dialog.

## Captures

Captured at 390px (Pixel 7 emulation) and 820px (tablet) with Playwright: `settings-*`,
`party-*`, `menu-*` and `keyboard-focus-*` in this folder. The Settings captures cover Default,
Warlock, Barbarian and Paladin in dark mode, and Default, Druid, Wizard and Rogue in light
mode. The implementing agent inspected them.

## Untested layers

- No hosted Supabase integration: the feature uses no backend.
- Real iOS Safari and Android devices were not tested. The 390px profile is Chromium emulation.
- The only paint-flash check is reading the code. The theme attribute is set by the inline
  bootstrap and the theme CSS ships in the render-blocking bundle stylesheet. Before the app
  mounts, the browser `theme-color` uses the scheme default; it updates on mount.
- The independent ui-ux verdict is pending.
