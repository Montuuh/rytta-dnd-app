# RYT-018 independent UI/UX review — initial

Date: 2026-10-28. Reviewer: ui-ux.

Verdict: CHANGES_REQUIRED

Reviewed source digest: `187bd19897121b8338ef3f63b8527040d5b4361d2b089ff66c9676487206cb60`.

## Blocking findings

- **P2 — Account and settings controls split into different rows on enlarged mobile text.** At 390px, Spanish/dark, 150% root font, the account icon stays alongside the Player-preview button but the hamburger wraps alone to a third header row. This breaks the requested stable account-immediately-left-of-menu arrangement and makes the header unnecessarily tall. Source: `src/app/styles.css`, mobile `.header-actions { flex-wrap: wrap }`, and the header action composition in `src/app/layout.tsx`. Keep account and hamburger together in a non-wrapping subgroup; permit campaign/preview controls to reflow outside that pair. Evidence: `party-390-es-dark.png` and `settings-390-es-dark.png`.
- **P2 — Account menu fails required ARIA-child semantics.** Opening the account menu reproduces axe `aria-required-children` (critical) in all four checked combinations. Mantine's initial-focus placeholder is rendered as `<div role="presentation" tabindex="-1" data-autofocus>` inside `role="menu"`; it cannot be treated as presentation while focusable. Source: `src/app/layout.tsx`, `AccountMenu`, and Mantine's default `withInitialFocusPlaceholder`. Use the supported configuration to remove the placeholder, then verify first-item keyboard focus, arrow navigation and Escape/trigger restoration. Evidence: `account-axe.json`, `account-axe.mjs`, and `probe-results.json`. This is a library-default issue exposed by this new UI; it remains a failing WCAG check in the rendered result.

- **P2 — A valid longer account email makes the account menu overflow the phone viewport.** At 390px/150%, account email `alexander.adventurer.with.a.long.address@example.com` opens a 507px dropdown and expands document width to 512px. The dropdown uses unconstrained max-content width even though the label may wrap. Constrain the account dropdown to the viewport and allow its identity label to wrap. Evidence: `account-email-52.png`, `account-email-results.json`, `account-email.mjs`. The tested 32-character address fits; the 52-character address is also a valid supported account value.

## Executed browser review

Used Playwright against the identity preview at `http://127.0.0.1:4175/rytta-dnd-app/` with the test-only `identityFixture`. Matrix: 390px ES/dark and EN/light; 820px ES/light and EN/dark; 150% root text; reduced motion. Captured 32 states across party, settings drawer, centered settings modal, account menu, Player preview, membership, direct-link and unlink dialogs. Inspected the actual screenshot files.

Verified right-anchored drawer contains only Settings plus its close control, settings modal opens after drawer closes, modal traps focus over 12 Tabs, Escape restores hamburger focus, account menu Escape restores account trigger, DM preview hides edit/create controls and restores them on return, direct Player linking/unlinking updates member-character names, and preview does not call the role-change RPC. No page errors were observed. Document widths remained within 390/820px and checked visible interactive targets met 44px. Axe was clean except the account-menu issue above (and the same menu while it remained mounted during the immediate next capture).

`probe-results.json` and `states-results.json` record actual automated observations. The parent reports 43 local unit/SQL tests and 99 browser tests passed; this review does not independently certify those entire suites.

## Limits

Backend calls in these browser checks use HTTP fixtures. No hosted Supabase Auth/JWT/PostgREST, two real Google accounts, real iOS/Safari, assistive-technology session or database migration was exercised by this reviewer. SQL policy/concurrency/migration evidence belongs to the implementation report. No production change was made by this reviewer. Approval requires a focused re-review of the corrected source snapshot.
