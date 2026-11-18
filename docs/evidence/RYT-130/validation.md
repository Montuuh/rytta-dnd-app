# RYT-130 — Party level and the guided level-up sheet

Branch `party-level-up`, head `916776e`. Covers migrations
`20261130120000_party_level_dice_settings.sql` and `20261202120000_level_up_history_absent.sql`.

## Commits

| Commit | Change |
|--------|--------|
| `c0b0d50` | Party level control for the DM and the guided level-up sheet for each Player |
| `cfaa547` | Boot script hash computed with normalised line endings, so a Windows checkout matches the browser |
| `37f9167` | Cantrips at levels 4 and 10, wizard spellbook picks, level-up history entry, refusal for absent characters, one request id per change |
| `916776e` | Failure alert placement, focus kept in the party-level dialog, one folded history entry per level up, wizard and ability-cap coverage |

## Design simplifications

- Wizard spellbook additions are stored as unprepared spells, because the sheet has no separate
  spellbook.
- Feats are free text.
- Level 19 uses the ability-increase choice.
- Multiclass level up is out of scope (ticket non-goal).

## Local validation

| Check | Result |
|-------|--------|
| `npx vitest run tests/database` (PGlite) | 35 files, 358 tests, all pass |
| `npm run check` | 99 files, 806 tests, build OK |
| `npm run test:e2e` on `916776e` | 905 passed, 76 skipped, 0 failed |

PGlite tests are not hosted Supabase integration.

### Earlier browser runs on this branch

Recorded so the initial failures are not hidden:

1. First run: 10 failures.
   - 6 character-sheet tests used the manual level stepper as a Player, which this delivery
     removes for Players; the tests were updated.
   - 4 security-headers failures came from hashing the boot script of a CRLF checkout; fixed in
     `cfaa547`.
2. Second run: 7 failures.
   - 4 artifact collisions with a concurrent run; they passed when run alone.
   - 1 scaffold keyboard test, fixed on `main`.
   - 2 level-up tests, later reworked.
3. Third run: 1 flaky glossary test; it passed 9 of 9 on repeat.

## Database

### Independent security review

Both migrations: SAFE, no critical, high or medium findings. Low findings:

- The PRE copy of a function is skipped silently if a PRE object is missing. Follow-up check after
  each apply: `pre.apply_level_up` must contain `ch.absent`.
- `party_level` is visible to campaign members by design.
- The DM / Player actor label ignores `active` (pre-existing behaviour, not introduced here).

### Staging (`rytta-staging`, `public` / `private` only)

- `level_up_history_absent` applied byte for byte; recorded version `20261118002811`.
- Static checks on the three functions: security definer / invoker as intended, empty
  `search_path`, no `anon` EXECUTE; RLS enabled on 43 of 43 `public` tables.
- Actor check, in one rolled-back statement:

| Actor | Action | Observed | Result |
|-------|--------|----------|--------|
| Player | Level up 1 → 2 | Level 2, max HP 12 → 20 | PASS |
| Player | Read character history | Exactly one `level_up` entry; actor `self`, no actor name, no party level | PASS |
| Outsider | Read history / level up | `Forbidden` for both | PASS |
| Player | Level up an absent character | `Character unavailable` | PASS |
| DM | Level up the same absent character | Accepted | PASS |

- All row counts were zero afterwards; no new advisor findings.
- Not verified on staging: PostgREST with real JWTs, `anon` at runtime, request replay, PRE remap
  (staging has no PRE schema).

### Hosted production

PENDING. The production apply runs right before the merge; this section is updated with the
recorded versions, the `pre.apply_level_up` / `ch.absent` check and advisor results.

## Independent code and rules review

- Changes required on `c0b0d50`: missing cantrip picks, no history entry, request id reuse, fixture
  drift. All addressed in `37f9167`.
- Rule tables (ability score improvement levels, subclass at level 3, hit dice, proficiency bonus,
  spell slots shared with character creation) match the SRD text shipped in the glossary.
- Prepared-spell counts for levels 2–20 could not be verified from the repository, because the
  glossary does not include the class tables.

## Independent UI review

- CHANGES_REQUIRED on `37f9167`, three blocking findings:
  - the failure alert was hidden behind the footer;
  - the party-level dialog lost focus on failure;
  - footer buttons were clipped in Spanish at 150 % text size.
- PASS on `916776e`.
- Non-blocking leftovers, moved to RYT-135:
  - the "+2" option says "Already at 20" for an ability at 19;
  - at 820px the scroll to the failure half-hides the summary row;
  - at 150 % text and 390px the typed-roll hint sits below the fold;
  - the DM dialog has two controls named Cancel.

## Not verified

- Hosted Supabase through the real API (PostgREST with real tokens).
- WebKit / iOS and real touch devices.
- Own (non-SRD) classes and retroactive Constitution hit points in the browser; unit tests only.
- Glossary loading and error states inside the level-up sheet.

## Status

Review (2026-11-18). Local checks, staging verification and both independent reviews are done.
Open before Done: the hosted production apply and its catalog check.
