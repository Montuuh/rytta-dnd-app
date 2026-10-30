# RYT-024 Validation Evidence

## Summary

Character creation wizard and 5.5e + homebrew character sheet (ADR 013):

- `public.character_sheets` (build) and `public.character_vitals` (play state) with
  independent revisions, a creation trigger and a backfill for existing characters.
- `save_character_sheet` and `set_character_vitals` RPCs: campaign lock, revision check,
  request-id idempotency (`private.sheet_requests`), bounded values and audit events.
  Authorization through `private.can_play_character` (active campaign DM or the assigned
  active Player). Direct table writes revoked; RLS reads mirror `characters_read`.
- Pure 5.5e domain (`src/features/characters/domain/{srd,rules,sheet,creation}.ts`) with
  SRD 5.2 (CC-BY-4.0) classes, species, backgrounds, skills, conditions and slot tables.
- Seven-step wizard (`/campaign/:id/party/:characterId/create`) with draft saves, and the
  character sheet (`/campaign/:id/party/:characterId`) with HP panel, stats, abilities,
  skills, hit dice, death saves, inspiration, conditions, use counters, rests, spell slots,
  spells and notes. Party cards show class, level, HP and AC.

## Local verification

- `npm run test:db`: 6 files, 40 tests pass. New `tests/database/character-sheets.test.ts`
  covers draft rows for every character, Player completion with full HP, DM edits that
  clamp HP and hit dice, audit kinds, denial for anon, outsider, peer Player, cross-campaign
  DM, inactive Player and direct insert/update/delete, Player denial on
  `set_character_resources`, stale revisions, idempotent replays, `Request mismatch`, level,
  JSON type/size, HP, condition and slot limits. `pre.test.ts` now expects 11 cloned tables
  and passes the full ETL suite with the new trigger and helper.
- `npm run check`: typecheck, lint, architecture, docs, AI contracts, 12 unit/SQL files
  (71 tests) and the production build pass. `npm run format:check` passes.
- `npm run test:e2e` (run with the preinstalled Chromium through a local config shim, since
  the pinned Playwright browser build is not installed in this container): see results below.
  New `tests/e2e/character-sheet.spec.ts` covers the Player wizard end to end (validation
  errors, draft save, SRD background seeds, skill limits and expertise, suggested HP, spell
  naming, completion at full HP), the complete sheet in es/en × dark/light at 150% text with
  axe, 44px targets and overflow checks, damage dialog and focus return, slot pips, stale
  play-state recovery, rest dialog Escape, DM Party summaries, edit-mode step navigation and
  not-found characters, on 1440px, 820px and 390px.

E2E result: _pending final run_.

## Hosted Supabase (`ekscdsmniukuxqjixapu`)

- Migration history before the change ended at `dm_command_center`; production had two
  characters and no sheet tables.
- PRE first: the migration was applied to `pre`/`pre_private` through `pre_admin.remap`, then
  a rolled-back actor probe returned: `pre_sheets=2 pre_vitals=2 outsider=Forbidden
  outsider_reads=0 dm_save=ok stale=Stale revision hp_after_complete=12 direct_update=permission
  denied audit_rows=1`.
- PROD: applied migration `character_sheets` (non-destructive: new tables, trigger, backfill,
  RPCs). Rolled-back probe: `sheets=2 vitals=2 anon_read=permission denied
  outsider=Forbidden outsider_reads=0 dm_save=ok direct_update=permission denied`.
- Security advisors: only the existing accepted patterns (intentional `security definer`
  RPCs executable by `authenticated`, private idempotency tables with RLS and no policies,
  leaked-password protection disabled for Auth). No new RLS gaps.

## Not verified

- Two real Google accounts creating and playing a sheet on hosted Supabase; the browser
  suite uses the HTTP fixture and SQL authorization runs in PGlite plus hosted probes.
- Realtime propagation (RYT-013); the sheet polls every 20 seconds.
- iOS Safari; mobile coverage is Chromium emulation.

## UI review

Pending the independent `ui-ux` verdict.
