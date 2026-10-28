# ADR 006: Separate account, settings and character assignment

Date: 2026-10-28. Status: implemented in source; independent UI/UX review PASS.
Supersedes the shell and assignment-screen placement in ADR 005.

Global actions sit at the right of the header: authenticated account, then settings menu.
Account exposes campaign home and sign-out. The settings drawer opens from the right and
contains one Settings action, which opens a centered large preferences dialog. Campaign
navigation remains in the sidebar, with its own control on mobile. Campaign name is shown
in the header; the prior context panel, tagline and live-mode badge are removed. Demo
content remains explicitly labelled in its main content. Unimplemented module entries and
cards remain readable but disabled and have no navigation link. Sidebar has no account-home link.

Members & invitations owns character metadata and assignment: member/character names,
linking to an existing active Player, unlinking, and character-targeted email invitations.
This view requests no resource projection. Character page only creates characters and edits
resources. DM must unlink an owner before assigning a new one. Direct linking serializes
on the campaign row, requires active own-campaign DM and an active same-campaign Player,
checks unassigned ownership and one-per-Player uniqueness, revokes pending character
invitations and uses the existing character audit trigger. No resources are changed.

DM Player view is a presentation preview. It never changes membership/JWT/SQL privileges.
It hides editor/member controls and requests only the DM's own character resources using
an explicit user filter. A DM without an assigned character sees the ordinary empty Player
state. Exit remains available in the header. Preview is scoped by identity/campaign, so it
does not carry into another campaign or identity. It is not impersonation of another Player.

The additive SQL migration was applied to Rytta as 20261028205805. Two existing characters
were present before/after; no data assignment was changed during migration verification.
Local actor/assignment tests cover unauthorized actors, inactive/invalid targets, duplicate
and cross-campaign assignment. Hosted two-account Auth/PostgREST is still a separate layer.

Design reference: Carbon UI Shell separates global header actions and right-side panels:
https://react.carbondesignsystem.com/?path=/story/components-ui-shell-header--header-w-actions-and-right-panel
Mantine remains the implementation kit. No external code or assets were imported.
