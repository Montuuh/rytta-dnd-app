# Delivery RYT-045: Player death saves and end turn in the table view

Date: 2026-11-03. Branch `worktree-agent-ae5927fd60f8c7f7a`, cut from `main` at `f6e5ea0`
(RYT-040..044 merged). The hosted migration history ended at `combat_media`, matching the
repository; no merged work covered this ticket.

## Outcome

The user decided that, in the single Player table view (RYT-042), Players keep two combat
actions: ending their own turn and rolling their own death saves at 0 HP. HP changes,
conditions and undo stay DM actions in combat (HP and conditions remain editable on the sheet).

- **End my turn.** On the Player's own turn the banner's "Up next" half becomes the hand-off: a
  wide, heavy tile "Terminar mi turno · Pasa a Bea" with the next combatant's token, beside
  "¡Te toca!" on tablets and at the foot of the banner on phones or with large text. One tap, no
  confirmation; it never appears on other turns, for other combatants or in the DM's table view.
  Disabled (palette outline, focus kept) while a write is in flight or the data is stale. After
  ending, focus moves to the order's heading and the turn change is announced (existing live
  region).
- **Death saves.** At 0 HP on the own turn, the banner holds the tracker between "¡Te toca!" and
  the hand-off: two tracks of three notches, "Éxitos 10–19" and "Fallos 2–9". The next empty
  notch of each track is the control; a d20 at the end of each track takes the naturals
  ("20 natural: vuelves con 1 punto de golpe", "1 natural: dos fallos"). Filled notches are
  stamped in (no motion with reduced motion). One roll per round: afterwards the tracks are
  read-only, "Éxito marcado. El DM puede deshacer un error." shows and focus moves to the
  hand-off. Stable shows "Estable · Ya no tiras salvaciones de muerte." with all success notches;
  dead shows the failure notches and "Muerto"; a natural 20 replaces the tracker with a gold
  "Reanimado" card.
- **Outcomes for the table.** Every new death save is announced on every screen (polite live
  region: "Arin supera una salvación de muerte.", "… saca un 1 natural: dos fallos.",
  "… está estable.", "… ha muerto.", "… saca un 20 natural y vuelve con 1 punto de golpe.").
  Rows show compact notches to those who see the character's vitals (DM, own Player, sharing
  teammates) and "Estable" / "Reanimado" as icon + word to everyone, including teammates who do
  not share and the DM's table view; "Muerto" stays the status word. The former "Estable" pill is
  gone from the rows (no extra badges).
- **Undo-safe.** A mistaken roll is undone by the DM from the console log ("Deshacer: Arin:
  salvación de muerte, 20 natural"); the Player can then roll again that round.

## Scope and ownership

Owned paths:

- `supabase/migrations/20261108120000_combat_player_death_saves.sql` (new; sorts after
  `20261107120000_combat_media.sql`; no earlier migration edited)
- `src/features/combat/domain/combat.ts` (+ test): `death_state` in the schema, `deathState`,
  `deathSaveThisRound`, `canRollDeathSave`, `canEndTurn`, error codes `notYourTurn`,
  `alreadyRolled`
- `src/features/combat/ui/`: new `death-saves.tsx` (tracker), `table-display.tsx` (hand-off,
  tracker placement, announcements), `helpers.ts` (`useDeathSaveAnnouncements`), `parts.tsx`
  (`DeathLine` replaces the stable pill), `combatant-detail.tsx` (no duplicate notches in the DM
  detail), `initiative-entry.tsx` (exports the d20 shape), `combat.css`
- `src/shared/i18n/combat-{es,en}.ts`
- `tests/database/combat.test.ts`, `tests/e2e/combat.spec.ts`, `tests/e2e/fixtures/combat.ts`
- `docs/combat-design.md`, `docs/decisions/024-combat.md`, `docs/security.md`, this folder,
  `docs/backlog/items.json` (status `review`, evidence)

Non-goals: Player HP, condition or undo controls in combat; changes to the DM console (its death
save panel and log undo are reused as they are).

## Database change

`advance_turn` is unchanged: for a caller that is not an active DM it already moved only
forward, only from the active combatant, and only when that combatant is a character the caller
plays; `expected_active` refuses double taps. Verified, not tightened.

`record_death_save` (same signature, grants, campaign lock, request-id replay) adds rules for
Players: only on the own turn of an active encounter (`Not your turn`), once per round unless the
round's roll was undone (`Already rolled`; this also absorbs double taps sent with a new request
id), and never once stable (`Not dying`). SRD basis: a creature at 0 HP rolls at the start of each
of its turns. The DM still records any save at any time. Outcomes are unchanged (nat 1 = two
failures, nat 20 = 1 HP, saves reset, unconscious removed; three successes stable; three failures
dead/defeated).

`get_combat_state` (same signature and grants) adds `death_state` per character: `stable` (0 HP,
three successes, not dead) and `revived` (above 0 HP while the round's last non-undone death save
was a natural 20). It reaches every projection, including the table and teammates who do not
share live vitals (a deliberate visibility change recorded in ADR 024 and `security.md`); success
and failure counts keep the `shares_live` rule. No DM-private field is added.

Actor matrix (both RPCs): anon has no execute; outsiders and inactive members raise `Forbidden`;
another Player raises `Forbidden` for characters they do not play, NPCs and others' turns, and
`Combatant unavailable` for hidden combatants; a DM of another campaign raises `Combatant
unavailable` / `Encounter unavailable` through its own campaign id; ended encounters raise
`Encounter closed`.

## Verification

| Check | Result |
| --- | --- |
| `npx vitest run tests/database/combat.test.ts` (first run) | 2 failed: the RYT-007 death save test had the Player roll off the own turn and four times in one round (now refused by design; it gives Arin the turn and lets the DM record the rest), and the new test expected `Stale turn` for a Player's late double tap of end turn, but `advance_turn` reports `Forbidden` once the Player no longer holds the turn (expectation corrected, function left unchanged) |
| same, after the fixes | 14 passed (the RYT-045 test runs in `public` and in the PRE mirror and checks the PRE bodies have the rules and no `public.`/`private.` references) |
| `npm run typecheck`, `npm run lint` | lint first flagged `only-export-components` in `death-saves.tsx` (hook moved to `helpers.ts`); then both passed |
| `npm run check` | passed: 32 files / 237 tests, build OK |
| `npx prettier --check --end-of-line auto src tests docs supabase` | passed (a plain `--check` flags CRLF working-copy endings only) |
| RYT-045 e2e, 3 identity projects | 9 passed on the first run |
| RYT-045 e2e with evidence | one run had 1 flaky phone failure: the test tapped "Terminar mi turno" and immediately moved the turn through the fixture, racing the click's request; the test now waits for the banner before moving on |
| `CI=1 npm run test:e2e` run 1 (ports 4173/4174 free, servers started by the run) | 425 passed, 49 skipped, 3 failed: the RYT-007 two-context test asserted that the Player had no "Terminar mi turno" control on the own turn (the RYT-042 behaviour this ticket reverses); updated to expect the hand-off and to check it leaves when the DM moves the turn |
| `CI=1 npm run test:e2e` run 2 | 428 passed, 49 skipped, 0 failed, 0 flaky (3.7 min) |

E2E (identity desktop 1440, tablet 820, phone 390; the fixture mirrors the new SQL rules and
projection):

- End turn: only Arin's device shows the hand-off on Arin's turn ("Pasa a Bea"); Bea's device has
  none and shows "Te toca dentro de 1 turno"; no row control; the fixture refuses Bea ending
  Arin's turn; a tap moves the turn once (one turn event), the control leaves and focus lands on
  the order's heading; Bea's turn arrives with her hand-off and the keyboard (Enter) ends it.
- Death saves (Arin, Cato and the DM in three contexts): the tracker and the four controls on the
  own turn only; no tracker or hand-off on Cato's device or the DM's table view; a success is
  stamped, announced on both Players' screens, locks the round (no buttons; the fixture refuses a
  second roll with `Already rolled`) and focuses the hand-off; round 2 natural 1 = two failures;
  round 3 natural 20 = "Reanimado", 1/24 PG, "Reanimado" on Cato's and the DM's rows; the DM
  undoes it from the console log and Arin rolls again; the third failure = "Muerto" for everyone,
  and Arin still passes the turn; Cato stable by the DM: Arin reads "Estable" without notches
  (Cato does not share), Cato's own banner shows "Estable · Ya no tiras…" with no control.
- English + light theme: tracker labels, hand-off "Passes to Bea", "Failure marked…", axe; 150%
  text: no horizontal scroll, 44px hand-off.
- axe (WCAG 2.1 AA tags) on every step above; touch targets on the notches, dice and hand-off;
  RYT-042/043 tests unchanged except the two assertions that encoded "no end turn for Players".

## PRE rehearsal (hosted project `ekscdsmniukuxqjixapu`, PRE only)

1. `npm run pre:plan -- --print-sql` executed through the MCP connection: read-only plan,
   `dryRun: true`, `targetExists: true` (no refresh needed or done).
2. Applied only the migration's PRE branch (`execute pre_admin.remap(ddl)`) to `pre`. Verified:
   `pre.record_death_save` has the rules and `pre.get_combat_state` the `death_state` field, no
   `public.`/`private.` references, `anon` cannot execute and `authenticated` can. The `public`
   bodies kept their md5 (`6604bd9f…`, `f7c4c959…`) before and after: production untouched.
3. Behaviour in one transaction rolled back by a final exception (the real PRE DM, Player and a
   non-member auth user; a second, unassigned character, a goblin and a hidden ogre created inside
   the transaction): starts on the Player's character; own success ok, retry replayed, second
   roll `Already rolled`; other character `Forbidden`; goblin `Forbidden`; hidden ogre
   `Combatant unavailable`; going back `Forbidden`; outsider save and turn `Forbidden`; outsider
   as DM of a new campaign: save `Combatant unavailable`, turn `Encounter unavailable`; anon
   `permission denied`; the Player ends the own turn (retry replayed), a late double tap and
   ending another's turn `Forbidden`; off-turn save `Not your turn`; the DM records three
   successes on the other character (`stable`), round 2 returns to the Player; natural 20 `up`;
   the table projection shows `revived` for the Player and `stable` for the other character; the
   Player projection shows `stable` for the unshared character without counts or HP, no
   `dm_notes`/`hidden` keys and no ogre; the DM undoes the natural 20 (state cleared) and the
   Player rolls again (natural 1); after the end `Encounter closed`. Afterwards PRE had 0
   encounters, 1 campaign and no rehearsal character; `public` had no rehearsal rows.

Production migration: not applied (the integrator applies it after merge). Recovery for PRE:
re-run `pre_admin.remap(pg_get_functiondef(...))` with the `public` bodies of `record_death_save`
and `get_combat_state`, or a PRE refresh.

## Screenshots (inspected)

Captured with `RYT_EVIDENCE=1` at 390 px (`-mobile`) and 820 px (`-tablet`): `end-turn`,
`death-saves`, `death-saves-marked`, `revived`, `dead`, `stable` (dark, Spanish),
`death-saves-en-light` and `death-saves-150` (light, English, 150% text). Only RYT-045 tests ran
with evidence on; no other ticket's screenshots changed. Adjustments after inspecting the first
captures: the hand-off label no longer wraps (the next-combatant line shares its row with the
chevron, and the tablet column is wider), and the own-turn banner stacks through a container
query in em, so 150% text on a tablet no longer squeezes "Your turn!" beside the hand-off.

## Untested layers

- Real Supabase Auth/PostgREST/Realtime with several signed-in accounts (PGlite + SDK fixture +
  PRE SQL with role and JWT claims set, not through PostgREST).
- Production schema (`public`): intentionally not applied. Until it is, a deployed client still
  gates the controls, but production `record_death_save` would not enforce the turn and
  once-per-round rules and the projection has no `death_state`.
- Real devices: touch on iOS Safari / Android Chrome, vibration, screen reader output (checked
  through accessible names and live-region text only).
- The stale-data disabled state of the hand-off is covered by code and the existing stale banner,
  not by an e2e scenario.

## Handoff and review

- Behaviour change: RYT-042 removed Player end turn and death saves; RYT-045 restores those two,
  redesigned for the table view, with stricter server rules for death saves.
- The independent `ui-ux` review is pending (not self-approved; `ui-review-current.json` not
  touched); the ticket is in `review`.
