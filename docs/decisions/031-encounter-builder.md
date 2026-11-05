# ADR 031: encounter builder with the SRD 5.2.1 XP budget

Date: 2026-11-05. Status: proposed for `RYT-054`. No schema change. Builds on ADR 024 (combat),
ADR 028 (bestiary) and ADR 029 (bestiary instruments). Lifts the "XP budgets and encounter
difficulty" non-goal of the combat design analysis and of ADR 028.

## Context

Rytta prepares fights as draft encounters (RYT-036): the DM adds the party, bestiary creatures in
numbered batches, hidden reinforcements and a lair, but nothing says how hard the fight is. The user
asked to improve encounter preparation with ideas from D&D Sync, reviewed in the browser with the
user's account on 2026-11-05 (see [research](../research.md)). D&D Sync's builder keeps its own
roster in browser storage: party levels typed by hand, a 2014/2024 toggle with the old count
multiplier, a budget scale, filters and a random fill, then "add all to combat".

SRD 5.2.1 (CC-BY-4.0) licenses the method in "Combat Encounters" (Gameplay Toolbox, pages 201–202):
choose Low, Moderate or High, multiply the "XP Budget per Character" value for the party's level by
the number of characters, spend creature XP without going over, and keep the troubleshooting advice
in mind (many creatures, number of stat blocks, powerful creatures, CR 0 creatures, adjustments).
The 2014 thresholds and multipliers are not in an open licence and stay out.

## Decision

- The draft is the builder. There is no second roster: the difficulty is computed from the
  combatants the server already holds, so creatures added from the bestiary dialog, the Add tab or a
  suggestion all move it, and other DMs see the same measure. A prepared draft is the "saved
  encounter".
- Pure domain (`combat/domain/difficulty.ts`): the SRD table for levels 1–20, the party budget as the
  sum of each character's row (mixed levels add up character by character, an adaptation of "multiply
  by the number of characters"), and the band as the smallest budget that holds the spent XP (SRD
  example 1 counts 150 XP for a 200 XP Low budget as Low). Over High is its own band.
- The party is the characters in the draft; while none was added, every assigned character in play.
  Characters without a sheet count as level 1 and are named. Levels come from the DM's party overview
  (`get_party_overview`), never typed into the builder.
- Enemy creatures spend their XP: SRD creatures from the bundled index (the lair XP when the draft has
  a lair), campaign creatures from their challenge rating. Allies and creatures typed in without a
  bestiary origin are listed as not counted. Batches ("Bandit 3") are grouped by name.
- Notes follow the SRD troubleshooting and only appear when the draft triggers them: more than two
  enemies per character (stressed at levels 1–2), more than three stat blocks, a creature whose CR is
  above the party's rounded average level, and more than three CR 0 critters that are not swarms.
- Suggestions spend the XP left to a chosen difficulty without going over, using creatures with a CR
  no higher than the party level, no lone CR 0 critters and at most two creatures per character
  (counting enemies already in the draft; with no room left nothing is suggested). One kind is as
  many of one creature as fit; "a leader and its band" is exactly one leader and two or more
  lower-XP creatures of the same type. The type follows the most common enemy type in the draft
  until the DM picks one. Suggested creatures use their normal XP (they are not in their own lair).
  The search runs once per set of choices; the fullest builds are drawn at random and "Other ideas"
  draws new compositions first and says when none are left. Adding one calls the existing
  `add_combatants` RPC with average hit points, a shared initiative per group and the stat block's
  trackers.
- UI: a difficulty card under the flow strip of draft and initiative encounters (DM console only):
  band seal and title, the reading, one "Suggest creatures" action, a gauge with the three budget
  notches, the room line, the party line, margin notes and a disclosure with the party and creature
  ledgers. The suggestion dialog uses bestiary tiles for difficulty and kinds and a select for the
  type. Players, the table view and the summary are unchanged.

## Consequences

- No new data, RPC or policy: authorization stays on `add_combatants`, `get_combat_state` (DM
  projection with `srd_id` and `template_id`) and `get_party_overview`. No SQL denial tests are
  needed for this ticket; the e2e exercises the SDK contract fixture.
- Difficulty is advice for the DM, not a rule the server enforces.
- Not covered: the 2014 count multiplier, habitat filters (the SRD index has no environments),
  difficulty on encounter list cards, a preview of the change inside the bestiary's add dialog, XP
  awards after a fight.
