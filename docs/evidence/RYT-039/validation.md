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
| `npm run check` | see final run below |
| `playwright test combat -g RYT-039` (identity desktop, tablet, mobile) | 3 passed |
| `playwright test combat glossary character-sheet` | see final run below |

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

Pending.
