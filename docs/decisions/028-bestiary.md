# ADR 028: SRD bestiary in the DM Command Center, full stat blocks and combat trackers

Date: 2026-11-04. Status: accepted for `RYT-046`–`RYT-049`; production migration `bestiary`
applied 2026-11-04 (hosted version 20261104020328). Supersedes the "Rytta bundles no monster stat
blocks" limit of ADR 024 and the bestiary tab of the combat page (RYT-036), and extends ADR 025
(glossary sources) and ADR 027 (creature images).

## Context

The user asked for a DM-only bestiary with most D&D monsters already imported, homebrew creatures
built from templates, and an assessment of whether full stat blocks are worth it. Decisions
confirmed by the user on 2026-11-04:

- Import only SRD 5.2.1 (2024) monsters and animals, English and the official Spanish edition.
- Creatures outside the SRD (beholder, mind flayer, githyanki…) are not bundled; the DM pastes a
  stat block from a book they own and Rytta drafts a private homebrew creature (phase 4).
- Homebrew lives per campaign (no account library yet).
- In combat: a table alias, optional rolled hit points, per-creature trackers and the stat block
  in the DM console.
- The bestiary belongs in the DM Command Center.

## Decision

### Content and licensing

- System Reference Document 5.2.1 by Wizards of the Coast LLC, CC-BY-4.0
  (https://www.dndbeyond.com/srd): "Monsters A–Z" and "Animals", 330 stat blocks per language,
  paired one to one by their numbers (ability scores, hit points, armour class).
- Spanish text is the official Spanish SRD 5.2.1, never a machine translation. Rytta's
  adaptations, stated in the attribution: the text is split into structured fields (each language
  keeps its own entry order) and joined across line breaks; the printed XP of
  the Archmage (8,000) is shown as printed while the index uses the SRD's own CR table (8,400);
  a missing minus sign on one printed save (Young White Dragon, Intelligence) is restored; the
  trait library replaces the source creature's name with "the creature" / "la criatura".
- `scripts/bestiary/` (Python, pdfplumber, run manually; PDFs are never committed) reuses the
  glossary's styled-line reader and writes `src/features/bestiary/content/`:
  `index.json` (≈68 kB, ≈12 kB gzip: names in both languages, CR, XP, PB, size, type, tags, AC,
  HP, initiative, legendary uses, SRD pages, and per-CR medians) and `{en,es}.json`
  (≈0.55 MB, ≈82 kB gzip each: stat blocks and 48 reusable traits). They load as lazy chunks only
  on DM bestiary and combat routes. `content.test.ts` rejects schema drift, missing pairs, markup
  artefacts, unknown glossary spells and inconsistent keys.
- Every entry has a language-neutral `key` (English slug); usages (`Recharge X–6`, `N/Day`, lair
  variants) and per-day spell lists (glossary spell ids) are parsed once from English and shared.

### One stat block model

- `StatBlock` (feature `bestiary`, domain) is the same structure for SRD and homebrew: name,
  meta line, AC, initiative, HP and dice, speed, six abilities (score, modifier, save), detail
  lines (skills, resistances, vulnerabilities, immunities, gear, senses, languages), CR line and
  sections (traits, actions, bonus actions, reactions, legendary actions with intro). Entries hold
  a key, a name, paragraphs in Rytta's inline markup (`*em*`, `**strong**`, never HTML), an
  optional usage and spell lists. Text links rules terms through `GlossaryText`.
- Full stat blocks are worth it: the DM runs a creature from the screen without a book. No rules
  engine: attacks and damage are not resolved (ADR 024 non-goal stands).

### Data

- `combatant_templates` keeps its core columns (name, side, HP, AC, initiative, legendary, notes,
  image) as the combat contract and adds `stat_block` (jsonb object, ≤ 48 KB, validated by shape
  on the server and by Zod in the client), `srd_id` (the SRD creature it was customised from),
  `hp_formula` (`NdM±K`), `challenge` (CR text) and `creature_type`.
- SRD creatures are not stored: using one adds combatants with a snapshot of its numbers and its
  `srd_id`; "Customise" saves a campaign copy with `srd_id`.
- `encounter_combatants` adds `public_name` (table alias), `srd_id` and `trackers` (jsonb array
  of `{key, kind: recharge|uses, label, min|max, spent|used}`, ≤ 24 items).

### Combat

- `add_combatants` accepts for NPC entries `public_name`, `srd_id`, `hp_mode` (`average` or
  `roll`, rolled per creature on the server from the template's or the entry's formula) and
  `trackers` (validated, created fresh). Aliases are numbered like names ("Shadow 1, Shadow 2").
- `set_combatant_tracker` (DM, idempotent): marks a recharge spent or available and sets uses.
  At the start of a creature's turn the server rolls 1d6 for every spent recharge and records a
  DM-only `recharge` event with the roll.
- `update_combatant` accepts `public_name` (null reveals the real name; the log records a visible
  `reveal` with `{alias}`).
- `get_combat_state`: Players and the table see the alias instead of the name everywhere (rows,
  log, summary), and no image while an alias is set; `srd_id`, `template_id` and trackers are DM
  only. Hidden creatures stay invisible as before.

### Interface

- **Command Center tab "Bestiary"** (`members?panel=bestiary`, `&creature=<id>` deep link).
  The combat page keeps encounters only; its old bestiary tab redirects here.
- Toolbar: search (both languages), source (all, SRD, campaign), filters (CR range, type, size,
  favourites, kept per device), sort (name, CR) and a result count. Rows show a token, name, CR,
  type and size, AC and HP, and a source badge.
- Tablet and laptop: list and stat block side by side; phones: the stat block opens in a full
  screen sheet (focus trap, Escape, focus returns to the row). Actions: add to an encounter
  (count, average or rolled HP, alias, hidden, shared initiative), customise or duplicate,
  edit, image, delete.
- **New creature** offers four starts: quick (core numbers only), from an SRD creature, archetype
  and CR (brute, skirmisher, artillery, spellcaster, leader, minion; numbers from SRD medians per
  CR adjusted by Rytta's archetype rules) and paste text (parsed to a draft the DM reviews).
- **Editor**: sections for identity, defences, abilities, details and the entry lists; computed
  modifiers, saves, passive Perception, average HP from dice, XP and PB from CR, a balance hint
  ("numbers like CR 3–4") and a trait library (SRD traits shared by two or more creatures). A live
  preview sits beside the form from 62em and behind a tab on phones.
- **DM console**: the combatant detail adds the stat block (collapsible), tracker chips (recharge
  available/spent, uses as notches) and the table alias.
- Touch targets ≥ 44px, keyboard and Escape everywhere, both themes and languages, no colour-only
  state, reduced motion respected.

## Consequences

- DMs run SRD creatures without books; homebrew keeps the same format and tools.
- Two lazy chunks of ≈82 kB gzip load only when a DM opens the bestiary or a stat block.
- Creatures outside the SRD depend on the DM's paste; Rytta never ships them.
- Template stat blocks are DM data under RLS; the bundled SRD text is public content and is not a
  secret (what the DM prepares is).
- Not covered: account-wide libraries, encounter difficulty/XP budgets, 2014 (5.1) monsters, lair
  action automation, attack resolution.
