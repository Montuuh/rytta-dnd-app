# RYT-016 validation — 2026-10-27

Scope: dark/light appearance, Spanish/English localization and required independent UI/UX review.
The default is dark and Spanish, including on a light OS or an English browser. Header and
Settings controls share preferences, persist across routes/reloads and remain usable when
browser storage is unavailable. User-authored campaign text is preserved.

## Design and implementation

The dark palette uses forest charcoal #121A17, surfaces #1B2722, ivory #F0EFDF and sage
#B8D18C, with gold focus #D9BC78. Light mode uses warm paper #F7F7F2, near-white #FFFEFA,
ink #292F27 and forest primary controls #304923. See [design system](../../design-system.md).
Mantine manages appearance; bundled, typed i18next/react-i18next catalogs manage UI text,
accessible labels, errors, loading states and document language/title.

The ui-ux role, frontend/producer instructions and SessionStart reminder require an
independent review after interface changes. CI and release checks reject a missing or stale
review manifest. This consistency check does not itself launch a model or prove a review;
the actual independent report is required. See [workflow](../../ui-review.md).

## Verification

- `npm run check`: passed TypeScript, lint, architecture/docs/AI contracts, 18 unit/SQL
  tests and production build. The SQL tests use PGlite, not a hosted Supabase instance.
- `npm run test:e2e`: 34 passed, 2 intentionally skipped (the drawer test is mobile-only).
  Tests run the production build under `/rytta-dnd-app/` in Chromium at 1440px, 820px and
  390px. Coverage includes both themes/languages, axe, route refresh, preference changes,
  invalid/unavailable storage, keyboard drawer/Escape, reduced motion and 150% text reflow.
- `npm run format:check`: passed before independent review.
- `check:ui-review` correctly rejected the missing manifest while review was pending.
- Independent review: [PASS](reviewer/review.md), after a focused re-review of the
  enlarged language control. The [initial finding](reviewer/initial-review.md) is retained.
  The reviewed fingerprint matches the final source and is recorded in
  `docs/evidence/ui-review-current.json`.
- Final `npm run check:ui-review`, `check:docs`, `check:ai` and `format:check`: passed.
  The AI validator recognizes four skills, five agents, scoped rules and the session hook.

## Visual evidence

- [Baseline before this delivery](baseline.png).
- Desktop: [Spanish dark](es-dark-desktop-camp.png), [Spanish light](es-light-desktop-camp.png),
  [English dark](en-dark-desktop-camp.png), [English light](en-light-desktop-camp.png).
- Mobile Settings: [dark](es-dark-mobile-settings.png), [light](es-light-mobile-settings.png).
- Tablet: [Spanish dark](es-dark-tablet-camp.png), [English light](en-light-tablet-camp.png).
- Additional independent evidence is stored in `reviewer/`.

## Initial failures and corrections

1. TypeScript rejected a parameter property under `erasableSyntaxOnly`; the domain error
   now declares and assigns its code explicitly.
2. The first browser run had 12 failures (22 passed, 2 skipped): dark primary controls
   had insufficient contrast, and the test attempted to check Mantine's hidden segmented
   radio directly. Explicit semantic foreground colors fix contrast; the test activates
   the visible label as a user would.
3. The next run had 6 failures (28 passed, 2 skipped): a dark Settings badge retained a
   white foreground on pale sage, measuring about 1.67:1. An explicit forest default and
   shared filled-variant foreground resolve it. The focused mobile rerun and subsequent
   complete 34-test run passed.
4. The independent reviewer found that the compact language selector clipped Spanish
   at 150% text, despite passing axe and page-overflow checks. Replaced its fixed 128px
   width with 8rem so it scales with text. Browser tests now compare the selected text
   width against the available input space at 150%. The full browser suite passed again;
   independent re-review confirmed the fix across all 12 theme/language/viewport combinations.

## Limits

No real-device Safari, hosted Supabase integration, native custom-role discovery or
GitHub-hosted workflow execution is claimed. The reviewer is invoked as an independent
subagent applying the repository role. No commit, push or external deployment was made.
The app remains a scaffold with explicit sample content; gameplay modules remain planned.
