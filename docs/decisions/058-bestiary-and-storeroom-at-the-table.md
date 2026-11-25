# ADR 058: the bestiary and the storeroom are built for use at the table

Date: 2026-11-25. Status: accepted for `RYT-181`. Third delivery after
[ADR 056](056-dm-command-centre-home-and-navigation.md) and
[ADR 057](057-dm-administration-panels.md). Changes the bestiary layout of
[ADR 028](028-bestiary.md) and its stat block plate, and the storeroom of
[ADR 018](018-dm-command-center-storeroom.md). No database change.

## Context

The two screens the DM opens during play were measured on 25 November 2026
([audit](../evidence/RYT-181/audit.md)) with 330 creatures and a storeroom of 9 and of 129 items:
one creature fitted in the first phone screen, a creature's first attack sat 1,300px down its
sheet under a 340px picture, adding a creature to an encounter took four taps from the bestiary
and one from a fight, giving one item took seven taps because a row opened the editor, and
searching "goblin" and pressing Enter opened another creature. The owner answered the options
page the same day with option A in each of its eight questions.

## Decision

1. **Rows are for scanning.** A creature row is one button of about 57px: a small token, the
   name, type with armor class and hit points, and the challenge rating as text. An item row is
   one button of about 64px. Neither row carries badges or a menu; the favourite toggle and the
   rare actions live where the thing is open.
2. **The head is the search.** On both screens the search and Filters come first; New creature,
   Creature packs, New item and Manage catalogue are in one menu beside them. The storeroom keeps
   Distribute loot as its one filled action and shows the proposals row only while one waits.
3. **Search ranks by where the name matches.** Names that start with the query, then names where
   a word starts with it, then the rest; accents and case are ignored and Enter opens the first.
4. **A stat block opens on what a fight needs.** A thumbnail beside the name, then armor class,
   hit points, initiative and speed, then actions, bonus actions, reactions and traits; abilities
   and lore follow. The picture opens large on request. The action bar is one row.
5. **From 48em the stat block is a pane beside the list**, not a sheet over it. The selected row
   carries the rail and `aria-current`; arrows move the selection and Escape closes the pane.
6. **Adding to the open encounter is direct.** With an encounter in progress, or the one opened
   last in the session, the stat block offers a count and "Add to {encounter}" and adds with the
   dialog's defaults. A status line with Undo stays in the stat block; Undo removes exactly the
   combatants that were added, with the existing remove operation. The dialog remains for another
   encounter, a new one, or other options; it is the first entry of the stat block's menu, so the
   bar stays one row.
7. **An item opens to be read and given.** The item sheet is read-only with Give as its main
   action, Edit beside it and the rest in a menu. Giving to one character is quantity, a radio
   list and "Give to {character}", through the existing distribute operation; the result is a
   status line on the list. There is no review or closing screen for one item.
8. **Loot is a list of lines.** One line per item with its recipients as toggles and a quantity,
   a searchable alphabetical picker, a summary per character and one fixed "Deliver" action that
   replaces the review, confirm and close steps.
9. **A proposal can be accepted as written.** "Accept and give" sends the draft the editor would
   send untouched and is offered only when that draft passes the editor's validation; "Review
   first" opens the editor.
10. **Typed work is not discarded silently.** Escape or Back on a quick creature or a new item
    with content asks first.

## Consequences

- Steps and offsets on a phone, before and after, are in the
  [validation record](../evidence/RYT-181/validation.md).
- The creature row no longer shows the name in the other language or a picture control, and the
  item row no longer has a menu: those actions are one tap further, inside the open creature or
  item. Editing an item is row, Edit (two taps) instead of one.
- A creature or an item can reach an encounter or a character with fewer confirmations. The
  status lines say what happened and the creature add can be undone; a delivered item is taken
  back from the character's inventory as before.
- Creature search and item search rank the same way through two small helpers (the creature one
  also weighs the name in the other language); they are kept separate on purpose.
- The carried findings of the RYT-180 review are closed here (held Enter on the party level,
  Parchment greys, the dice confirmation sentence, the switcher placeholder, focus after a
  stale-version error).
- Not verified on real iOS Safari or Android, with the on-screen keyboard over sheets, with
  VoiceOver or TalkBack, or against hosted data.
