# Product brief

## Purpose and roles

Rytta supports a group playing custom D&D campaigns in the same room. Players use
phones/tablets to consult information that otherwise requires paper bookkeeping.
A shared screen already handles maps. Keep the table playing.

- DM controls campaign content, character resources, merchants, prices and visibility.
- Players consult authorized information and eventually buy, sell, equip and use items
  through validated operations. They cannot directly edit gold, food, water or exhaustion.
- A future table display is a read-only projection, never a blindly mirrored DM session.

Roles belong to campaigns. A user can be a DM in one and a player in another.
Bootstrap creates the first DM. Email-addressed in-app invitations add Players; multiple
DMs may share management. Promote another DM before stepping down or leaving. Creator
attribution confers no special privileges. The campaign hub lists campaigns and invitations.

Accepted requirement for RYT-003: the DM creates a character before inviting its Player.
The invitation targets that character; acceptance links it to the Player in the same campaign.
Initially each Player has at most one assigned character per campaign, and a character has
at most one assigned Player. Characters can await assignment without a player account.
Multiple characters per Player and character activation/deactivation are deferred.
This flow is not yet implemented; see [ADR 004](decisions/004-player-character-assignment.md).

## Delivery strategy

This delivery establishes code, contracts, UI primitives, navigation, docs and AI workflows.
First playable milestone: identity → campaign invitations → DM resources →
inventory/equipment/use/undo → merchants. Each is a separate verified slice.
Quests, glossary and combat follow; atlas, album, stronghold and crafting are later modules.

## Assumptions and decisions to settle

- D&D edition and encumbrance variant are not yet chosen; support homebrew.
- Store money in integer copper; weight, water and travel units need a ruleset decision.
- Mano Hundida is an instance of the stronghold domain, not a global hardcoded subsystem.
- Interface languages are Spanish (default) and English, selected per device. Dark mode
  is the default; light mode is optional. User-authored campaign content is preserved.
- Start online. Offline mutation queues require explicit conflict/economy semantics.
- Google is the only initial identity provider, with open registration and no email allowlist.
  Invitations last seven days and appear inside Rytta; no email notifications are sent.
- Before affected tickets, settle character reassignment details, public HP visibility, undo limits, resale rounding,
  supported browser floor and licensed glossary sources.

## Non-goals

Full VTT, battle-map renderer, IR touch hardware, 3D dice, autonomous DM, subscriptions
and runtime LLM integration. AI architecture here means development agents and workflows.
No brainstorming item is implicitly promised for the first release.
