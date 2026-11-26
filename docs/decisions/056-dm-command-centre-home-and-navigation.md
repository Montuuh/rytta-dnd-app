# ADR 056: the DM command centre has a home and grouped navigation

Date: 2026-11-25. Status: accepted for `RYT-179`. Replaces the tab navigation of
[ADR 012](012-dm-command-center-and-module-visibility.md) and
[ADR 018](018-dm-command-center-storeroom.md) and the landing of three links from RYT-151; the
panels and their `?panel=` links stay.

## Context

The owner asked for an audit of the command centre: too many clicks and things hard to reach.
Measured on 25 November 2026 ([audit](../evidence/RYT-179/audit.md)): three taps and a scroll to
any panel, panel content from 525px of 844 on a phone because the eight tabs never collapse,
session tools (bestiary, storeroom) listed after one-time settings, pending work visible only
inside its tab, and no current-page mark inside the panels. Accessibility checks passed (axe
WCAG 2.2 AA, 44px targets), so the cost was reach and orientation. The owner answered the options
page the same day: A for the six design questions and three deliveries (RYT-179, RYT-180, RYT-181).

## Decision

1. **Home.** The campaign index is the DM's board: the live encounter with its resume action (the
   one filled action), the pending work (invitations to accept, item proposals, characters below
   the party level and the first-session steps until complete), the session tools and the
   campaign rows with their current value. Empty blocks are not drawn. Players are still sent to
   Party.
2. **Groups.** Panels are destinations in three groups: At the table (bestiary, storeroom), Party
   (members, party level) and Settings (modules, dice, content, audit). The party level is its
   own panel, `?panel=level`. Prepare session is no longer a panel: `?panel=prepare` opens the
   home, where its steps are pending work.
3. **Navigation is links, not tabs.** From 48em a grouped side navigation with Summary first; on
   phones the panel name is a button that opens a sheet with the same groups, next to a link back
   to the home. The current destination carries `aria-current`, and a panel loads only when
   chosen. The main navigation marks the command centre as current on the home and in every panel.
4. **Quick switcher.** For the DM, Ctrl+K or Cmd+K, `/` outside text fields where the screen has no
   `/` shortcut of its own, and a search control in the header open a dialog that lists the panels
   and five actions (invite player, new creature, new item, distribute loot, set party level). It
   is built from Mantine's dialog and combobox; no dependency is added.
5. **Action links.** `?do=` on a panel runs one action (`invite`, `new`, `loot`) and is removed
   from the URL with a history replace, so reload and Back do not repeat it.

## Consequences

- Any panel is two taps from the navigation on a phone and its first control is in the first
  screen; the numbers are in the [validation record](../evidence/RYT-179/validation.md).
- Tests address panels by link and URL instead of by tab role.
- The home runs the member, invitation, roster, encounter and proposal queries that the panels
  already ran; it adds no request of its own and no database change.
- The panels are unchanged inside. The administration panels follow in RYT-180 and the bestiary
  and the storeroom in RYT-181, each after its own options page.
- Not verified on real iOS Safari or Android, with VoiceOver or TalkBack, or against hosted data.
