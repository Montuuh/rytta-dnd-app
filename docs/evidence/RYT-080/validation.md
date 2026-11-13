# RYT-079–082 verification: group rest with a vote, absence, the new-character card and 3D dice

Delivery of 2026-11-10 on `main` (base a1231ce, equal to `origin/main` after `git fetch`).
Decision: [ADR 037](../../decisions/037-group-rest-and-absence.md). Design flow:
design flow. Tickets RYT-079, RYT-080, RYT-081 and RYT-082.

## What changed

- **Database** (`supabase/migrations/20261114120000_group_rest_absence.sql`):
  - `characters.absent` with its invariants: never active, benched roster accepted, guard
    triggers on the character's sheet, play state, resources, inventory, shop orders and
    encounters;
  - `set_character_absent`, and `set_active_character` for the DM;
  - `rest_requests` (members read for realtime), `private.rest_votes`, `private.rest_effect`
    and `rest_apply`;
  - `get_rest_state`, `request_rest`, `vote_rest`, `resolve_rest_now`, `cancel_rest`;
  - the history names `absent`;
  - PRE mirror through `pre_admin.remap`.
- **Rest feature** (`src/features/rest/*`): domain schemas and helpers, repository with realtime
  invalidation, the provider, the notice, the request dialog, the Hoguera panel, the dice chooser
  and recovery lines.
- **Dice** (`src/shared/ui/dice/*`, `public/vendor/dice-box/*`): vendored MIT dice-box loaded on
  first use; reduced motion, no WebGL and failures fall back to an even crypto roll.
- **Characters**:
  - the sheet's rests ask the group (`domain/rules.ts` `restRecovery` previews what comes back),
    and an absent character's sheet is read-only for its Player;
  - Party: the new-character card and the benched notice, with the DM header button removed;
  - the roster: the absence and active choice in the 3-dot menu, a No player section and
    Absent states;
  - roster domain and repository: `absent`, `benched`, and the DM listing includes unassigned
    characters.
- **Layout**: `.top-notices` holds the Player preview banner and the rest notice under the
  header; `RestProvider` wraps the campaign layout.
- **Copy**: `src/shared/i18n/rest-{es,en}.ts`.

## Checks

- Database (PGlite, `tests/database/group-rest.test.ts`, 9 tests):
  - absence: out of the active lists, owner read-only (vitals, sheet, rename), benched switching
    refused, new characters in reserve, DM keeps control, DM picks the active character,
    present again in reserve or active;
  - refused in a live encounter, in combat additions and in archiving;
  - history names `absent`;
  - unanimous long rest: replay and mismatch, one open request, the DM votes for unassigned
    characters, every voter rested;
  - short rest dice validation and healing (roll + CON per die), 0 HP characters skipped;
  - one no rejects; DM rest now and cancel, requester cancel, expiry;
  - fighters and absent characters cannot ask; a private teammate's recovery is hidden;
  - denials for anon, outsiders, another Player and a cross-campaign DM on every RPC;
  - votes are never readable;
  - PRE mirror with no production references.
- Updated database tests:
  - `character-roster.test.ts`: the DM may now pick a Player's active character (user decision);
  - `pre.test.ts`: 41 tables.
  All database tests pass (150).
- Unit:
  - `src/features/rest/domain/rest.test.ts`: tally, heal, roll validation, errors, minutes left,
    schema;
  - `rules.test.ts`: the rest preview by kind and at 0 HP.
- E2E (`tests/e2e/rest.spec.ts`, phone and tablet):
  - long rest asked from the sheet with the check;
  - the Hoguera panel with three seats, the private teammate, the banner on other pages, votes
    by teammates and the outcome;
  - short rest dice: invalid roll, typed roll, Rytta's roll, vote, a no rejects;
  - the DM's view and Rest now;
  - the DM's own request rejected, and expiry;
  - absence from the 3-dot menu (archive blocked, out of Party, present again);
  - the benched Player in Party, My characters and the sheet;
  - the new-character card;
  - the 3D dice roll with no page errors.
- Updated e2e:
  - `character-sheet.spec.ts`: the long rest now asks the group, at 150 % text in ES/EN, dark
    and light;
  - `characters.spec.ts`: DM creation goes through the New character card.
- Full `npm run test:e2e` before the critique fixes: 546 passed, 0 failed, 55 skipped (3.8 min).
- PRE: the remapped DDL was executed into `pre`/`pre_private`. 17 functions are present with no
  production references. Anon executes none; `authenticated` executes only the seven public RPCs.
  `pre.rest_requests` is in the realtime publication, and existing PRE characters are unchanged.
- Production: applied as hosted migration `group_rest_absence` (same DDL; the PRE branch was
  skipped because PRE was mirrored first). Checked afterwards:
  - anon executes none of the new functions; `authenticated` executes only the seven public RPCs;
    the ten private helpers are closed;
  - `rest_requests` has RLS on, and both `public.rest_requests` and `pre.rest_requests` are in the
    realtime publication;
  - the seven absence triggers exist in both schemas;
  - the nine existing characters are unchanged (seven active, none absent).

  Security advisors list `rest_votes` as "RLS enabled, no policy" (by design: votes are read
  only through the RPCs, like the other private request tables). The new RPCs appear under the
  generic "security definer executable by authenticated" notice that every Rytta RPC carries.
- Full `npm run test:e2e` after the review fixes: 566 passed, 0 failed, 55 skipped. A first run
  failed 25 tests with `ENOENT` on `test-results/` traces, because a concurrent reviewer run
  cleared the folder; the rerun with a separate output folder passed. The sheet's stale-revision
  step was intermittent (the refetch after the first write could land after the simulated
  change). `staleVitals()` in the fixture now forces the next write to meet the stale revision;
  16/16 repeated runs passed.
- `npm run check`: typecheck, lint, architecture, docs (83 tickets), 50 test files /
  354 tests and the build pass.

- Independent UI review:
  - round 1: CHANGES_REQUIRED (2 blockers, 5 majors, 12 minors);
  - round 2: CHANGES_REQUIRED (the dock measurement);
  - round 3: PASS on fingerprint `7f698a7c46c0ebd9c5f622f07ab8c7c05ce93c16ffacda52cfd9c8ec86bad775`.

  See the design flow and the report.

## Not covered

- Realtime delivery was not exercised against hosted Supabase. The e2e fixture has no websocket,
  so the panel updates by its 5 s polling fallback in tests.
- The 3D roll was checked in Chromium at 390 and 820 px; iOS Safari (OffscreenCanvas fallback to
  the on-screen world) is not covered.
- An absent character's existing tabletop tokens stay on the map; new combat additions are refused.
- A DM unassigning a benched Player's absent character while that Player has other characters
  meets the roster rule ("Active character required"); mark the character present first.
