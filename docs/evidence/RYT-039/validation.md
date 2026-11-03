# RYT-039 verification: combat conditions link to the glossary

Date: 2026-11-03. Committed directly on `main` (user request, no pull request), on base `21fd92a`.

## Scope delivered

In the combatant detail (drawer on phones and tablets, side column on wide screens), for the DM
and for Players:

- each active condition tag opens its SRD condition definition (`condition.*`);
- the "Estados" (Conditions) title opens `rule.condition`, like the character sheet;
- the "Concentración" title opens `rule.concentration`;
- the condition named by a timed effect opens its definition.

Not linked on purpose: the condition picker chips (toggles), the effect form select, the
initiative rail badges (rail rows are buttons or labels, so a nested button would be invalid)
and the read-only table display.

No database, data or permission changes: the terms use the existing campaign glossary layer
that already wraps the combat routes.

## Automated checks

| Check | Result |
| --- | --- |
| `npm run check` (typecheck, lint, architecture, docs, AI contracts, unit + SQL, build) | passed, 204 tests |
| `playwright test combat -g RYT-039` (identity desktop, tablet, mobile) | 3 passed |
| `playwright test combat glossary character-sheet` | 63 passed |

The new e2e test sets "Derribado" on a goblin, checks the three links, opens the definition with
the keyboard (dialog named "Derribado"), runs axe and the 44 px audit with the definition open,
and checks that the first Escape closes only the definition with focus back on the term, and on
phones and tablets that the next Escape closes the combat drawer. The combat audit now skips
inline `.glossary-term` buttons, like the other specs since RYT-008; their 44 px hit area is
asserted by the glossary spec. Computed styles confirm the linked titles keep the panel title
font (Georgia, 16 px).

Playwright ran with the container's preinstalled Chromium through a local, uncommitted config
override, as in RYT-008.

## Screenshots

`condition-terms-{mobile,tablet}.png` (detail with linked tags and titles) and
`condition-definition-{mobile,tablet}.png` (definition above the combat drawer), captured with
`RYT_EVIDENCE=1` at 390 px and 820 px.

## UI/UX review

Independent `ui-ux` verdict: **PASS** on fingerprint `4e3e321d…`, report
[ui-review.md](ui-review.md). The reviewer checked DM and Player at 390 px, 820 px and 1280 px:
title fonts and pill styling unchanged, no term hit area covering another control, keyboard and
Escape order (drawer and wide layout), accessible names, axe with the definition open, stacking
above the drawer, `onlyTopDialog`, and the sticky inline error.

Accepted minor items:

- M1: neighbouring term hit areas overlap (a tap just below "Estados" or between wrapped pill
  rows opens the next term); taps on the text are always correct. Same trade-off as RYT-008 F7.
- M2: the e2e test does not cover the effect-line link, because the combat fixture cannot add
  effects; the reviewer verified it manually with injected state.

Not tested: light and class themes, English and 150 % text for these pills (same component and
tokens as RYT-008), real devices and screen readers.
