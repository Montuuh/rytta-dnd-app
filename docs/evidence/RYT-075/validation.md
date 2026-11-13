# RYT-075–077 verification: the table's portion of the map, deleting scenes, placing props

Delivery of 2026-11-09 on `main`. The user asked for three things:

- the DM chooses which portion of a larger map the table shows;
- the DM can delete scenes from the tabletop;
- placing a prop shows a translucent preview, lets the sprite turn, and the whole placing UX improves.

Design flow recorded with the review.

## What changed

- **RYT-075, the table's portion.** The calibrated table frame on the DM board moves.
  - **Moving it:** with Select, drag its tab, or tap the tab and then a square. While it waits, the
    option strip says so in words with Cancel; Escape or a second tap on the tab also cancels. A drag
    while waiting still pans the map.
  - **Where it goes:** it snaps to whole squares inside the map (`placeFrame`, unit-tested). While it
    moves, what the table will not show is dimmed.
  - **The tab:** 44 CSS px tall at any zoom, outside the frame, so it never hides the map's squares.
    A frame as large as the map is only a label.
  - **Before and on the table:** before the scene is on the table the frame is prepared and kept for
    the browser tab (`prepared-view.ts`), and "Put on the table" uses it, in the editor and in the
    library. On the table, a move shows at once, changes the table screen, and offers Undo.
  - **Keyboard and screen readers:** "Move the table here" (and the inspector's "Centre the table
    here") uses the board cursor when the keyboard moved it, otherwise the middle of the board in view.
    Moves are announced as the columns and rows shown.
- **RYT-076, deleting scenes.** Each plate's menu has "Delete the scene" after a divider. Its
  confirmation names the scene and the number of items. When the scene is on the table, it says the
  players will stop seeing it, on a tinted note. It says it cannot be undone. Cancel holds the first
  focus. The deletion uses the existing transactional RPC; afterwards the library says so in a visible
  status line and focus returns to "New scene".
- **RYT-077, placing props.**
  - **The preview:** a translucent copy (62 %) of the chosen prop follows the mouse or the keyboard
    cursor on the squares it would take. Its footprint is drawn above the fog with a constant 2 px
    dashed line on a dark halo. The preview is the exact picture and turn that will be placed: the
    item's id picks its picture, and the pictures are preloaded when the prop is chosen.
  - **On touch:** the preview rises 48 px above the finger, and the prop is placed where the finger
    lifts. Lifting off the map places nothing.
  - **The strip, above the board:** two quarter-turn keys (R / Shift+R) with the angle; "Another
    version", shown only when the prop has several pictures, which always changes the picture and
    says "Version n of m"; "Change prop", which focuses the props search; a hint written for touch or
    keyboard; and "Done", which returns focus to the board.
  - **After placing:** "Barrel placed · Undo". The next prop repeats the chosen version.
  - **Fixed along the way:** the preview of props with even sides matched where they were placed only
    after a critique finding; both now use `propFootprint` (unit-tested).

## Checks

| Check | Result |
| --- | --- |
| `npm run check` (typecheck, lint, contracts, unit and SQL tests, build) | Pass, 332 tests |
| Tabletop e2e (`tests/e2e/tabletop.spec.ts`, 1440, 820 touch, 390) | 21 passed |
| Full e2e suite (after the critique and review fixes) | 518 passed, 55 skipped (existing) |
| Independent UI review | PASS in round 2 for fingerprint `a65d16d1…297a678ec` (the review) |

UI review rounds:

- **Round 1: CHANGES_REQUIRED.** It found four P2 findings.
  - R75-1: closing the delete dialog left focus nowhere.
  - R75-2: a failed delete lost focus.
  - R75-3: the red menu item failed contrast in the light theme.
  - R75-4: "colocado" assumed the prop's gender.
- **Round 2: PASS.** All four were verified fixed:
  - focus returns to the plate's menu;
  - the busy button is `aria-disabled` and keeps focus;
  - the item uses `var(--danger)`, and axe passes on the open menu;
  - the notice reads "Objeto colocado: {{name}}.".

  The P3 fixes were also verified: Cancel in the wait focuses the board, the frame's Undo is
  announced, and choosing a prop in the phone drawer focuses the board.
- **Still P3:**
  - the 244 px tab on phones;
  - the phone strip scrolls as one row with no cue (the design system's strip pattern);
  - the zoom keys cover the map's bottom-right squares at fit on phones (pre-existing).

New e2e, "RYT-075/076 the DM deletes a scene and chooses what the table shows":

- **Deleting:** it deletes the live scene after a cancel, with axe on the dialog. It checks the
  focus on Cancel, the irreversibility, the status line and the focus back on "New scene".
- **Preparing the frame:** it taps the tab, checks the visible wait with Cancel, then taps a square.
  It checks that "Put on the table" uses the prepared frame.
- **On the table:** it drags the tab by ten squares (desktop and tablet).

The editor e2e places a barrel turned 90° with the strip's keys, "Another version", the hover
preview and R / Shift+R.

Captures: `desktop-*`, `tablet-*` and `mobile-*` `.jpg` in this folder. There is no mobile capture
of the prop preview because on a phone it only shows while a finger is pressed.

Not tested: a real TV, iPad or screen reader. The drag of the tab is tested on desktop and tablet;
the touch press-drag-release placement is not driven by the e2e. Database: no migration (the
deletion RPC already existed).
