# ADR 057: the DM administration panels act in fewer steps

Date: 2026-11-25. Status: accepted for `RYT-180`. Builds on
[ADR 056](056-dm-command-centre-home-and-navigation.md); changes the party level confirmation of
RYT-130 and the dice settings panel of RYT-133 ([ADR 046](046-table-pieces.md)). No database
change.

## Context

After the navigation of RYT-179 the six administration panels were measured on 25 November 2026
([audit](../evidence/RYT-180/audit.md)): raising the party one level took three taps and the panel
did not name the characters below it; the dice panel added its Apply button at 865px of an 844px
screen; a member row was 155px tall with a role badge on each; the pending pack version sat in the
middle of Content; the audit could not be read per character. The owner answered the options page
the same day with the recommended option in each of its seven questions.

## Decision

1. **Members.** Two-line rows (name; DM mark and active character) with one actions button that
   opens a sheet for that member: open the sheet, link or switch a character from a list, change
   the role, remove, and Leave campaign on the DM's own row. Sent invitations are rows of the same
   list. From 48em the list reads as columns. Role changes, removal and leaving keep their
   confirmation.
2. **Party level saves at once and offers Undo.** The panel shows the level, a filled action for
   the next level and a disclosure with the stepper for any other value. A change is one
   idempotent request with no confirmation; a status line with Undo stays in the panel until the
   DM leaves it or changes the level again. Undo is another request with its own id. This is safe
   because a level change never edits a sheet: each Player confirms the guided level-up. The panel
   lists the characters with their level, those below first.
3. **Dice keeps its confirmation.** The panel is two rows with the current values; each opens a
   sheet with its three options and one line of consequence. Choosing another option asks once,
   for that single change, because who sees the rolls changes for the whole table immediately.
   There is no Apply button. Arrow keys move between options without committing.
4. **Modules** are one count line and the switches; state is carried by the switch, not a fill.
5. **Content** shows pack versions to review first, with the panel's one filled action; the text
   of a pack row opens its entries; categories without packs are one line.
6. **Audit** filters by character as well as by type and groups events by day.
7. **Sheets.** A per-row or per-setting sheet is a bottom drawer on phones and a dialog from
   48em, with a 44px close control, Escape and Back, and focus returned to its trigger.
8. **Rules for these panels.** One title per panel on a phone, no badges, one filled action per
   panel, settings in a 44rem measure on wide screens.

## Consequences

- Steps on a phone: raise the level 1 tap (was 3), a dice setting 3 taps without scrolling (was 3
  and a blind scroll), link a character 3 (was 4); numbers and captures in the
  [validation record](../evidence/RYT-180/validation.md).
- A mistaken level is one tap from being set, and one tap from being undone; the DM is told in
  words, in the panel, what was set.
- The email of a member is in the sheet on phones and in the row from 48em. Archived characters
  are no longer listed in Members; the roster keeps them.
- Linking or switching a character is offered for Players, as before, not for a DM's own row.
- Carried from the RYT-179 review and closed here: keys typed right after Ctrl+K, the unit of the
  navigation counts, focus on the stepper from "Set party level", the switcher at 390x667 with
  150% text, and the home's feedback when a party, proposal or session query fails.
- Not verified on real iOS Safari or Android, with VoiceOver or TalkBack, or against hosted data.
