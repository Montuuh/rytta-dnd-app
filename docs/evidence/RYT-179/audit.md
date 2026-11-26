# RYT-179 audit: DM command centre before the redesign

Measured on 25 November 2026 on `next` (962dc43a) against the e2e fixture backend, Hearth theme,
Spanish, with a throwaway Playwright script: the DM landing and the eight panels at 390x844,
820x1180 and 1280x800 (27 screen states). Raw numbers are in `before/metrics.json`, captures in
`before/`.

## Measurements

| Measure                                  | Phone 390                    | Tablet 820    | Laptop 1280       |
| ---------------------------------------- | ---------------------------- | ------------- | ----------------- |
| Taps from the navigation to a panel      | 3 (DM, Manage campaign, tab) | 3             | 3                 |
| Height of the panel tab list             | 358px                        | 108px         | 398px (side rail) |
| Offset of the panel content from the top | 525px of 844                 | 338px of 1180 | 228px of 800      |
| axe violations, WCAG 2.0 to 2.2 A and AA | 0                            | 0             | 0                 |
| Controls under 44px in the main area     | 0                            | 0             | 0                 |
| Horizontal overflow                      | none                         | none          | none              |

Taps to common tasks on a phone: open the bestiary, 3 and a scroll; open Give for an item, 5 and a
scroll; invite a player, 3 and a scroll (the Invite button is cut by the bottom navigation in the
first screen); change from one panel to another, scroll up, 1 tap, scroll down.

## Findings

1. High. The DM landing is a menu of three links and the session journal. It adds a tap to every
   task, leaves most of the screen empty and shows neither a live encounter nor pending work.
2. High. On a phone the eight tabs are a list that never collapses: after choosing a panel the DM
   scrolls 525px to reach it, on every panel.
3. High. The bestiary and the storeroom, opened during play, are siblings of one-time settings
   (dice, content, modules) and sit at the end of the list. The default panel is Members.
4. Medium. Inside the panels the main navigation does not mark the command centre as the current
   page: the link matches only the campaign index (`end`), so `/members` has no current item.
5. Medium. Pending work (invitations to accept, item proposals, characters below the party level)
   shows only as a count inside its own tab.
6. Medium. The tab list is declared vertical in every layout, but on a tablet it is a five-column
   grid, so left and right arrows do not move between tabs; each arrow also selects the tab and
   mounts its panel (the bestiary mounts 330 creatures). Read in the code, not exercised with a
   screen reader.
7. Medium. Modules and Audit have no h2; the bestiary and the storeroom repeat the tab name as
   their own title.
8. Low. Refresh in the page head appears on every panel but refetches only members, invitations
   and audit events.
9. Low. Prepare session keeps a panel after its three steps are complete.

## Not measured

Parchment theme, English, 150% text, reduced motion, VoiceOver and TalkBack on real devices, and
hosted data. The existing e2e suite covers themes and languages per panel.
