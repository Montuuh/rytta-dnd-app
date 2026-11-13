# RYT-029 validation

Scope: remove campaign revelations (database and web) and the Camp module; Party is the Player
landing and the DM lands on the DM Command Center. See ADR 019.

## Results (local, worktree branch)

- `npm run check`: typecheck, lint, architecture, docs contracts, 106 unit and PGlite SQL
  tests, production build. Passed.
- `npm run test:e2e`: first full run 238 passed, 5 failed. Three failures were the
  "Our new table" heading assertion (the campaign index no longer renders a page with that
  heading), one was the mobile More-drawer test (the bar no longer overflows with Camp gone, so
  the test now enables a third planned module), and one was a transient
  `net::ERR_NO_BUFFER_SPACE` on `page.goto`. After fixing the tests, the identity, characters,
  campaign-items, scaffold and preferences specs were rerun: 192 passed, 0 failed. The remaining
  specs were not changed and passed in the first run.
- SQL: `tests/database/characters.test.ts` asserts the table, both RPCs and the policy no
  longer exist, and that DM, Player, outsider and anon get "does not exist" or "permission
  denied". The module-toggle denial test keeps Player, outsider and anon coverage. The PRE ETL
  test now expects 21 copied tables (was 22).
- Screenshots at 390px and 820px (tablet): `player-mobile.png`, `player-tablet.png`,
  `dm-mobile.png`, `dm-tablet.png` in this folder.

## Not verified

- Hosted Supabase: the migration is NOT applied to PRE or production. Apply it to PRE first,
  run the denial checks, then production, then confirm `list_migrations`.
- PGlite is not hosted Supabase; the guarded `pre.*` block of the migration was only exercised
  when PRE does not exist in the PGlite chain.
- Independent UI verdict: pending. This delivery changes navigation and removes pages;
  request the review before marking Done.
- Keyboard flow was covered by the existing focus tests, not by a new manual pass.
