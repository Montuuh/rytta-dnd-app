# RYT-021 validation

## Scope and ownership

Owned: character Party and assignment UI, campaign Members UI, their English/Spanish
catalogs, character/identity browser tests, ADR 010 and RYT-021 evidence/backlog.
Initial working tree was clean. No backend, production data, release or legacy sibling edits.

## Baseline

- Reproduced the split workflow with the existing HTTP contract fixture: Party creates
  characters, Members links/unlinks and separately lists unassigned characters.
- Baseline phone/tablet run: 4 tests passed. Captures retained in `baseline/`, including
  `members-390.png` and `members-820.png`. Inspected the phone capture before editing.
- These are fixture browser observations, not hosted multi-account verification.

## Verification

- `npm run check`: PASS, including strict typecheck, lint, architecture/docs/AI contracts,
  55 unit/SQL tests across 10 files, and production build.
- `npm run format:check`: PASS.
- First focused browser validation: 5 passed, 2 failed. Both failures were new test
  selectors using `Invite Player` instead of the existing English `Invite player` label.
  Corrected the test selector; retained both traces/error contexts in `first-validation/`.
- `npm run test:e2e -- --output=docs/evidence/RYT-021/e2e --workers=4`: PASS,
  129 tests, no skips (1.6 minutes). Output retained separately in `e2e/`.
  Coverage includes character creation/resource editing, link/unlink focus restoration, Player preview,
  one-character eligibility, missing Players, failed member query/retry, invitation/roles,
  phone/tablet/desktop, both themes/languages, 150% text, reduced motion, axe and PRE profiles.
- Captures inspected directly: baseline phone Members; final phone Party and assignment
  dialog at 150%; final tablet Members in Spanish/dark and assigned Party in English/light
  at 150%.
- Independent `ui-ux`: PASS, [review](reviewer/review.md). The reviewer ran 14 additional
  focused browser checks plus a direct keyboard/focus script and inspected rendered captures.
  The occasional skip-link overlay in axe captures was verified as an audit artifact,
  absent in the normal dialog interaction. Reviewer harness attempts and limits are recorded
  in the review report.
- `npm run check:ui-review` and final `npm run check:docs`: PASS. The approved source digest
  is `c7da5ca8b841f0dd92aa9f72499dd3ed65c57b58bf2becc03bb055210f835dc1`.
  RYT-021 is complete locally; no release was performed.

## Boundaries

Browser mutations use the existing HTTP fixture and assert PRE request profiles. SQL tests
run against PGlite. No hosted PRE/PROD data changes, real two-account OAuth round trip,
physical-device/iOS Safari verification, commit, push or deployment is included.
