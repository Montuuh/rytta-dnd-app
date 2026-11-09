# ADR 035: table panel sheet, three ways to create, class progression, play lock and history

Date: 2026-11-09. Status: accepted for RYT-070, RYT-071, RYT-072, RYT-073 and RYT-074. Amends
ADR 013 (character sheets), ADR 020 (the per-character audit history was DM-only), ADR 025 (the
glossary gains class features) and the RYT-043 portrait rule in
`20261107120000_combat_media.sql`.

## Context

The user asked for a simpler sheet and simpler creation: choose between a blank sheet, the full
wizard and a quick build like D&D Beyond's Quickbuilder; see abilities, saves, level, AC,
initiative, speed, proficiency and passive Perception at once; decide what to track (class
resources, spell slots, custom pools); class features linked to the library; collapsible blocks
and modern widgets; Players must not change their own hit points; a portrait editor that crops or
letterboxes; portraits everywhere. They asked for options first and to be asked every design
question. The options artifact (https://claude.ai/artifact/JDKP2gkPPZfEPNP7wBnPar) and two
follow-up rounds produced these decisions (2026-11-09):

| Question             | Decision                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------- |
| Sheet direction (P1) | B, table panel: HP ring with stats, tiles that open a sheet                                 |
| Creation entry (P2)  | A, three doors in a sheet with what each path asks and how long it takes                    |
| Quick build (P3, P4) | Three steps; class, species and name at level 1                                             |
| Library (P5)         | Spells and every SRD 5.2.1 class feature (all classes and levels)                           |
| Class resources (P6) | Added with the class, grow with the level, removable                                        |
| Hit points (P7)      | Players change HP, temporary HP and rest only outside a live encounter; full change history |
| Blank sheet (P8)     | Name, class and level                                                                       |
| Portrait (P9)        | The editor always opens; letterbox with black bars                                          |
| Skills (P10)         | Proficient ones, with "Show all 18"                                                         |
| Full wizard (P11)    | Alignment, languages and appearance leave the wizard                                        |
| Editing (P12)        | In place with a pencil                                                                      |
| Encounter lock       | Only when the character is a combatant of an encounter in initiative or active              |
| History              | DM and the assigned Player, read only                                                       |
| Class features       | Added automatically by class and level; others from the library                             |
| Portrait visibility  | Every active member sees the current portrait of assigned characters                        |

## Decision

### Database (migration `20261112120000_sheet_play_lock_history.sql`)

- `set_character_vitals` keeps its signature, replay and revision check and raises
  `Encounter locked` when a caller who is not an active DM changes current HP, temporary HP or
  spent hit dice while the character is a combatant of an encounter in `initiative` or `active`.
  Rests restore HP and hit dice, so they are refused by the same rule; resource pips, spell
  slots, conditions, inspiration and death saves stay with the Player. The DM's console and
  combat RPCs are unchanged.
- `get_character_play_lock(campaign, character)` tells the sheet whether the lock applies.
- `get_character_history(campaign, character, before_at, page_size)` reads the existing audit
  rows (`character_events`) and returns field-level changes: identity (name, active, archived,
  live sharing), sheet columns and every changed top-level build key, play state and resources.
  Actor is `self`, `dm`, `player` or `system`; only a DM caller gets display names. At most 50
  items per page, newest first. The DM-only `character_events` table policy is unchanged.
- `rename_character(campaign, character, name)` lets the quick and blank flows set the name.
- `private.can_view_portrait` lets every active member read the current portrait of an assigned,
  non-archived character; unassigned characters keep the combat-only rule; old objects stay
  private. `list_character_portraits(campaign)` returns the paths the caller may show.
- Actor matrix for every new RPC: anon cannot execute; outsiders, another Player and a
  cross-campaign DM raise Forbidden. The migration mirrors itself into an existing PRE with
  `pre_admin.remap`.

### Class features and progression (RYT-071)

- `scripts/glossary/class_features.py` extracts the 232 class and SRD subclass features from the
  official English and Spanish SRD 5.2.1 PDFs into the glossary as category `feature`
  (`fc` class, `sb` subclass, `lv` level), never auto-linked. Features with several entries per
  level are paired with a reviewed name table; level tables and sidebars the two-column reader
  breaks are dropped (the text points to the class table) and the few feature tables are
  reviewed (subclass spell lists are named in Spanish from the glossary's own spell pairs).
- `domain/resources.ts` encodes 19 class resources from the SRD class tables (names and numbers
  only). `syncProgression` keeps trackers and SRD features in line with class, SRD subclass and
  level on every save: maxima and resets follow the level, spent uses stay, removed items stay
  removed (`build.removed`), entries typed by hand with the same name are adopted instead of
  duplicated. Without the glossary index loaded, nothing is added or dropped.

### Creation (RYT-072)

- "Create sheet" opens the three doors (bottom sheet on phones, dialog from 48em); a direct link
  to `/create` shows the same choice as a page. `?mode=quick|full|blank` picks the flow.
- Quick build: class, species, then name and portrait, with a summary of what Rytta prepared
  (standard array by class priority, a fitting SRD background with +2/+1, the class's usual
  skills, Unarmored Defense for barbarians and monks, level 1 HP, resources and features).
- Blank: name, class (SRD or homebrew) and level; scores at 10, resources and features of the
  class.

### Sheet (RYT-073)

- Header with portrait, name and class line; the hero holds the HP ring (the one bold element),
  AC, initiative, speed, proficiency, passive Perception, level, Heroic Inspiration and the HP
  actions; abilities with their saves are always visible. Every other block (resources, skills,
  attacks, features, conditions, spells, notes, history) is a tile with a glance that opens a
  bottom sheet on phones and a side sheet from 48em. Rests and Personalise sit in a dock.
- The pencil edits in place (level, max HP, AC, speed, scores, saves, skills, subclass, features,
  spells, notes) and saves once; the full wizard stays one link away for class, species and
  background.
- Personalise hides blocks (`build.layout.hidden`), removes and restores class resources and adds
  custom resources shown as pips or a counter.

### Portraits (RYT-074)

- Choosing an image always opens the editor: crop (drag, pinch, wheel, slider, arrow keys and
  +/−) or fit with black bars; previews at 72, 48 and 32 px; output stays a 512 px WebP square.
- Portraits now appear in the party (they were never passed), trade windows and the partner
  picker, character tokens outside combat, shop orders and the full wizard.

## Consequences

- Players see what the DM sees about their own sheet, including who changed it.
- The glossary body chunks grow by about 150 kB per language (lazy); the index by about 32 kB.
- Rests are refused in a live encounter by the HP rule; a rest that would only reset pips is
  blocked by the interface, not by the server.
- A legacy sheet gets its class features and resources on its next save (adopting hand-typed
  ones with the same name).
- Hosted PostgREST and Storage were exercised through PGlite tests and the e2e fixture, not a
  two-account browser session.
