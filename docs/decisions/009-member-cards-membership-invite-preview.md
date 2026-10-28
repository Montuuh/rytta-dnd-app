# ADR 009: Member cards, membership invites and Player impersonation preview

Date: 2026-10-29. Status: accepted for RYT-020.

## Context

DMs asked to stop using a separate character-assignment block, invite Players without a
character, unlink characters when membership ends, and preview the table as a chosen Player.

## Decisions

- Members & invitations lists each member with their linked characters (metadata only) and
  per-card link/unlink controls. Unassigned characters appear in their own list.
- Campaign membership invitations (`invite_campaign_member`) are restored for authenticated
  DMs. Acceptance without `character_id` activates Player membership only. Character-targeted
  invitations remain available at the database layer for future use.
- Removing or leaving a campaign sets `characters.user_id` to null for that member while
  preserving character rows and resources.
- DM Player view is a presentation impersonation of a selected active Player. It never
  changes JWT, membership or SQL privileges. Party requests filter to that Player's
  character(s). Exit returns to DM controls in the header.

## Consequences

ADR 004's "preserve assignment until explicit unlink" no longer applies to membership
revocation or leave; those paths unlink automatically. ADR 006's "not impersonation"
preview is superseded by this selectable Player POV. One character per Player per campaign
remains enforced.
