# RYT-055–062 verification: tabletop

Date: 2026-11-05. Decision: [ADR 032](../../decisions/032-tabletop.md). Analysis:
[tabletop design](../../tabletop-design.md). Design flow: [design-flow.md](design-flow.md). Sources: the
D&D Sync Tabletop reviewed panel by panel in the browser with the user's account (see
[research](../../research.md)); SRD 5.2.1 "Playing on a Grid" and "Creature Size and Space" (pages
13–14) and the Rules Glossary area entries (CC-BY-4.0). No code, text, art or sound was copied.

## Scope delivered

- Migration `20261111120000_tabletop.sql`: `tabletop_scenes`, `tabletop_items`, `tabletop_cards`,
  `tabletop_tracks`, `tabletop_live`, `private.tabletop_requests`; 14 RPCs (`get_tabletop`,
  `list_tabletop_scenes`, `get_tabletop_library`, `save_tabletop_scene`, `delete_tabletop_scene`,
  `put_tabletop_items`, `delete_tabletop_items`, `change_tabletop_fog`, `set_tabletop_live`,
  `save_tabletop_card`, `delete_tabletop_card`, `add_tabletop_track`, `delete_tabletop_track`,
  `fire_tabletop_event`); the `tabletop` player module; the `tabletop-media` bucket with its router;
  realtime on `tabletop_live`; the PRE mirror. Follow-up `20261111130000_tabletop_alias.sql`: the table
  projection names every non-character combatant by its public name (a lair alias leaked before).
- `src/features/tabletop`: domain (contract, calibration, SRD grid measuring, areas, generators for dungeon,
  crypt, cave, forest and tavern, prop catalogue), data adapter, queries and realtime, Web Audio engine
  (eight ambiences, five effects, uploaded tracks), and the UI: library, calibration, generator with live
  preview, blank and uploaded scenes with grid alignment, editor (nine tools, five panels, inspector), table
  screen and Player view. Catalogs `src/shared/i18n/tabletop-{en,es}.ts`; route and module entries.

## Acceptance

| Ticket | Criterion | Evidence |
| --- | --- | --- |
| RYT-055 | Scenes, one on the table, prepared scenes never reach Players | `tests/database/tabletop.test.ts` (projection, module switch, deletion clears the table); e2e "table screen shows only what the table may see" |
| RYT-055 | Calibration from diagonal, resolution, base and fine adjustment; ruler; whole squares | `geometry.test.ts` (55″ 4K and 1″ bases → 47 × 26; 32″ 1080p → 27 × 15; round trip); e2e calibration dialog → "47 × 26 casillas"; table token ≈ 68.8 CSS px at 32″ 1080p |
| RYT-055 | Uploads downscaled to 4096 px and aligned; five grounds | `ui/media.ts`, upload dialog with grid overlay, squares across and offsets; Scene panel nudges |
| RYT-055 | Table projection and Player module rule | database test (Players Forbidden while off; no notes, events, hidden items, secret doors, rooms, recipe, draft or hidden combatants; NPC and lair aliases without SRD art); e2e Player and closed-module tests; the Player view (also the DM's Player preview) always asks for the table projection and the board drops secrets outside DM mode |
| RYT-055 | Editor states and recovery | e2e: a failed write shows over the board with Try again and succeeds on retry; a generated door whose write fails reveals no room, and Try again opens it, reveals its rooms and announces it; Delete offers Undo and returns focus to the board; optimistic moves roll back on failure (`api.ts`); the generator preview is painted on open; backing out of a creation dialog returns focus to "Nueva escena" |
| RYT-055 | Keyboard and single-pointer operation | e2e: the board is one Tab stop; its cursor moves with arrows and is announced, Enter moves a waiting token ("Move to a square"), phones tap the square; area seals open the inspector and delete with Undo; Area options never widen the page |
| RYT-055 | RLS, read-only tables, idempotent campaign-locked RPCs, denials | database tests for anon, outsider, Player, a DM of another campaign, direct writes, replay and mismatch, stale revision |
| RYT-056 | Deterministic, connected, bounded maps; doors and props as items; preview | `generator.test.ts` (four seeds per kind, determinism, reachability of every room, doors between standable squares, contract of items, size clamps); e2e generates a 47 × 26 dungeon and opens it |
| RYT-057 | Token sizes, hidden, combat link, keyboard moves | `geometry.test.ts` (SRD sizes); database test (draft and hidden combatants off the table, alias); e2e free token placed, moved with arrows and hidden with H |
| RYT-058 | SRD counting, waypoints, shared tape; six shapes, caught tokens | `geometry.test.ts` (max(|dx|, |dy|), routes, sphere, cone, line, cube, emanation); e2e drag reads "15 pies · 3 casillas" and announces it; a sphere left on the map lists caught tokens; the table shows the shared tape |
| RYT-059 | Fog DM-translucent and table-opaque; reveal/hide; rooms; secret doors; doors reveal rooms | database fog tests (room resolution, brush, circle, reset, invalid ops); e2e room reveal by tap and a door opened from the keyboard |
| RYT-060 | Notes and events never on the table; events act in one transaction; story cards | database event test (reveal room, unhide nearby, card, ambience, sound, reset); e2e story card shown, event fired by keyboard; table shows the plate |
| RYT-061 | Synthesized ambiences and effects; private tracks; muted table | `audio/engine.test.ts` (plan and fresh cues); database track tests (path, duplicate, readable only while live); e2e ambience and effect reach the live row |
| RYT-062 | Forty-two original props in six categories, searchable in both languages | `domain/props.ts`, `ui/prop-art.tsx`; e2e search "barril" and place |

## Impeccable critique and audit

Findings and fixes are in [design-flow.md](design-flow.md) section 3 (critique 22/40, audit 12/20 on
the first build). Every P1 finding was fixed; the remaining limitations are listed there.

## Checks

- `npm run check`: typecheck, lint, architecture, docs (63 tickets), AI contracts, 291 unit and database
  tests in 41 files, build — passed.
- `tests/database/tabletop.test.ts` (PGlite, full chain with a PRE copied before the migration): 5 tests.
  `tests/database/pre.test.ts` now expects 38 copied tables (five tabletop tables and
  `private.tabletop_requests`). All 127 database tests pass.
- `tests/e2e/tabletop.spec.ts` at 390, 820 and 1440 px: 5 tests, 60/60 with `--repeat-each=4` under
  8 workers. Axe runs on the library, calibration and generator dialogs, editor (board excluded), Player
  view, table screen and the audio panel; 44px checks on dialogs, kit, tabs, zoom keys and panels.
- Full e2e suite: 496 passed, 55 skipped by design, 1 failed (this spec on a phone under full load: the
  area options strip was so tall that the board slid under the tool tray). Fixed by making the phone strip
  one scrolling row; the spec then passed 60/60 under load.
- Initial failures recorded while building: the Mantine dialog close button had no name, slider thumbs had
  no name, number steppers were under 44px, zoom keys nested inside the board image, a phone keyboard move
  opened the inspector sheet and stole focus, and the fixture double-encoded signed URLs. All fixed.

- After the Impeccable fixes: `npm run check` passed again (291 unit and database tests, build);
  `tests/e2e/tabletop.spec.ts` 30/30 with `--repeat-each=2` under 6 workers (now also failure and
  retry, undo, the board cursor, move without drag and the area seal). Initial failures while fixing:
  the shortcut scope blocked letters right after the generator closed (fixed by focusing the editor
  title on entry), and a moving-token focus raced the cursor initialisation (fixed with a functional
  update); a broken patch script mangled `calibration.tsx` once and it was restored byte for byte.

- Independent `ui-ux` review round 1 (fingerprint `6090be7e…`): CHANGES_REQUIRED, one P1 (compound
  door writes dropped the first write's result) and seven P2 (every map item a Tab stop, the Area strip
  on phones, compact tablet at 150 % text, blank generator preview on open, focus lost after creation
  dialogs, SVG focus contrast on parchment, long story cards clipped on the table) plus P3 items. All
  fixed; see [the review](../ui-review/ryt-055/review.md). After the fixes: `npm run check` passed
  (291 tests, build), the full e2e suite 497 passed, 55 skipped by design, 0 failed; the tabletop spec
  15/15.
- Round 2 (fingerprint `d4653703…`): CHANGES_REQUIRED with every round-1 finding fixed and two new P2
  (focus fell to the page after Undo or Try again; the board help still described Tab through items).
  Fixed, with e2e checks for the focus return; Delete and H now act on the cursor's item first; a write's
  success clears only its own failure.
- Round 3 (fingerprint `c36ff3f5…`): **PASS**, recorded in `docs/evidence/ui-review-current.json`;
  `npm run check:ui-review` passes. Before it: `npm run check` passed (291 tests, build) and the
  tabletop spec 45/45 with `--repeat-each=3` (one mobile run had failed first because the test pressed a
  tool letter while the drawer was still closing; the test now waits for the drawer to go).
- Open P3 suggestions from the review, not blocking: phone tray words at 11px (the system's label floor
  is 12px); the bottom fade of a story card shows even when the card fits; "Hidden from the table"
  does not name the item; on a portrait tablet with a panel open the board is about 192px tall.

## Hosted Supabase

- History before the change ended at `bestiary_images` (20261104234516), matching the repository.
  PostgreSQL 17.11.
- PRE first: the remapped DDL was applied to `pre` alone, then a real PRE DM and Player were exercised in a
  rolled-back transaction: the DM created a scene with five items and put it on the table; the table
  projection showed one item and no secret; firing the event revealed the room and unhid one token; the
  Player was Forbidden while the module was off and on every write, read no item rows and one live row,
  then saw two items without secrets, one fog operation and no rooms once the module was on; a direct
  insert was denied.
- Production: migration `tabletop` applied. Five public and five PRE tables with RLS; `public` and `pre`
  `tabletop_live` in the realtime publication; private bucket `tabletop-media` with three storage
  policies; `anon` cannot execute `get_tabletop` nor read `tabletop_live`; `authenticated` cannot insert
  into `tabletop_items`; the module constraint includes `tabletop`; two campaigns, no scenes. A rolled-back
  production smoke test with a real DM: the router allows the DM to write a map path, the upload scene saves,
  and the Player can neither read nor write that map while it is not on the table.
- Follow-up `tabletop_alias`: applied to PRE alone first (remapped), then checked in a rolled-back PRE
  transaction with a real PRE Player: a lair with a public name and an aliased NPC read as "Cold
  stones" and "Shadow", the NPC without SRD art, and no real name in the payload. Then applied to
  production: `public.get_tabletop` and `pre.get_tabletop` carry the fix, `anon` cannot execute,
  `authenticated` can, production still has no scenes.
- Security advisors: no new category. The two `tabletop_requests` tables join the intentional
  "RLS enabled, no policy" list (RPC-only, like `combat_requests`), and the 14 RPCs join the intentional
  `authenticated` security definer list, like every other RPC.

## Not covered

- Real devices: a TV lying on the table, Chromecast or a second window, physical miniatures on the ruler,
  iOS Safari, Firefox, screen readers. Calibration maths is unit-tested; its physical accuracy is not.
- Hosted Realtime with two clients and hosted Storage uploads from the browser (the fixtures stand in; the
  router and policies were exercised in SQL).
- Audible output of the Web Audio engine (the plan and cue logic are tested; the sound is not judged).
- Map art quality across every seed and look is reviewed by eye on the captured seeds only.

## Captures

Phone (390px) and tablet (820px), written by the spec with `RYT_EVIDENCE=1`: `generator-*.png`,
`editor-*.png`, `measure-*.png`, `table-*.png`, `audio-*.png` and `event-*.png`.
