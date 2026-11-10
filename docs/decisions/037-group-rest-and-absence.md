# ADR 037: group rest with a vote, absent characters and the new-character card

Date: 2026-11-10. Status: accepted for RYT-079 to RYT-082. Amends ADR 026 (character roster: one
active character per Player) and ADR 035 (rests on the sheet).

## Context

Until now each sheet rested on its own (the dock's buttons): the browser computed the new play
state and wrote it with `set_character_vitals`, and a short rest healed nothing. The user asked for
a rest the table agrees on:

- a Player taps a rest;
- Rytta checks whether anything comes back, then asks "send the request?";
- every active Player votes in a shared panel that shows what each character gets back;
- the rest resolves for everyone who rests.

The user also asked:

- the DM can mark a character as not at the table today;
- "Create character" lives in the party list, for the DM as for Players.

Design options were published as an artifact and chosen in two rounds
(https://claude.ai/artifact/3n1i1bKVnA6Q7Ea84rRmV8; see the
[design flow](../evidence/RYT-080/design-flow.md)).

## Decisions (user answers, 2026-11-10)

| Question                    | Decision                                                                                                                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| How others hear of it       | B, a fixed notice under the header on every campaign screen, with Vote                                                                                                                        |
| Panel                       | A, "Hoguera": portraits around the fire, the vote on each ring, recovery per character below                                                                                                  |
| The check before asking     | Something to get back (HP, resources, slots, hit dice); with nothing, warn but allow asking for the group                                                                                     |
| Who asks                    | Any Player whose character is at the table, and the DM                                                                                                                                        |
| The DM                      | Does not vote for Players; sees the panel; "Rest now" or cancel; votes for unassigned characters                                                                                              |
| Resolution                  | Unanimity: one "Not now" and nobody rests                                                                                                                                                     |
| Short rest HP               | Each Player picks how many hit dice to spend and types the total rolled, or taps "Roll for me" (3D dice as in Foundry; only the roller sees them; Rytta amber); Rytta adds CON per die        |
| Closing                     | When everyone voted; the requester and the DM can cancel; expires after 10 minutes                                                                                                            |
| Encounters                  | A Player whose character is in a live encounter cannot ask; the DM can                                                                                                                        |
| 0 HP                        | SRD 5.2.1: a rest needs 1 HP; the character shows "Cannot rest" and gets nothing back                                                                                                         |
| Where to ask                | On the sheet, as before                                                                                                                                                                       |
| Absence                     | A new "Absent" state, separate from "Active"; set by the DM from the 3-dot menu of "Players' characters"; lasts until the DM changes it; DM characters can be absent too                      |
| What absence does           | Out of the party and every other campaign list, encounters and rests; only in the Player's "My characters" and the DM's listing; the Player reads the sheet only and cannot switch characters |
| Busy characters             | Cannot be marked absent while in an open trade or a live encounter                                                                                                                            |
| The DM and active character | The DM may also make any present character of a Player the active one                                                                                                                         |
| New character               | A "New character" card closes the party list for the DM and for Players                                                                                                                       |

## Consequences

- **Absence reuses the roster rule.** `characters.absent` is DM-only and forces
  `is_active = false`, so every list already limited to active characters (party, overview, trades,
  shops, encounter pickers, combat state) leaves it out without new filters. A Player with an absent
  character and none active is "benched": the roster trigger accepts it, `set_active_character`
  refuses them, and a character they create, restore or accept joins in reserve. Triggers refuse
  writes by anyone but the DM to an absent character's row, sheet, play state, resources, inventory
  and shop orders, and refuse adding it to an encounter. An absent character cannot be archived.
- **Rests move to PostgreSQL.** `request_rest`, `vote_rest`, `resolve_rest_now`, `cancel_rest` and
  `get_rest_state` replace the browser-computed rest. `private.rest_effect` mirrors
  `applyRest` (domain/rules.ts) and adds the short-rest healing (roll + CON per die, at least
  1 per die); the whole group's play state changes in one transaction and the existing audit
  triggers put it in every sheet's history. Votes live in `private.rest_votes`; members read only
  `rest_requests` (no secrets) for realtime and refetch the state, with polling as the fallback.
  The recovery of a teammate who does not share their live sheet stays hidden (RYT-031).
- **Dice.** The 3D dice are the MIT `@3d-dice/dice-box` build (Babylon.js, ammo.js), vendored in
  `public/vendor/dice-box` with its notices and loaded only on the first "Roll for me". The
  package's install script prompts for a folder, so it is not an npm dependency. Reduced motion,
  no WebGL or a failure roll evenly with `crypto.getRandomValues` and no animation.
- **Create.** The DM's header button is gone; the card at the end of the party list opens the same
  dialogs (unassigned character for the DM, the Player's own roster up to four).
