# ADR 013: Character creation wizard and 5.5e + homebrew character sheet

## Status

Accepted for `RYT-024`.

## Context

Until RYT-024 a character was only a name, an assignment and DM-controlled homebrew
resources. The user asked for character creation and a full character sheet, using the
public D&D Sync sheet screenshots as an interaction reference (hit points, abilities,
skills, features, spells). Decisions recorded with the user on 2026-10-30:

- Rules: D&D 5.5e (2024) plus homebrew. Mechanics come from the System Reference
  Document 5.2 (CC-BY-4.0) with attribution; every catalog offers a homebrew option.
- Scope: core sheet, limited-use features and rests, spells, conditions, heroic
  inspiration and death saves. Inventory and equipment remain in RYT-004.
- Ownership: the DM still creates the character slot and invites its Player (ADR 004).
  The assigned Player completes the creation wizard. The DM can view and edit every sheet
  and can also complete an unassigned character.
- The D&D Sync sheet itself requires sign-in; only its public screenshots were reviewed.
  No code, prose or art was copied.

## Decision

1. **Two records per character.** `character_sheets` holds the build (level, max HP,
   armor class, status and a validated `build` JSON document with identity, abilities,
   proficiencies, features, use counters and spells). `character_vitals` holds play
   state (current/temporary HP, hit dice spent, death saves, heroic inspiration,
   conditions, spent slots and tracker uses). Each has its own compare-and-swap
   revision so table-side taps never go stale against a long build edit.
2. **Rows exist for every character.** An `after insert` trigger on `characters` creates
   a `draft` sheet and default play state; the migration backfills existing characters.
3. **RPC writes only.** `save_character_sheet` and `set_character_vitals` are
   `security definer` functions with fixed `search_path`, a campaign row lock, revision
   checks and request-id idempotency (`private.sheet_requests`). Authorization is
   `private.can_play_character`: an active campaign DM, or the active member assigned to
   the character. Direct table writes are revoked; RLS reads mirror `characters_read`.
   Player resources (gold, water, rations, exhaustion) stay DM-only.
4. **Server invariants.** Database checks bound level, HP, AC, slot counts, condition
   keys (the 5.5e conditions without exhaustion) and JSON size (64 KiB build, 8 KiB tracker
   uses). Completing a draft starts at full HP; later build edits clamp current HP and
   spent hit dice. Updates are audited to `character_events` as `character_sheets:UPDATE`
   and `character_vitals:UPDATE`; default row inserts are not audited.
5. **Derived values stay in the domain.** Modifiers, proficiency, saves, skills, passive
   Perception, spell DC/attack, full/half/pact slot progressions, suggested HP, point buy,
   background increases and rest effects are pure functions in
   `src/features/characters/domain/rules.ts`, unit-tested and shared by wizard and sheet.
   AC is unarmored `10 + DEX` or a manual value until RYT-004 equipment exists.
6. **Wizard.** Seven steps (class and level, origin, abilities, skills, combat, spells for
   casters, details and review). Each "Next" saves a draft, so a Player can resume. SRD
   species traits and background feats are seeded as named features in the current
   interface language; descriptions are the player's own words. Completed sheets reopen
   the same wizard with direct step navigation.
7. **Sheet.** Party cards show class, level, HP and AC with a link to the sheet route
   `/campaign/:id/party/:characterId`; the wizard lives at `.../create`. The sheet shows
   a glanceable HP panel, AC/initiative/speed/proficiency/passive Perception, and tabs for
   summary, features, spells and notes. Player POV preview is read-only.
8. **Licensing.** Only SRD names, numbers and choices are encoded, with the CC-BY
   attribution in code and on screen. No spell descriptions or rules prose are bundled;
   a licensed spell/rules catalog belongs to RYT-008.

## Consequences

- Players can create and play their own characters at the table, with the DM retaining
  full control and resource economy unchanged.
- Polling (20 s) remains the freshness mechanism; realtime belongs to RYT-013.
- Deferred: SRD spell catalog, class feature progressions per level, multiclassing,
  equipment-derived AC/attacks (RYT-004) and exhaustion effects.
