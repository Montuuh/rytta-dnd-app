# RYT-143 — Flaky browser test: Players read enemy health

## Cause

`tests/e2e/combat.spec.ts` collected `get_combat_state` bodies from an async `response` listener
that awaited `response.text()` and then pushed. The assertions could run before a pending body
arrived, and a body the browser had already discarded made the listener throw outside the test.

## Change

A `collectBodies(page, path)` helper keeps every body promise (a discarded body resolves to
`null`) and `settle()` awaits them all before asserting. Both tests that read projections use it.
What the test proves is unchanged: Players see named bands and tokens, and no projection carries
enemy numbers or secrets.

## Verification

- The RYT-043 enemy health test ran 30 times on each of identity-mobile, identity-tablet and
  identity-desktop: 90 passed, 0 failed (2026-11-20).
- The full browser suite ran afterwards (see the batch run in RYT-150's record).
