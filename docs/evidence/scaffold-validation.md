# Foundation verification — 2026-10-27

Scope: RYT-000, architecture and scaffold only. Workspace started empty and without Git.
The sibling legacy repository was inspected read-only. No remote project, account,
production database, publication, commit or push was created.

## Observed verification

- Clean `npm ci` completed successfully, installed Git hooks and reported zero vulnerabilities.
  `npm run check` passed again after the clean install; final `npm run format:check` passed.

- `npm run check`: passed strict TypeScript, Oxlint with warnings denied, feature boundaries,
  documentation contracts, AI contracts, 15 Vitest tests and production build.
- Unit/database coverage: 5 configuration cases and 10 PostgreSQL policy cases.
  Anonymous/outsider access, role escalation, ownership, player mutation denial, DM edits,
  negative balances, cross-campaign moves, membership FK, atomic bootstrap and same-campaign
  character privacy are exercised. SQL runs in PGlite with an auth.uid fixture.
- `npm run test:e2e`: 10 passed; 2 deliberately skipped because the drawer test is mobile-only.
  Chromium profiles: 1440×1000 desktop, 820×1180 tablet and 390×844 touch phone.
  Tests use a production build under `/rytta-dnd-app/`, refresh hash routes, assert no page
  errors or Supabase requests in demo, run axe WCAG A/AA, test overflow, keyboard drawer,
  Escape/focus return, 150% text and reduced motion.
- Screenshots inspected: [desktop](camp-desktop.png), [tablet](camp-tablet.png),
  [mobile](camp-mobile.png). No clipping or horizontal overflow observed in these views.
- `npm run check:ai`: 4 skills, 4 TOML agents, scoped rules and SessionStart JSON output pass.
  Git core.hooksPath is `.husky/_`; lifecycle hook activation in Codex is a separate trust step.
- Dependency audit reported zero vulnerabilities at installation; this is a point-in-time signal.
- Production entry chunk is about 298 kB minified / 93 kB gzip after route splitting;
  Supabase is loaded separately. This is build evidence, not a real-device performance measurement.

## Initial failures and corrections

1. Latest jsdom required a newer Node patch than this machine. Removed unused DOM testing
   dependencies; Vitest covers pure/SQL logic and Playwright handles actual browser behavior.
2. Vitest 5 no longer supported the assumed describe.sequential helper. Replaced it with
   the default serial suite; added DOM types for browser callbacks in test configuration.
3. Initial axe checks failed secondary-text contrast (~3.3:1). Set the Mantine dimmed/body/text
   tokens explicitly; reruns passed all tested viewports.
4. Initial production entry exceeded Vite's chunk warning threshold. Introduced lazy page/router
   boundaries; final build emits no chunk-size warning.
5. Official Python skill validator could not run because PyYAML was absent in available Python
   runtimes. Repository-native YAML/TOML validation now checks metadata, unfinished content,
   role definitions and executable hook output in CI without a global Python installation.
6. The new validator initially passed a file URL to Node on Windows; converted it with fileURLToPath.
7. Lazy router initialization in main.tsx triggered the Fast Refresh lint rule. Moved the root
   component into app/app.tsx; lint and complete checks passed afterward.

## Unverified layers and remaining work

Docker/Supabase CLI are unavailable here. The migration has not been run through a local
Supabase stack or hosted PostgREST/Auth/Storage/Realtime. Bootstrap TS database types are
handwritten and must be regenerated once the local stack exists. No sign-in or gameplay
UI is implemented. No iOS Safari/real hardware or GitHub-hosted workflow execution is claimed.
The SessionStart script was executed directly and its output validated; host trust/activation
and native custom-agent discovery are not asserted from file creation alone.

These are documented boundaries of the requested foundation, with follow-up tickets,
not claims that the companion is ready for live campaign use.
