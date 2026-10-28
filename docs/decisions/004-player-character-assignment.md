# ADR 004: DM-created characters and player assignment

Date: 2026-10-27. Status: implemented in the RYT-003 source delivery; production migration pending.

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

RYT-003 adds nullable ownership, campaign-scoped unique assignment, targeted invitations,
RPC creation/unlinking and audited resources. Every assignment mutation locks the campaign
before checking active DM permissions. Acceptance activates Player membership and links
its character atomically. Explicit unlink uses the expected previous owner, preserves
resources/membership and cancels pending character invitations. Revocation preserves the
assignment until a DM explicitly unlinks it; returning Players also use this deliberate
unlink/reinvite flow. Existing untargeted pending invitations are revoked by the migration
and must be reissued for a character. See ADR 005 for homebrew units and account navigation.

The migration is verified locally and has not been applied to the hosted project.

Module-specific Player/DM permissions remain separate requirements. The character link
does not grant DM privileges or access to another Player's private character data.
