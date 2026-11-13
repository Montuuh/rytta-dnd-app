# ADR 041: a party led by portraits, free characters, leaving a campaign and one image viewer

Date: 2026-11-13. Status: accepted for RYT-095, RYT-096, RYT-097 and RYT-098. Amends ADR 004
(player assignment), ADR 022 (trade entry points), the RYT-031 party live sharing rule and ADR 037
(the new-character card in the party list).

## Context

The user reported that nobody could leave a campaign, asked whether a Player without a character
could take one the DM had already created, and asked for a prettier Party page: no large "New
character" card, no general Trade button, bigger character art and a few sheet facts. Every picture
of a character or creature should open large, on every panel. The options were weighed on a
published options page (2026-11-13); the user accepted every recommendation:

1. The own character is a plate led by its portrait; teammates are portrait cards.
2. The DM sees one plate per character with inline counters.
3. Teammates the DM does not share live still appear, without live state.
4. Trading starts from an icon on the teammate's portrait.
5. One full-screen viewer ("curtain") for every picture.
6. A picture inside a control that already acts becomes its own button.
7. A Player takes a free character directly, with a short confirmation.
8. Free characters also appear in My characters while the Player has fewer than four.
9. Leaving lives in the campaign card menu and in the profile menu.

A follow-up question settled what "free" means: only characters the DM created that never had a
Player. A character whose Player leaves, or that the DM unlinks, goes back to the DM and is never
offered again; the DM can still assign it by hand.

## Decision

### Data (migration `party_claim_characters`)

- `characters.ever_assigned` becomes true the first time `user_id` is set (trigger, never cleared),
  backfilled from the character audit history without writing audit rows.
- `private.is_free_character(campaign, character)` is the single rule: unassigned, never assigned,
  no pending unexpired character invitation (the DM chose someone), not archived, present (RYT-079)
  and not a combatant of an encounter that has not ended (no mid-fight hand-over, and the DM's draft
  or hidden preparation stays private).
- `list_claimable_characters(campaign)` returns the free characters to active Players only;
  `claim_character(campaign, character)` links one to the caller under the campaign lock, with the
  four-character limit and the `assign_character` active rule. Re-claiming your own character
  returns it; anything else that is not free is `Character unavailable`. DMs assign instead.
- `get_party_overview` returns every assigned teammate to Players; for a teammate the DM does not
  share live, every live field (HP, temporary HP, AC, exhaustion, conditions) is null on the server.
- Players may read the portrait of a free character (`private.can_view_portrait`).
- Leaving keeps using `change_campaign_member(campaign, self, null)`; the last DM still cannot leave.

### Interface

- Party (Player): the active character's plate (portrait banner with name, HP meter with temporary
  HP, AC seal, exhaustion pips, gold/water/rations ledger, View sheet and Inventory); teammates as
  4:5 portrait cards with an HP band on the art edge and a round trade icon on the portrait corner.
  Unshared teammates show a dimmed portrait, name, class and level. The dashed new-character card
  and the general trade launcher are gone; Players create from My characters.
- Party (DM): one plate per character with owner, live switch, ⋯ menu, HP, AC, gold (tap to edit),
  water and rations steppers (hold ×5) and exhaustion pips; "Character" in the page head creates.
- The Player welcome lists free characters first ("Play as <name>"), then "Create my character";
  My characters has a "Free characters" section while the roster has room. A lost race closes the
  confirmation, says so and refreshes the list.
- Leaving: a ⋯ menu on each card of My campaigns and an item in the profile menu inside a campaign
  open one confirmation that names the campaign and the consequence; the user lands on My campaigns
  with a status message. The DM Command Center reuses the same dialog.
- `ImageViewer` (shared, presentational): full-screen dark curtain in every theme, whole image,
  title, zoom (double tap, pinch, button), optional caption and actions, Escape closes only the
  viewer, focus returns to the picture. It replaces the creature art viewer and the sheet portrait
  viewer and opens from portraits, creature art, tokens and item pictures. Pictures smaller than
  44px inside dense controls open from their detail instead; the tabletop board is excluded.

## Consequences

- Players see their teammates' names, classes, levels and portraits even when the DM does not share
  them live; live state stays private to the server.
- A character that ever had a Player is never offered again; reusing it needs the DM.
- A Player who leaves loses their characters to the DM (as before) and needs a new invitation.
- The character history does not show assignment changes; the audit log keeps them for the DM.
