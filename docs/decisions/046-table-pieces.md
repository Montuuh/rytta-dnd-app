# ADR 046: level up, one table screen for combat, the phone map, dice and casting

Date: 2026-11-17. Status: accepted for RYT-127. Implemented by RYT-130 to RYT-134.

## Context

The Player journey audit of 2026-11-17 found five gaps that small fixes could not close, so
RYT-124 and RYT-126 moved them to RYT-127 as new interface pieces:

- J2-06: there is no level-up flow; a Player edits level, hit points and features by hand.
- J4-01, J4-02 and J4-19: combat on a shared screen keeps DM chrome, scrolls and uses small
  type, so the order cannot be read from the table.
- J4-05: on a phone the map is a small board under page chrome.
- J2-26 and J4-21: there are no dice outside the short rest, and the sheet does not say what
  to roll.
- J2-24: there is no casting, no slot choice and no concentration marker.

The owner reviewed an options page with three directions per piece, at phone and wide sizes in
both themes, on 2026-11-17.

## Options considered

- **Level up.** A: a guided step-by-step sheet; B: before and after on one screen; C: the DM
  raises the party and each Player goes through A.
- **Table screen for combat.** A: a "now and next" combat screen of its own; B: an initiative
  track; C: one table screen, the map with a turn plate and, without a map, as A.
- **Map on the phone.** A: the board is the page, with floating buttons; B: a map with a sheet
  that peeks up; C: today's page, compacted.
- **Dice.** A: roll in the app; B: physical dice first, the app says what to roll; C: the table
  decides, physical dice by default.
- **Casting spells.** A: "Lanzar" on each prepared spell; B: minimal, spend by hand from the
  spell row; C: complete, A with a summary, damage by slot level and a concentration warning.

## Decision

1. **Level up: option C.** The DM raises the party's level from the DM centre, and each Player
   then goes through a guided step-by-step sheet: hit points with the hit-die average
   pre-filled or a typed roll; what the level grants by name; choices; one confirm; a "what
   changed" notice.
2. **Table screen for combat: option C.** One single table screen. With a map, the map is full
   screen with a turn plate (now / next) over a corner that can be moved or shrunk. Without a
   map, a chrome-less "now and next" screen shows the whole order in two or three columns, in
   large type readable at 1–2 m, and follows the acting row automatically. Any player of the
   campaign may open the table screen.
3. **Map on the phone: option A.** The board is the page: full-bleed map, a compact turn strip
   on top, floating round tool buttons (centre on my token, measure, effects), and labels at a
   constant readable size.
4. **Dice: option C.** The table decides through a campaign setting chosen by the DM (physical
   dice, dice in the app, or each player chooses), physical by default. In physical mode the
   sheet says what to roll and what to add and can optionally record the result. In app mode
   tapping a modifier rolls the 3D dice with the maths shown and a recent-rolls strip. Who sees
   rolls made in the app is decided by the DM in the campaign settings. Build order inside the
   piece: B (what to roll), then the setting, then A (in-app dice).
5. **Casting spells: option A.** "Lanzar" on each prepared spell: choose the slot level, the
   slot is spent, a concentration marker appears in the sheet hero and is replaced by a new
   concentration spell, and ritual casting spends nothing. A manual way out stays for table
   rulings.
6. **Build order.** 1 level up (RYT-130), 2 table screen for combat (RYT-131), 3 map on the
   phone (RYT-132), 4 dice (RYT-133), 5 casting spells (RYT-134).

## Consequences

- Level up and dice need backend work first: a party level the DM sets through an authorised
  operation, and a campaign dice setting with a roll visibility rule enforced by RLS. The table
  screen, phone map and casting reuse existing projections and sheet state.
- The table screen opened by a Player shows only the Table projection; it never carries DM
  data. The table screen does not depend on the phone map, and the two can be built in either
  order once RYT-126 lands.
- Physical dice stay the default, so a table that ignores the setting sees no change beyond the
  "what to roll" hints.
- Casting counts slots and marks concentration; it applies no spell effect, damage or saving
  throw, and the manual edit stays for rulings.
- Not decided here: multiclass level up, automatic rule effects of features, rolls shared with
  the table screen.
