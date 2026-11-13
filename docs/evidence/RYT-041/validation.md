# Delivery RYT-041: combat roster changes and turn focus

Date: 2026-11-03. A worktree branch, cut from `main` at `c9ed08f`
(the hosted migration history matched the repository: last applied `combat_state_booleans`).

## Outcome

- The DM adds a party character to a running fight with its initiative total. The dialog reuses
  the initiative keypad and previews where the character lands (its neighbours in the order) and
  whether it still acts this round or from the next one.
- The DM removes any combatant at any status except ended, from a row's options menu (also
  opened by holding the row or right-clicking it) or from the detail's DM menu. A confirmation
  dialog states the consequence: who takes the turn when the active combatant leaves, and that a
  character keeps its hit points and conditions while combat effects on it end.
- Removing the active combatant passes the turn forward like "Next turn": same round, or the
  next round when it was the last one; the new combatant's legendary actions reset and its
  start-of-turn effects tick.
- The DM detail follows the turn: it shows the highest-initiative combatant when the fight starts
  and the acting combatant after every next/previous turn. A row picked between turns stays until
  the turn moves. It does not swap while the DM is using the detail (focus or a dialog inside it).
  Phones open the detail from a row or from the acting name in the turn bar.
- Turn changes are announced in a polite live region ("Turno de Bea. Ronda 1.") and keyboard
  focus stays on the button the DM pressed. The turn buttons no longer become `disabled` while
  saving (that dropped focus to the page); they use `aria-disabled` and ignore repeated presses.
- No full screen button for anyone; Players have no "exit table view" link (the DM keeps it).

## Scope and ownership

Owned paths:

- `supabase/migrations/20261105100000_combat_roster.sql` (new; no earlier migration edited)
- `src/features/combat/` (domain `joinPlacement`, repository entry schema, `roster.tsx`,
  `dm-console.tsx`, `initiative-rail.tsx`, `combatant-detail.tsx`, `add-combatants.tsx`,
  `amount-dialog.tsx`, `combat-log.tsx`, `combat-page.tsx`, `table-display.tsx`, `player-view.tsx`,
  `combat.css`)
- `src/shared/i18n/combat-{es,en}.ts`
- `tests/database/combat.test.ts`, `tests/e2e/combat.spec.ts`, `tests/e2e/fixtures/combat.ts`
- `docs/combat-design.md`, `docs/decisions/024-combat.md`, `docs/security.md`, this folder

The character list in "Add combatants" still comes from the characters public API
(`charactersQuery`) minus characters already in the encounter; RYT-044 (active character) can
filter that API without changes here. Non-goals: RYT-042 (Player table-only view, summary) and
RYT-043 (visual redesign).

## Database change

`20261105100000_combat_roster.sql` replaces two RPCs with the same signatures and grants and adds
one private helper. The DDL runs on `public`/`private` and, when a PRE with the combat RPCs exists,
again through `pre_admin.remap` into `pre`/`pre_private`.

- `public.add_combatants`: character entries accept an optional `initiative` (-20..99, whole
  number). An active encounter without an active combatant (everyone left) resumes with the first
  combatant in the order.
- `public.remove_combatant`: when the active combatant leaves, the turn moves forward from its
  slot (wrapping into the next round), with legendary reset and start ticks; effects on the
  leaving combatant end through `combat_drop_effect` (clearing conditions they granted on the
  sheet, logged `effect_off`); then `leave` is logged and the row deleted.
- `private.combat_start_turn(e, who)`: shared start-of-turn step; no client execute grant.

Both RPCs stay DM-only, lock the campaign row and replay request ids. Known consequences
(recorded in ADR 024): a removed combatant leaves the end-of-combat summary; its log entries
stay but can no longer be undone (the log hides that undo button).

## Verification

| Check | Result |
| --- | --- |
| `npx vitest run tests/database/combat.test.ts` | first run 4 failed (ambiguous `target_combatant` in the effects loop; a test assumed Arin started without set initiatives); fixed; then 12 passed |
| `npm run check` (typecheck, lint, architecture, docs, unit + SQL, build) | first lint run failed (`set-state-in-effect` in the turn-follow effect; reworked as derived state); final run on the committed code: passed, 29 files / 209 tests, build OK |
| `CI=1 npx playwright test tests/e2e/combat.spec.ts` | first runs: "Next turn" lost focus (disabled while pending, a real bug, fixed), axe on the removal dialog ran while the menu was still closing (test now waits), detail tab not open on laptops (test opens it); then 24 passed, later 27 with the English/light test |
| Full e2e, spare ports (local uncommitted config override, ports 4473/4474) | 314 passed, 48 skipped, 4 failed: `identity.spec.ts:13` on 3 projects (asserts the fixed 4174 callback URL, an artifact of the override) and `shops.spec.ts:146` tablet (passed 5/5 when re-run alone; shops untouched) |
| `CI=1 npm run test:e2e` (fixed ports 4173/4174, servers started by this run) | first attempts refused (ports busy with other worktrees, fail-fast); final run on the committed code: 318 passed, 48 skipped, 0 failed (4.5 min) |

SQL role matrix (PGlite, real migrations, `public` and the guarded PRE mirror):

- DM: add with initiative (ordering, retried request replays `added: 2`), remove a non-active
  combatant (turn unchanged), remove the active one (same round, legendary reset to 0, start
  effect ticked, `turn` logged), remove the last of the round (wraps to round 2, `round` logged),
  remove everyone (no active turn) then add (resumes with its turn), effect-granted condition
  cleared from `character_vitals`, invalid initiatives (100, -21, 1.5, "12") rejected.
- Player: add and remove raise Forbidden. Outsider: Forbidden. DM of another campaign: removal
  through its own campaign id raises Combatant unavailable, adding raises Encounter unavailable,
  and adding this campaign's character to its own encounter raises Character unavailable.
  Anon: permission denied on both RPCs. Clients cannot execute `private.combat_start_turn`.
- PRE copy: the same RPCs in `pre`, Player denial, and the remapped helper has no `public.` or
  `private.` reference.

E2E (identity desktop 1440, tablet 820, phone 390): detail on the starting combatant; next turn
moves the detail, keeps focus on "Next turn" and announces it; a picked row stays until the
next turn; join preview for this round and next round; removal confirmation (Escape cancels),
turn passes on, focus lands on the neighbouring row; holding a row opens the same menu; the
newcomer acts this round; Players' table view has no exit or full screen; English + light
theme dialogs pass axe; touch targets audited in every dialog.

## PRE rehearsal (hosted project `ekscdsmniukuxqjixapu`, PRE only)

1. `npm run pre:plan -- --print-sql` executed through the MCP connection: read-only plan,
   `targetExists: true` (no refresh needed or done).
2. Applied only the remapped DDL (`execute pre_admin.remap(ddl)`, the migration's PRE branch,
   comments trimmed) to `pre`/`pre_private`. Production `public`/`private` were not touched.
3. Verified: `pre.add_combatants`/`pre.remove_combatant` have the new bodies, no `public.` or
   `private.` references, `anon` cannot execute, `authenticated` can;
   `pre_private.combat_start_turn` is not executable by `anon` or `authenticated`; `public`
   functions still have the old bodies and `private.combat_start_turn` does not exist.
4. Behaviour in one transaction rolled back by a final exception (real PRE DM, Player and a
   non-member auth user): order after a mid-combat join at 20 was `miau, mariconcete, Goblin 1,
   Goblin 2`; advance went to Goblin 1; removing it kept round 1 and gave the turn to Goblin 2;
   the retried request replayed; removing Goblin 2 wrapped to round 2 with `miau` acting.
   Player remove/add: Forbidden. Outsider: Forbidden. Outsider as DM of a new campaign:
   Combatant unavailable / Encounter unavailable. Anon: permission denied for both functions.
   Afterwards PRE still had 0 encounters and 1 campaign (nothing persisted).

Production migration: not applied (integrator applies it after merge). Recovery for PRE: re-run
`pre_admin.remap(pg_get_functiondef(...))` of the unchanged public functions, or a PRE refresh.

## Screenshots (inspected)

`turn-focus`, `join`, `remove-active`, `after-roster`, `player-table`, `join-en-light`,
`remove-en-light`, `remove-dialog`, `remove-dialog-150`, `join-dialog`, `join-dialog-150`, each at
390 px (`-mobile`) and 820 px (`-tablet`), captured with `RYT_EVIDENCE=1`. Refreshed after the
review fixes.

## Untested layers

- Real Supabase Auth/PostgREST/Realtime with two signed-in accounts (PGlite + SDK fixture + PRE
  SQL only). The hosted PRE check ran as SQL with role and JWT claims set, not through PostgREST.
- Production schema (`public`) on the hosted project: intentionally not applied.
- Long press on real iOS Safari and Android Chrome devices: covered by Chromium emulation with raw
  CDP touch events only. Screen reader output was checked through accessible names and the live
  region text, not with a real screen reader.
- The join placement preview mirrors the server order for a character without a tiebreak bonus;
  a DM-reordered tie (`order_key`) can differ, and the order shown after saving is the server's.

## Handoff and review

First independent UI review of `b3f5e50`: CHANGES_REQUIRED, see the review report
(committed as delivered). Every finding is addressed in the follow-up commit:

| Finding | Change | Test |
| --- | --- | --- |
| F1 major: cancelling a dialog opened from a row menu dropped focus to `<body>` | The console remembers which menu opened the dialog and refocuses that menu's button on Escape, Cancel or a saved initiative (`data-return-focus`, because Mantine's `Menu.Target` owns the trigger `id`). `useReturnFocus` now resolves an opener inside a menu to the menu's button; before, the keypad dialog refocused the closing menu's focus holder, which then vanished. The detail's DM menu returns focus to its own button. | e2e: removal and change initiative, each cancelled with Escape and with Cancelar, focus on "Opciones de Goblin 1"; laptop: detail menu |
| F2 minor: a raw touch long press opened the menu and the compatibility `mousedown` on release closed it | After a long press, the row cancels the `touchend` default so Chromium sends no compatibility mouse events or click | e2e with CDP `Input.dispatchTouchEvent` (tablet, phone): menu still open 400 ms after release, no detail sheet; a short tap still opens the detail. Failed before the fix |
| F3 minor: dialog actions wrapped with Cancelar alone | `.combat-dialog-actions` (removal and keypad dialogs): one row when both fit, otherwise full-width buttons with the action on top (`wrap-reverse`) | e2e at 390/820/1440 px and 150% text: same row, or stacked full width with the action above Cancelar |
| F4 minor: the sheet opened from "Ahora" returned focus to the list row | The sheet remembers its opener (row or turn-bar button) | e2e (tablet, phone): Escape returns focus to the turn-bar button |
| F5 minor: two menus named "Opciones de {name}" | Detail menu is "Más controles del DM para {name}" / "More DM controls for {name}" | e2e uses both names |
| F6 nit: fixed 32 px preview chips | `min-width`/`min-height` 2.2em with padding | e2e checks no overflow at 150% |
| F7 nit: redundant copy and a stray space | Removed the list hint and the keypad hint in the join dialog; the turn-bar button has one accessible name: "Ahora · Ronda 1, Arin, Después: Bea. Ver detalle" | e2e asserts that name |

Follow-up verification: `npm run check` passed (29 files / 209 tests, build OK). Combat spec on
spare ports: 35 passed, 1 skipped (the touch test skips the laptop project). `CI=1 npm run
test:e2e` on the fixed ports: two attempts were refused because another worktree took 4173 first;
the third run, with servers started by this run, passed 326, skipped 49, failed 0 (3.6 min).
A focused UI re-review is pending. The ticket
stays in `review`.

## Integration (2026-11-03)

- Merged main (RYT-040) into the branch; independent UI review integration PASS for the combined
  snapshot `02f8ca80…` (see ui-review.md, "Integration").
- Fixed a race in `tests/e2e/combat.spec.ts` (axe ran while "Siguiente turno" was still saving).
  `CI=1 npx playwright test combat glossary`: 94 passed, 1 flaky on first run; combat 3×35 and
  glossary 3×60 passed afterwards with `--retries=0`.
- Production: applied `combat_roster` to the hosted project via Supabase MCP. Verified `public` and
  `pre` `add_combatants`/`remove_combatant` and `private`/`pre_private.combat_start_turn` carry the
  new bodies and `anon` cannot execute them.
