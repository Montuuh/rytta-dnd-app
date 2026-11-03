# Delivery RYT-042: single Player combat view

Date: 2026-11-03. Branch `worktree-agent-ab70fd5aa90f9a870`, cut from `main` at `38b3b14`
(RYT-040 and RYT-041 merged; the hosted migration history then ended at `combat_roster`, matching
the repository). `main` was merged in afterwards at `75652dc` (RYT-044 active characters and the
glossary e2e stabilization) with no conflicts; every check below after "merge" ran on the merged
tree.

## Outcome

- **Players have one combat screen: the table view.** `/combat` shows the table view of the live
  encounter; `/combat/:id` shows the table view of that encounter; `/combat/:id/table` (old
  RYT-038 links) redirects to `/combat/:id`. The former Player screen (`player-view.tsx`, with
  HP, conditions, death saves, end-turn and undo) is removed; those stay on the character sheet
  (same `character_vitals`) or with the DM.
- **Own initiative from the table view.** While the DM collects initiative, the Player's own row
  opens in place into an entry: a d20 face holding the total (a numeric field that also takes
  typing), "Tira d20 + 2" from the sheet bonus, a 3×4 keypad and "Guardar iniciativa". It
  scrolls into view once without taking focus (no phone keyboard over the keypad); Escape clears
  an unsaved total. After saving, the row shows the total plus a 44px pencil ("Editar la
  iniciativa de Arin") that reopens it; Escape or Cancelar keeps the saved total and returns
  focus to the pencil. The save is announced ("Arin: iniciativa 17 guardada."). Once the fight
  runs, only a missing total (a late joiner) opens the entry. Other rows never have controls.
- **Table banners.** Initiative: "Tirad iniciativa · N de M listos" with one pip per combatant.
  Active: Ahora / Después; on the Player's own turn the label reads "¡Te toca!" (two pulses
  without reduced motion, vibration where supported) and otherwise "Te toca dentro de N turnos".
- **Summary in the table view.** When the encounter the Player was watching ends, the same
  screen becomes the recap (until a new fight starts); past fights open their recap from the
  history list. The recap: rounds as one large figure, the party's hardest hitter, then
  Grupo / Aliados / Enemigos ledgers with fate (icon + word) and damage dealt, taken and healed.
  The DM console shows the same recap.
- **DM view switch.** The DM opens an encounter on the table view (table projection, `as_table`)
  and switches to "Consola del DM" with a two-segment radio group (tap, arrows, Tab; 44px; the
  current view is the filled accent segment; 3px focus ring). Both views stay mounted once
  opened, so the console keeps its selection, open tab and chosen targets; the choice is kept in
  `?view=` across reloads. Drafts have no table view: a draft opens on the console without the
  switch. The console's old "Vista de mesa" button and menu item and its own back link are gone
  ("Todos los encuentros" sits beside the switch).

## Scope and ownership

Owned paths:

- `supabase/migrations/20261106120000_combat_player_initiative.sql` (new; sorts after RYT-044's
  `20261105130000`; no earlier migration edited)
- `src/features/combat/` (domain `canEnterInitiative`, `initiativeProgress`,
  `isInitiativeTotal`, error code `initiativeClosed`; `combat-page.tsx`, `table-display.tsx`,
  new `initiative-entry.tsx` and `combat-summary.tsx`, `initiative-rail.tsx` row slots,
  `amount-dialog.tsx` shared `InitiativeKeypad`, `dm-console.tsx`, `combat-log.tsx`,
  `combat.css`; `player-view.tsx` deleted)
- `src/shared/i18n/combat-{es,en}.ts`
- `tests/database/combat.test.ts`, `tests/e2e/combat.spec.ts`, `tests/e2e/fixtures/combat.ts`
- `docs/combat-design.md`, `docs/decisions/024-combat.md`, `docs/security.md`, this folder

"Own character" is the combatant whose character has `user_id = auth.uid()` (projection
`is_own`, RPC `combat_require_act`). This stays correct with RYT-044: a Player's active
character is still theirs, and RYT-044 already refuses switching the active character while it
fights. Non-goals: RYT-043 (portraits, creature images, banded enemy health); the table rows and
the recap rows are the components that redesign will restyle.

## Database change

`20261106120000_combat_player_initiative.sql` replaces `public.set_initiative` with the same
signature, grants (`authenticated` only), campaign lock and request-id replay. One rule is added
for callers that are not an active DM of the campaign: they set the total of their own
character while the encounter collects initiative, and during the fight only while that
character has no total yet; otherwise `Initiative closed` (P0001). Drafts and ended fights stay
closed to Players (`Encounter closed`). The DM is unchanged. The same DDL runs again through
`pre_admin.remap` when a PRE with the combat RPCs exists. No Player-scoped RPC was added: the
existing `set_initiative` was already limited to the own character.

Private DM data: Players read only `get_combat_state` (their projection, unchanged), the DM's
table view uses `as_table`; neither carries hidden combatants, exact NPC HP, NPC AC, DM notes,
secret effects or private log entries (SQL projection tests plus the PRE check below).

## Verification

| Check | Result |
| --- | --- |
| `npx vitest run tests/database/combat.test.ts` | 13 passed on the first run (12 existing + the new RYT-042 test, which runs in `public` and in the PRE mirror) |
| `npm run check:fast` (first run) | passed |
| `npx prettier --check` on touched files | first run flagged 6 files (formatting of new code; the other warnings were CRLF working-copy line endings, rechecked with `--end-of-line auto`); fixed with `--write` |
| `npm run check` before the merge | passed: 29 files / 211 tests, build OK |
| `npm run check` after merging main | passed: 31 files / 229 tests, build OK |
| Combat spec on spare ports (local uncommitted config, port 4574; fixed ports were busy at first) | RYT-042 tests 9/9 passed on the first run; whole combat spec 44 passed, 1 skipped (the touch test skips laptops) |
| `CI=1 npm run test:e2e` (fixed ports 4173/4174, servers started by the run), before the merge | run 1: 369 passed, 49 skipped, 2 flaky. Run 2: 368 passed, 2 flaky, 1 failed: `glossary.spec.ts:342` on the phone (glossary editor footer; not touched here; `main` then stabilized that spec in `960dab5`) |
| `CI=1 npm run test:e2e` after merging main | 403 passed, 49 skipped, 1 flaky (`scaffold.spec.ts:64` tablet, not combat), 0 failed (3.0 min) |

SQL role matrix (PGlite, real migrations, `public` and PRE mirror): the Player sets and corrects
the own total during initiative and a retried request replays; a teammate's and a creature's
totals raise Forbidden, a hidden creature raises Combatant unavailable; an outsider raises
Forbidden; a DM of another campaign raises Combatant unavailable through its own campaign id;
anon gets permission denied. After the fight starts the Player's set total raises
`Initiative closed`, a teammate with a missing total sets it once and then gets
`Initiative closed`, the DM still changes any total; after the end a Player gets
`Encounter closed`. The PRE function has the rule and no `public.`/`private.` references.

E2E (identity desktop 1440, tablet 820, phone 390, fixture mirrors the new rule):

- Player: only the table view (no console radio, no turn, damage or heal controls); only the
  own row has an entry, other rows have no button or field; keypad digits, backspace, Escape
  clears, typing, Enter saves; focus lands on the pencil; the save is announced; the ready count
  moves; reopen + Escape keeps the total; 150% text without horizontal scroll; the fixture
  refuses another character's or a creature's total and, once active, the own set total; the
  own-turn banner; the recap after the end; `/combat/:id/table` lands on `/combat/:id`.
- DM: table view by default (descriptive enemy status, no numbers, no turn buttons); arrows on
  the switch move to the console with focus kept on the switch and `?view=console`; a turn moved
  and targets chosen in the console survive a tap to the table view and back; a reload keeps
  the console.
- The two-context RYT-007 flow now runs Player initiative from the table view, switches views in
  the middle of target selection, and ends with the recap for both sides.
- axe (WCAG 2.1 AA tags) on every step above, also in English + light theme; touch targets on
  the entry keypad and the switch.

## PRE rehearsal (hosted project `ekscdsmniukuxqjixapu`, PRE only)

1. `npm run pre:plan -- --print-sql` executed through the MCP connection: read-only plan,
   `dryRun: true`, `targetExists: true` (no refresh needed or done).
2. Applied only the migration's PRE branch (`execute pre_admin.remap(ddl)`) to `pre`. Verified:
   `pre.set_initiative` contains the rule, has no `public.`/`private.` references, `anon` cannot
   execute it and `authenticated` can; `public.set_initiative` kept its previous body (same md5
   before and after). Production `public` was not touched.
3. Behaviour in one transaction rolled back by a final exception (real PRE DM, Player and a
   non-member auth user): Player own total during initiative ok, retry replayed, correction ok;
   unassigned character and creature: Forbidden; outsider: Forbidden; outsider as DM of a new
   campaign: Combatant unavailable; after start the own total: Initiative closed; DM change
   mid-fight ok; Player character removed and re-added without a total (late joiner): set once
   ok, then Initiative closed; Player projection: role player, own 1, no `dm_notes`/`hidden`
   keys, no NPC `hp`; after the end: Encounter closed, summary visible with 3 rows; anon:
   permission denied. Afterwards PRE had 0 encounters and 1 campaign, `public` had no rehearsal
   rows.
4. After `main` brought RYT-044 (already applied to PRE), the rule was still in `pre` and a
   second rolled-back rehearsal with the Player's active character gave the same results
   (own ok; other character and creature Forbidden; outsider Forbidden; Initiative closed once
   active; projection own 1, secrets 0).

Production migration: not applied (the integrator applies it after merge). Recovery for PRE:
re-run `pre_admin.remap(pg_get_functiondef('public.set_initiative(uuid,uuid,integer,integer,uuid)'::regprocedure))`
or a PRE refresh.

## Screenshots (inspected)

Captured with `RYT_EVIDENCE=1` at 390 px (`-mobile`) and 820 px (`-tablet`), after the merge:
`player-initiative`, `player-initiative-150`, `player-saved`, `player-turn`, `player-summary`,
`player-initiative-en-light`, `summary-en-light`, `table-turn-en-light`, `dm-table`,
`dm-switch-keyboard`, `dm-console`. Only RYT-042 tests ran with evidence on; no other ticket's
screenshots changed. Adjustments made after inspecting the first captures: the selected view
segment is now a filled accent segment (it was a faint raised fill), the switch has an explicit
focus ring, and a reopened entry scrolls fully into view above the phone's bottom bar.

## Untested layers

- Real Supabase Auth/PostgREST/Realtime with two signed-in accounts (PGlite + SDK fixture + PRE
  SQL with role and JWT claims set, not through PostgREST).
- Production schema (`public`) on the hosted project: intentionally not applied.
- Real devices: iOS Safari / Android Chrome numeric keyboards and vibration; screen reader
  output was checked through accessible names and live-region text, not with a real reader.
- DM "Vista jugador" preview of the table view entry (presentation-only transform, authorized as
  the DM) was not exercised by e2e.

## Handoff and review

- Behaviour change to note: Players can no longer end their own turn, change HP/conditions,
  record death saves or undo from the combat screen (the scope makes the table view their only
  panel). HP and conditions remain editable on the character sheet; the DM runs turns.
- The independent `ui-ux` review is pending (not self-approved); the ticket is in `review`.

## Review round 1 fixes

The first independent `ui-ux` review of `bda9674` returned CHANGES_REQUIRED
([ui-review.md](ui-review.md), committed as delivered). Every finding is addressed:

| Finding | Change | Test |
| --- | --- | --- |
| F1 major: target selection survived the end of the fight (bar, checkboxes, a damage dialog on a closed encounter) | `dm-console.tsx`: when the status leaves `initiative`/`active`, the selection and any open damage/heal dialog are cleared (render-phase, so it also happens while the console is hidden behind the table view) | e2e: targets chosen, then ended from the console (two-context test) and ended behind the table view (DM test): no checkbox, no `.combat-multi-bar`, no Daño/Curar |
| F2 major: grey "Derrotado" pill at 1.27:1 inside a 0.72-opacity row, duplicating "Caído" | The pill is gone; the hit point status word says "Derrotado"/"Muerto" with a skull icon (replacing "Caído"). Defeated rows drop the opacity: dashed transparent card, name struck through in the muted token, dashed empty initiative well | axe with a defeated goblin: Player table view dark/ES (phone, tablet, laptop), Player table view light/EN, DM table view and console; the row contains "Derrotado" once and no "Caído" |
| F3 major: the Player's own status was the smallest text in the banner | Own turn: "¡Te toca!" is the display line (the own name is dropped; only it is in accent). Waiting: "Te toca dentro de N turnos" has its own full-width band across the banner at heading size with an hourglass, separated by a dashed rule, no longer under "Después" | e2e: `.combat-table-active` is "¡Te toca!" / "Your turn!"; `.combat-table-countdown` reads "Te toca dentro de 2 turnos" after the turn moves; screenshots `player-turn`, `player-waiting` |
| F4 minor: old-style "7" crossing the die's edge | The total uses the body face with lining tabular figures; the die is larger (10.5rem) with a larger face (apex 16, base 76); three characters use a smaller size | screenshots `player-initiative`, `player-initiative-range` (150 fits inside the face) |
| F5 minor: 150 silently clamped to 99 | `clampBehavior="none"`; an out-of-range total marks the field invalid and the hint under the die becomes "Escribe un total entre −20 y 99." (polite live region, `aria-describedby`); Save stays disabled | e2e: typing 150 keeps 150 after blur, `aria-invalid="true"`, hint shown, axe passes |
| F6 minor: repeated column labels, Segoe UI Black names, misaligned fate | From 40em one aligned header per side ("Hecho / Recibido / Curado") over a fixed 21rem number column; row labels stay for assistive tech (visually hidden there) and stay visible on phones; names at weight 700 like the order; fate centred on the name; ledger capped at 52rem | screenshots `player-summary`, `summary-en-light`, `dm-ended-console` |
| F7 minor: Mantine grey disabled Save in light theme | The entry scopes Mantine's disabled tokens to the palette (accent tint on the surface, muted text, accent border) | screenshots `player-initiative-range`, `player-initiative-en-light` |
| F8 minor: "0 de 4 / listos" wrapping beside the pips at 390 | Below 40em the count uses the h1 size and the pips sit under it | screenshot `player-saved-mobile` |
| N1 note: fixture recap leaked hidden combatants | The fixture filters hidden combatants out of the summary for Player and table projections, like `get_combat_state` | e2e: a hidden "Ogro secreto" is absent from the Player recap and its `get_combat_state` response and from the DM table view recap, and present in the DM console recap |

The pending product decision on which combat actions Players keep (death saves, end turn) is
not changed here.

Verification of the fixes:

| Check | Result |
| --- | --- |
| Combat spec on a spare port (local uncommitted config) | first run: 6 failed (the RYT-041 Player test still expected the own name on the own turn, an intended F3 change; `aria-invalid` was overridden by Mantine, so the field now uses a boolean `error`); then 44 passed, 1 skipped |
| `npm run check` | passed: 31 files / 229 tests, build OK |
| `CI=1 npm run test:e2e` (fixed ports, servers started by the run) | 403 passed, 49 skipped, 1 flaky (`roster.spec.ts:266` phone, RYT-044, not touched), 0 failed |

Screenshots refreshed (390/820) and inspected: all of the earlier ones plus `player-waiting`,
`player-initiative-range`, `defeated-en-light`, `dm-ended-console`. Only RYT-042 tests ran with
evidence on; no other ticket's screenshots changed. A focused re-review is pending.

## Integration (2026-11-03)

- Independent ui-ux round 2 PASS at fingerprint `6a616378…` (head `1cc23a3`); the branch already
  contains main `75652dc`. Minor follow-ups R2-1..R2-3 from the review are carried into RYT-043.
- Production: applied `combat_player_initiative` via Supabase MCP. Verified `public` and `pre`
  `set_initiative` carry the new rule ("Initiative closed"), `anon` cannot execute and
  `authenticated` can. No hosted denial tests were run.
