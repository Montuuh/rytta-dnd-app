# RYT-180 audit: the administration panels before the redesign

Measured on 25 November 2026 on `next` (fc5f556c) against the e2e fixture backend, Hearth theme,
Spanish, with a throwaway Playwright script: Members, Party level, Modules, Dice, Content and Audit
at 390x844, 820x1180 and 1280x800, plus four task flows on the phone. Fixture: one DM, three
Players, a party level of 6, one reserve and one free character, a content pack with a pending
version. Raw numbers are in `before/metrics.json`, captures in `before/`.

## Measurements (390x844)

| Panel       | Page height | First control      | Help text over 40 characters | Badges |
| ----------- | ----------- | ------------------ | ---------------------------- | ------ |
| Members     | 1217px      | 183px (Invite)     | 196 characters               | 4      |
| Party level | 844px       | 393px (stepper)    | 179                          | 0      |
| Modules     | 844px       | 287px (first switch) | 62                         | 1      |
| Dice        | 1165px      | 215px (first option) | 510                        | 0      |
| Content     | 945px       | 230px (first switch) | 153                        | 0      |
| Audit       | 844px       | 245px (filter)     | 84                           | 2      |

Steps per task inside the panel, counted on the phone:

| Task                                   | Steps today                                      |
| -------------------------------------- | ------------------------------------------------ |
| Raise the party one level              | 3 taps: plus, Set level 7, Confirm               |
| See who is below the party level       | not possible here (the panel gives a count only) |
| Change how the table rolls             | 3 taps and a scroll: Apply appears at 865px      |
| Link a character to a Player           | 4 taps: Link, open the select, choose, Link      |
| Make a member DM or remove a member    | 3 taps: menu, action, Confirm                    |
| Hide a module from Players             | 1 tap                                            |
| Review a new version of a content pack | 1 tap, at 282px after the first pack row         |
| See what changed on one character      | read the whole list (filter is by type only)     |

A member row is about 155px tall: three and a half members fit in the first phone screen.

## Findings

1. High. Dice: after choosing another option nothing changes in view. "Apply changes" is added at
   the end of a 1165px page (865px, below an 844px screen and behind the bottom navigation). Each
   of the six options carries its full explanation whether chosen or not.
2. High. Party level: raising by one, the common case, takes three taps. The panel says how many
   characters are below the level but not which ones. On a phone the title is shown twice and the
   current level three times (seal, stepper, button).
3. Medium. Members: a role badge on every row (three of four say Player), "Link character"
   repeated on each row, and the character actions open a dialog with a select.
4. Medium. Members: "Pending invitations" is shown with an empty sentence when there are none,
   and "Leave campaign" keeps a boxed, disabled button while the DM is the only one.
5. Medium. Content: the pending version sits in the middle of the list, and three of five
   categories only say that no pack is published for them.
6. Medium. At 1280px the panels stretch to 936px: in Members the role and the menu are about
   800px from the name; settings are single lines of text from edge to edge.
7. Low. Modules: the first switch is at 287px because the hint wraps in four lines next to a
   badge with the count; active rows are marked with a fill.
8. Low. Audit: no filter by character; character names are badges; the first sentence describes
   the screen.

Already right: Invite player is at 183px, a module is changed in one tap, and Refresh shows only
on Members and Audit (RYT-179).

## Not measured

Parchment theme, English, 150% text, reduced motion, axe in this pass (the existing e2e suite
covers it per panel), screen readers on real devices and hosted data.
