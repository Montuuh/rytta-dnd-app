# ADR 010: One home for character management

Date: 2026-10-29. Status: accepted for RYT-021.

## Context

The DM finds the split between Party and Members & invitations confusing: character
creation and resources live in Party, while assignment and unassigned characters live
in Members. A character requires switching screens to complete its setup.

## Decision

- Party owns every character action: create, edit resources, link and unlink a Player.
  Cards show assignment status and the linked member's display name when available.
- Members & invitations owns people, membership invitations, roles, removal and leave.
  Remove its character payload, character blocks and assignment dialogs. A named link
  leads to Party; Party links back to Members for invitations and access management.
- Keep the one-character-per-Player rule. The assignment dialog lists only active
  Players without a character, identified by name and email. Explain when Players are
  absent or already assigned, rather than presenting an unexplained disabled control.
- Unlink requires confirmation and preserves membership and resources. Creation remains
  possible before a Player joins. Membership invitations stay independent of characters.
- Reuse existing authorized RPCs and query invalidation. No schema, backend permission
  or deployment changes are needed. Real Players and Player preview remain read-only.

## Consequences

This supersedes the placement of character controls in ADR 006 and ADR 009. Their
membership, removal, invitation and preview contracts remain in force. Character actions
are no longer duplicated across different management concepts; navigation labels and
page headings match in both languages.
