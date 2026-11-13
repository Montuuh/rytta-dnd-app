# RYT-007 / RYT-036 / RYT-037 / RYT-038 verification

Date: 2026-11-03. Branch `cl/eloquent-keller-w3cwpn` on top of `main` at `cdc7646`. Design:
[combat design analysis](../../combat-design.md). Decision record:
[ADR 024](../../decisions/024-combat.md).

Migration: `supabase/migrations/20261104120000_combat.sql`. It is additive: five tables plus
`private.combat_requests`, 24 RPCs, triggers on vitals, sheets and resources, a guarded
realtime publication entry and a PRE mirror. No existing rows change.

## Automated checks

| Check | Result |
| --- | --- |
| `npm run check` (typecheck, lint, architecture/docs contracts, 174 unit/SQL tests, build) | Pass |
| `tests/database/combat.test.ts` (PGlite, 8 tests, public and PRE mirror) | Pass |
| `tests/database/pre.test.ts` | Initially failed: the ETL dry-run table count moved from 23 to 29 (assertion updated) |
| `src/features/combat/domain/combat.test.ts` (order, ties, DC, preview projection) | Pass |
| `tests/e2e/combat.spec.ts` on identity desktop, tablet and mobile (2 tests each) | 6 passed |
| CI `verify` on the first push | Failed only at `UI review check` (review pending) |

On the first runs, the e2e found two real issues, both fixed before review:
- After typing a missing initiative, the detail drawer popped open.
- Two scroll regions were not keyboard-focusable (axe `scrollable-region-focusable`).

The e2e ran on a local, uncommitted Playwright config that points at the container's
preinstalled Chromium, because the repo pins a different browser build. The full e2e suite was
not re-run here; only the combat spec was.

## SQL coverage (`tests/database/combat.test.ts`)

- **Flow:**
  - Drafts are hidden from Players.
  - Players enter their own initiative; the server rolls once for a shared group.
  - The DM can reorder ties.
  - Double taps are guarded by the expected active combatant, and retries are replayed.
  - A Player can end only their own turn.
  - Hidden combatants are skipped, rounds wrap, the DM can jump turns, and there is one live encounter per campaign.
  - Attribution and summary work, and the summary filters hidden combatants for Players.
- **HP and vitals:**
  - Temporary HP do not stack and absorb damage first.
  - Concentration DC is computed, and concentration ends at 0 HP.
  - Multi-target damage runs in one transaction.
  - Unconscious at 0, death saves (failure on damage, nat1, nat20, three failures = dead), and healing wakes the character.
  - NPCs are defeated at 0 and revived on heal.
  - Character conditions are stored in `character_vitals`.
  - Idempotent replay works, and a mismatch is rejected.
  - A resource change bumps the encounter revision.
- **Effects:**
  - Effects tick at the source's end or start of turn, expire, and remove the condition they granted.
  - Secret effects stay hidden from Players.
  - Players can add effects only to their own character.
- **Undo:**
  - A Player can undo their own event.
  - "Already undone", "Undo conflict" after a later change, and "Not undoable" for turns are enforced.
- **Projection:**
  - No hidden combatants, NPC HP or AC, DM notes, secret effects or private events reach Players.
  - Unshared teammates show only name and order.
  - The table view has no own data.
  - Revealed HP become visible.
  - Players can read only the `encounters` rows; the other combat tables return 0 rows.
- **Bestiary:** template revision checks, numbered batches, the lair, and DM-only access.
- **Denials:**
  - anon: permission denied.
  - Outsider and DM of another campaign (campaign-id swap): Forbidden or unavailable.
  - Player: every DM operation is denied.
  - Direct writes by Player and DM are denied.
  - Inactive members lose access.
- **PRE:** the mirror exists (tables, triggers, functions); its sources contain no `public.` or `private.` references; and the 14 SRD conditions match between client, sheet and SQL.

## Hosted Supabase (project Rytta)

- **Before:** no combat objects. PRE existed (1 campaign). History ended at `glossary_homebrew` (20261103113032), which another session applied; it is not part of this branch or of `main`.
- **PRE first:** the exact migration text was applied through `pre_admin.remap` (the ETL mapping). Verification:
  - The `md5` over every combat function body in `pre`/`pre_private` (`39d1ac64…`, 46 functions) equals the PGlite digest of the repository file.
  - `pre.encounters` joined `supabase_realtime`.
- **PRE probes** ran as the real PRE DM and Player, in a transaction that was aborted, so nothing persisted. Results:
  - The DM created, prepared and started an encounter.
  - The Player set their own initiative.
  - The Player got Forbidden on the NPC's initiative and "Combatant unavailable" on the hidden ogre.
  - The Player projection had 2 combatants, no "Ogre" and no DM notes, and showed the goblin only as `hp_status`.
  - The Player got 0 rows from `pre.encounter_combatants`, and direct writes were denied.
  - The turn moved to the goblin; a repeated "next" was refused with `Stale turn`.
  - Outsiders got Forbidden, and anon got permission denied on both the RPC and the table.
- **Production:** the reviewed migration was applied with `apply_migration` (history `20261103113621 combat`). Verification:
  - Its digest (`470c1755…`) equals the PGlite digest of the public schema, and the PRE digest did not change.
  - The realtime publication now has `public.trades, pre.trades, pre.encounters, public.encounters`.
  - anon cannot execute the RPCs or read the tables, and `authenticated` cannot execute the private helpers.
  - 6 triggers exist (3 per schema), and there are 0 encounter rows in both schemas.
- **Production probe** (aborted transaction): outsiders got Forbidden on list, create and the PRE read; direct inserts were refused; anon was denied.
- **Advisors:** nothing new beyond existing patterns. They flag the intentional security-definer RPCs (same as every earlier RPC) and RLS without policies on the private request tables (same as the other request tables).

## UI evidence

- Screenshots in Spanish, dark theme, at 390px (`*-mobile.png`) and 820px (`*-tablet.png`), captured with `RYT_EVIDENCE=1`:
  - `dm-prepare`, `player-initiative`, `dm-active`, `player-turn`, `dm-area-damage`, `dm-log`, `table`, `summary`.
- English and light: `player-turn-en-light-*`.
- The independent UI review is in the review report:
  - Round 1: CHANGES_REQUIRED (B1–B3, M1–M4 and minors), all fixed.
  - Re-review 1: CHANGES_REQUIRED (N1–N3), fixed.
  - Re-review 2: CHANGES_REQUIRED (the N3 toast covered the turn bar and dialog buttons on phones), fixed.
  - Re-review 3: **PASS** for UI fingerprint `a3385ecf…c328e`.
- At the user's request, the follow-ups were fixed and re-reviewed:
  - Re-review 3 minors (drawer error far from the control; a toast that never left): fixed.
    Re-review 4 PASS.
  - N4 (sticky error covering the failed button) and N5 (focus lost on dismiss): fixed.
  - Re-review 5 found N6, a regression where polling scrolled the drawer back every 4 s. It is
    fixed by applying placement once per error. An e2e assertion was added; it fails on the
    previous code and passes on the fix.
- Re-review 6: **PASS** for fingerprint `e0b7fbc7…d164b`.
- Also fixed at the user's request:
  - `scroll-padding-top` on the drawer, from the optional observation in re-review 6. Re-review 7
    PASS.
  - N7, so that padding scales with text size. Re-review 8 **PASS** for fingerprint
    `3c8b9224…cb35d`, recorded in `docs/evidence/ui-review-current.json`.
  - No review findings remain open.
- **Merge with main (RYT-035 review fixes):**
  - Re-review 9 found I1, a major issue: Players could open combat by URL while the DM had the
    module off. It also found I2, a minor one: the list did not use the compact phone page head.
  - Both are fixed, with an e2e test for I1. Re-review 10: **PASS** for the merged fingerprint
    `d6ab88f6…fd21d0`, recorded in `docs/evidence/ui-review-current.json`.
- **Open follow-ups:**
  - The Spanish DM-list lede wraps to two lines on tablet and wide.
  - Main's 5-item bottom bar truncates its labels at 150% text (RYT-035 scope).
  - The `identity.spec.ts` hand-over test failed once under load; it passed 9/9 in isolation.

## Not tested / limitations

- **Realtime:** delivery between two hosted clients was not exercised. The e2e stubs the websocket, so only the polling fallback (4 s live) ran, and PGlite has no realtime. The publication and RLS were verified on the hosted catalog only.
- **Google sign-in:** not exercised against hosted Supabase for the combat screens. Hosted coverage is SQL-level, as the real PRE users.
- **Fixture gaps:** the e2e fixture does not implement the success paths for effects and death saves; those are covered only by the PGlite tests.
- **DM Player-preview:** the projection is presentation-only (`previewAsPlayer`, unit tested).
- **Not checked:** other class themes, iOS Safari and screen readers.
- **Type generation:** `npm run db:types` was not run. `src/shared/api/combat-functions.ts` carries the reviewed RPC contract.

## Post-release fix (2026-11-03): combat state failed to load in PROD

- **Symptom:** the combat screen showed "We could not load this information" for a draft encounter in PROD.
  Every combat RPC returned HTTP 200; the client's `combatStateSchema` rejected the payload.
- **Cause:** `get_combat_state` built booleans from NULL comparisons that `jsonb_strip_nulls` then removed:
  `is_active` while no turn is active (draft, initiative), `is_own`/`can_act` for characters without a
  linked player, and `can_remove` (unstripped, JSON null) for Players on effects targeting NPCs.
- **Fix:** `supabase/migrations/20261104130000_combat_state_booleans.sql` recreates only
  `get_combat_state` with `coalesce(..., false)`; same signature, grants and projection, with the guarded PRE mirror.
- **Tests:** new PGlite test parses public and PRE states with the client schema (draft and initiative;
  DM, table and Player; unlinked character; NPC effect). It failed before the fix and passes after.
  `npm run check`: 29 files, 205 tests passed.
- **Hosted:** applied to production as `combat_state_booleans`. Checked as the PROD DM: the draft encounter now
  returns `is_active: false` on every combatant. `anon` cannot execute public or PRE; `authenticated` can.
  The PRE copy carries the fix and has no `public.` references.
- **Not tested:** the e2e suite and the hosted Player/table views on PROD (that campaign has no non-draft encounter).
  No UI change, so no UI review applies.
