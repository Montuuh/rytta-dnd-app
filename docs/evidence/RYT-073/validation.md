# RYT-070–074 verification: sheet redesign, three ways to create, play lock, history, portraits

Delivery of 2026-11-09 on `main` (base 8455b3b, equal to `origin/main` after `git fetch`).
Decision: [ADR 035](../../decisions/035-character-sheet-redesign.md). Design flow:
design flow. Tickets RYT-070, RYT-071, RYT-072, RYT-073 and RYT-074.

## What changed

- **Database** (`supabase/migrations/20261112120000_sheet_play_lock_history.sql`): encounter play
  lock in `set_character_vitals`; `get_character_play_lock`, `get_character_history`,
  `rename_character`, `list_character_portraits`; `private.can_view_portrait` widened to assigned,
  non-archived characters for every member; PRE mirror through `pre_admin.remap`.
- **Glossary** (`scripts/glossary/class_features.py`, `src/features/glossary/content/*`,
  `domain/types.ts`, `catalog.ts`, `ui/*`): 232 class and subclass features (EN and official ES,
  782 entries), a "Class features" tab with a class filter, feature lines in entries, and
  `useSrdLibrary` for the sheet.
- **Characters domain** (`domain/resources.ts`, `progression.ts`, `quick.ts`, `history.ts`,
  `sheet.ts`): 19 class resources by level, progression sync with removals and adoption of
  hand-typed entries, quick and blank drafts, history lines; build schema gains feature/spell
  refs, tracker keys and displays (max 999), `removed`, `layout`, `origin`, `subclassKey`.
- **Creation** (`ui/creation/chooser.tsx`, `quick-build.tsx`, `blank-sheet.tsx`,
  `use-create-sheet.ts`, `character-creation.tsx`, `steps.tsx`, `ui/party.tsx`): three doors,
  3-step quick build with a summary, blank sheet, `?mode=` routing; the full wizard drops
  alignment, languages and appearance and adds the portrait in its header.
- **Sheet** (`ui/sheet/*`): the table panel (hero, abilities, tiles, block sheets, edit mode,
  Personalise, library, history, dock); `sections.tsx` and the DM-only `sheet-history.tsx` are
  gone.
- **Portraits** (`inventory/ui/portrait-editor.tsx`, `portrait.tsx`, `api.ts`, party, trades,
  tabletop board, shop orders): the crop/letterbox editor and campaign portraits everywhere.
- **Copy**: `src/shared/i18n/panel-{es,en}.ts`, glossary catalog keys.

## Checks

- `npm run check`: typecheck, lint, architecture, docs (75 tickets), 46 test files /
  330 tests and the build pass.
- Database (PGlite, `tests/database/sheet-play-lock.test.ts`, 8 tests): lock in initiative and
  active, DM bypass, unlocked teammate outside the encounter, unlocked after `ended`; history
  field changes, actors, DM-only names, paging; rename with validation; portraits for members,
  never old objects; PRE mirror with no `public.`/`private.` references. Denials for anon,
  outsider, another Player and a cross-campaign DM on every new RPC. `combat-media.test.ts`
  updated for the widened portrait rule.
- Unit (`progression.test.ts`, 11 tests): every resource links to a glossary feature of its
  class; features and resources by level; removals stick; subclass gating; pools by level and
  modifiers; quick build valid for all 12 classes; blank sheets; history lines.
- Glossary content contract: 782 entries, 232 features, 12 classes and 12 subclasses, features
  never auto-linked.
- E2E: full `npm run test:e2e` first run 493 passed, 22 failed, 55 skipped. Reproduced on rerun:
  the glossary count (550 → 782), the sheet term test (skills moved into their block) and one
  glossary term hit area on the smaller stat labels (fixed: 44 px hit area); the rest
  (combat, trades, campaign items, bestiary, two sheet tests at 390 px) passed when rerun alone,
  so they were load timeouts. Affected specs after the fixes: `character-sheet`, `characters`,
  `inventory`, `glossary` all pass at 1440, 820 and 390 px.
- Final full `npm run test:e2e` after the review fixes: 515 passed, 0 failed, 55 skipped (4.6 min).
- Independent UI review: CHANGES_REQUIRED (round 1, 15 findings), CHANGES_REQUIRED (round
  2, 8 findings), PASS (round 3), PASS (round 4) on fingerprint
  `7b3569be511985335a6c09416573bfed5ced8dcbe3b499a95700c653cc06682d`; see
  design flow and the review report.
- New e2e scenarios: three doors with Escape and focus return; full wizard through the doors;
  quick build (Monk, Human, rename, summary, sheet at HP 10); blank sheet (Paladin 5 with Lay on
  Hands 25/25); every tile at 150 % text in ES/EN dark/light; spend a slot, stale revision,
  long rest with focus return; DM edit in place (level 6, WIS +1); encounter lock (no HP actions,
  rests disabled, hit dice disabled, slots still spendable); Personalise (hide Notes, custom
  counter); library add with the "already added" state; history read by the Player; portrait
  editor (crop default, keyboard pan and zoom, fit, save).
- PRE: the remapped DDL was executed into `pre`/`pre_private` first; eight functions present, no
  production references, anon cannot execute any of them.
- Production: applied as hosted migration `20261109171836 sheet_play_lock_history` (same DDL as
  the PRE run, which it re-mirrors idempotently). Checked afterwards: the eight functions exist,
  anon cannot execute any, `authenticated` executes only the five public RPCs, and
  `history_changes` returns the expected field diff. Security advisors list the new RPCs only
  under the generic "security definer executable by authenticated" notice that every Rytta RPC
  carries by design.

## Not covered

- Known minor follow-ups from the review: build saves tapped during another write are ignored
  (R3-2); "Conditions" at 390 px and 150 % in English is not hyphenated (R4-1); stacked sheets show
  the save error twice (R4-2); a scrolled sheet can hide the error alert (R4-3).
- Browser Back does not ask before discarding unsaved edits (the HashRouter has no route blocker);
  in-app links and page unload do.

- Hosted Supabase Auth/PostgREST/Storage were exercised through PGlite and the e2e fixture, not a
  two-account browser session.
- Pinch zoom in the portrait editor was not exercised by an automated multi-touch test.
- iOS Safari is not covered by Chromium emulation.
