# ADR 004: DM-created characters and player assignment

Date: 2026-10-27. Status: accepted requirement for RYT-003; not implemented.

## Context

The user clarified that the DM creates characters and invites a Player to link to a
specific character. Initially, a Player uses one character per campaign. Multiple
characters per Player and character activation/deactivation are future work.

## Decisions

- Character creation and assignment belong to the DM. A character may exist before
  its Player has an account or has joined the campaign; an unassigned character must
  not require a placeholder player identity.
- The DM can invite a Google account email for a specific unassigned character in
  that campaign. The Player accepts the invitation and becomes linked to that character.
  The Player does not create or choose a different character through this flow.
- The initial model permits at most one assigned character per Player per campaign
  and at most one assigned Player per character. This limit is campaign-scoped,
  not global: the same person can play different characters in different campaigns.
- Invitation acceptance, Player membership activation and character assignment must
  be atomic and checked in the database. Reject cross-campaign assignment, assigning
  an already-linked character, linking a second character to the same Player and
  expired/reused/revoked invitations. Concurrent acceptances cannot bypass these rules.
- Preserve the existing non-destructive membership-revocation policy. Exact DM-driven
  reassignment behavior must be defined in RYT-003; removing access must never delete
  the character or its resources, or silently transfer it to another Player.
- Supporting several characters per Player and activating/deactivating characters
  is explicitly deferred. Do not implement a character switcher or lifecycle system now.

## Consequences and current boundary

RYT-003 must extend character ownership and the RYT-002 invitation flow. The current
foundation requires a character's `user_id` to reference a campaign member, and invitations
have no character association. That model does not yet support pre-created unassigned
characters or atomic invitation-to-character linking. A later reviewed migration and UI
delivery must add these capabilities; recording this ADR changes no runtime behavior.

Module-specific Player/DM permissions remain separate requirements. The character link
does not grant DM privileges or access to another Player's private character data.
