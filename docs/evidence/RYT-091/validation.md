# RYT-091 verification: the stat block uses the room under its plate on the web

Date: 2026-11-13. Builds on RYT-088 (plate-led stat block).

## Design flow

- Problem seen in the browser before the change: in the laptop side pane (574px frame at 1440) the
  plate kept its own sticky column (230px) and the whole stat block was squeezed into 320px beside
  it, leaving the column under the picture empty; in sheets (820 to 1280) the same empty column
  ran under a 280px plate.
- Design brief: line length of 65 to 75 characters, sticky elements must not cover content.
- Options page with the real Adult Red Dragon stat block at the real pane and sheet widths,
  scrollable. The user chose P1 A (side pane: flow under the picture) and P2 B (wide sheet: stat
  column). After the UI review the user decided that on short sheets the column stays fixed (the
  abilities move to the reading) rather than scrolling away.

## Behaviour

| Frame | Layout |
| --- | --- |
| Under 31rem (phones) | Unchanged: plate above the name. |
| 31 to 44rem (laptop side pane from about 1280px, 820 sheet at 150% text) | Plate beside the name and the core numbers (HP on its own row, AC and initiative, speed); the abilities (one row of six), details and sections run underneath at the pane's full width. The plate scrolls with the block. |
| 44rem and up (tablet and laptop sheets) | Stat column (17.5 to 26rem, 38% of the frame): plate, core numbers and, on sheets 57.5rem or taller, the abilities (three a row, six once the column reaches 26rem); name, details and sections on the right, capped at 72ch. The column stays in view, sticky under the sheet header, on sheets from 35rem tall. On shorter sheets the abilities lead the reading as one row of six. In both cases the plate shrinks only as far as needed for the column to end above the action bar. The sheet is a size container, so these heights follow the page's text size (a media query would keep counting 16px rems). A size check on the column removes the sticky position when it still does not fit (a notice under the plate, a long speed, a landscape phone), so it scrolls with the page instead of ending under the bar. |

Quick creatures (no stat block), the combat console and the editor preview are unchanged.

## Checks

- `npm run check`: passed (54 files, 375 unit/SQL tests, build).
- e2e `bestiary`, `bestiary-official`, `combat`, `encounter-builder` at 390/820/1440: 128 passed,
  10 skipped (`limitMatrix` and tablet-only cases). Earlier runs: two Player tests of `combat.spec.ts` (RYT-007) failed
  once at 1440 while all suites ran in parallel and passed 12 of 12 alone; the RYT-053/088 plate
  test measured the plate while the tablet sheet was still sliding in (2 of 3 runs), so it now
  measures once the plate has stopped moving (`settledBox`); RYT-046 now reads the visible
  abilities list (the reading's copy is hidden).
- Fit probe (lich, EN, column bottom against the action bar while scrolling): 820x1180, 820x900,
  1024x768, 1024x1366, 1140x1030, 1100x800, and 1920x1080, 1280x1080, 1440x900 at 150% root text:
  the column always ends above the bar. 844x390 (landscape phone) is below 35rem: not sticky.
- New e2e `RYT-091 the stat block uses the room under its plate` (tablet and laptop): side pane
  numbers beside the plate and abilities under it at full width in one row; wide sheet column with
  the plate, numbers and abilities, sticky while the reading scrolls; at 1024x768 the column keeps
  the plate and numbers above the action bar and the abilities lead the reading in one row.
- Captures (fixture server, Desktop Chrome viewports): 390x844, 820x1180, 1024x768, 1280x720,
  1440x900, 1920x1080, Hearth and Parchment, ES and EN, 150% root text. Evidence here:
  `pane-1440-full.png`, `pane-1280x720.png`, `pane-1440-parchment-en.png`, `sheet-1024x768.png`,
  `sheet-1024x768-scrolled.png`, `sheet-1024x768-parchment-en.png`, `sheet-820-sticky.png`,
  `phone-390.png`, `stat-block-tablet.png`.

## Design critique

- Design review: heuristics 14/20. Applied: the side pane now starts at 31rem
  so 1280px laptops get it (it stacked at 1280x720); short wide sheets keep a sticky column with the
  plate and the numbers instead of an empty column (abilities move to the reading, the plate gives
  way to fit); HP on its own row with the dice on one line in both layouts; the reading column is
  capped at 72ch and the stat column grows to 38% of the frame; the plate aligns with the name's top
  in the side pane; the core cells are named (`sb-core-ac`, `-hp`, `-init`) instead of selected by
  position.
- Technical audit (pattern detector, in-page overlay, browser checks): detector clean; audit 17/20. Applied: the short/tall and sticky decisions
  moved from height media queries to a size container on the sheet, so 150% text no longer hides the
  abilities under the action bar; the plate is sized to the measured column budget in both modes
  (no 15px overlap at 1140x1030); the sheet has `scroll-padding-block` for its header and action bar,
  so keyboard focus is no longer covered (pre-existing, WCAG 2.4.11); `text-wrap: pretty` on the
  creature line and entries; the column comment matches its six-across case; the unreachable
  laptop-pane sticky offset was removed. Kept: the reading's hidden copy of the abilities (one is
  always `display: none`, so assistive technology reads one list).

## UI review

- Round 1 (`c03eb46c…`): changes required.
  - F1: the sticky column could end under the action bar when a notice sat under the plate or a
    speed took two lines (1024x768, 960x600, and 1440x900/1920x1080 at 150% text). Fixed: the CSS
    sizing stays for the usual case, and a size check removes the sticky position when the column
    still does not fit, so it scrolls with the page.
  - F2: Shift+Tab in the laptop pane left the pencil under the pinned actions (WCAG 2.4.11). Fixed:
    the page reserves the bar's height at the top while the pane is open.
  - F3: acceptance criterion 2 did not describe short sheets. The user chose to keep the column fixed
    there; the criterion and the scope now say so.
  - F6: `docs/design-system.md`, this record and a CSS comment were out of date; corrected.
  - Left as minors: on phones, a campaign version's "back to the official" control is reached before
    the plate (DOM keeps the name first, CSS shows the plate first); at 150% text in the 820 and 1024
    side-pane flow, the numbers beside the plate are taller than it, leaving a strip under the plate.
- Round 2 (`dbc5c87e…`): changes required. F2, F3 and F6 resolved; F1 still failed when a campaign
  creature got its first image (the column appeared after the size check had run). Fixed: the check
  runs again when the plate appears; new e2e (a campaign creature with a long speed gets its first
  image at 1024x768 and the column scrolls with the page), which fails without the fix.
- Round 3 (`60dfa0f4…`): PASS. Checked in the browser: first images at 1024x768 and 960x600 in both
  themes and languages and at 150% text (the column scrolls with the page while it does not fit and
  sticks again once it does), sticky columns at 820x1180 and 1024x1366, side panes at 1280x720 and
  1440x900, axe clean. Not covered: real devices, screen readers, hosted storage.
