# RYT-055–062 design flow: tabletop

Date: 2026-11-05. Flow: [UI design flow](../../ui-design-flow.md). Decision: [ADR 032](../../decisions/032-tabletop.md).
Analysis: [tabletop design](../../tabletop-design.md).

## 1. Brief (`ui-ux-pro-max`)

The brief covered the five surfaces (tabletop home, map generator, DM editor, table screen, Player
view), their states (loading, empty, error, forbidden, no calibration, offline) and the project
constraints. Database matches applied:

- **Dragging movements (WCAG 2.2 AA, high):** every drag has a single-pointer or keyboard
  alternative. Tokens and props move by tap-to-select then tap-a-square, and by arrow keys; the table
  frame moves by "Move the table here" in the board menu; measures accept tapped waypoints.
- **Focus not obscured (AA, high):** the option strip and panels never cover the focused token; a
  selected item scrolls into view inside the board, and panels shrink the board instead of
  overlaying it on tablets.
- **Touch spacing (medium):** 8px between 44px keys in the tool kit and option strip.
- **Gesture conflicts (medium):** the board owns one-finger tool gestures and two-finger pan/zoom
  (`touch-action: none` on the board only, `overscroll-behavior: contain`); page scroll stays outside.

The style and palette searches returned generic dark/neon looks that do not fit the field-journal
identity; they were not used (no database match for a cartographer's instrument UI, so the widget
direction below is the project's own).

Direction:

- **Editor, tablet (≥ 48em):** a compact head (back to the library, the scene name in the serif,
  the "On the table" seal or the one primary action "Put on the table", and "Open the table screen").
  The board fills the rest. A **tool kit** rail on the left: nine square keys in a ruled tray, glyph
  and a short label, the keyboard letter engraved in a corner; the active key is an inked well (accent
  ring, raised surface). It is one radio group (arrows, Home, End). The **option strip** above the
  board shows only the active tool's instruments. Panels (Tokens, Props, Story, Audio, Scene) open as
  a side sheet that narrows the board, chosen from journal tab stubs on the board's right edge.
- **Editor, phone (390px):** the head keeps the name and a menu (put on the table, open the table
  screen, scene settings). The kit becomes a bottom tray of five keys (select, measure, area, fog,
  door) and "More" (note, event, prop, ping); panels are bottom drawers at 75dvh.
- **Measure (the key tool):** a measuring tape on the board, a dashed ink line with a tick at every
  square and waypoint knots; the readout rides near the end: feet as a large serif figure, squares
  beneath. The strip lists the segments ("15 + 20 ft"), a snap switch, "Show on the table" and Clear.
  A polite live region announces the total when a measure ends.
- **Calibration:** an instrument card: TV size tiles (32–86″) plus a number dial for any diagonal,
  base tiles drawn to scale (25, 28, 32 mm and custom), a fine adjustment slider in percent and the
  result line "1 square = 25.4 mm · 47 × 26 squares fit". The table screen shows a ruler of squares
  with a base outline to check against a miniature.
- **Library:** scene cards as map plates (thumbnail on a mat, serif name, one meta line); the card
  opens the editor; a menu holds put on the table, rename and delete. The scene on the table carries
  a seal with the words. One primary action: "New scene", which offers three choice cards (generate,
  upload, blank grid).
- **Generator:** options beside a live preview (stacked on phones, preview first); kind, look, size
  and density as painted tiles with glyphs; secret doors as a labelled switch; the seed with a dice
  key for "Another"; one primary "Create scene". The preview caption counts rooms, doors and props.
- **Table screen:** the map and nothing else, a small status corner (scene, round and turn,
  connection in words), a first-tap card (sound, full screen, keep awake), the calibration notice when
  there is no setup, story cards on a parchment plate with large type for reading across the table,
  a ping ripple (a static ring with reduced motion) and the shared tape.
- **Player view:** the board fitted to the phone, pinch zoom, the measure tool only; a shown story
  card opens as a sheet.

Avoided pills, badges and generic buttons, and why:

- No pill row of tools: the kit is a radio group of keys with glyphs and words.
- No chips for shapes, fog modes or door states: painted tiles with glyphs (shape drawn to its
  outline) and a door inspector with three states drawn as the door itself.
- No "hidden" badge: hidden tokens and props are drawn with a dashed outline and an eye-off glyph,
  and the inspector says it in words.
- No button rows for reveal all, hide all, clear or reset: they live in the tool's menu.
- "On the table" and "Fired" are seals with words, not pills.
- One primary action per view: library "New scene", editor "Put on the table" (none once it is on the
  table), generator "Create scene", calibration "Save the table", story card "Show on the table".

## 2. Refinement (`frontend-design`)

The one memorable thing is the map itself: maps that look drawn in the same field journal as the
app. Everything around the board stays quiet: app tokens, Georgia for names and figures, the system
sans for controls and labels. No new fonts or libraries.

**Map looks (Canvas 2D, 64 px per square, seeded noise).**

| Look | Ground / void | Floor | Walls | Grid | Accents |
| --- | --- | --- | --- | --- | --- |
| Ink (parchment) | paper `#E6D7B8` with sepia cross-hatching `#5B4128` (35 %) in a band of half a square outside walls | lighter paper `#F2E6CC` | ink `#3A2816`, 4 px, doubled hairline outside | sepia `#8A6A45` at 35 %, 1 px | water wash `#9DB7B0` with ink ripples; forest canopy wash `#B9C79A` with scalloped ink rims; planks as fine sepia lines |
| Painted | rock `#1B1712` with grain | flagstones `#6E655A` ±8 % lightness, grout `#4A433B` (crypt cooler `#5E6068`, cave earth `#5A4A3A`, tavern planks `#7A5232`, forest grass `#4E6B34` in noise patches) | `#2B241D` with a lit top edge `#8C7F6E` and a quarter-square inner shadow | ink at 28 %, 1 px | canopy `#2F4A22` with a lit rim `#4F6E35` and a drop shadow; water `#3E6B78` with highlights; hearth glow |

**Props.** Line art in a unit box per square: outline 2.5 px at 64 px per square (0.04 square),
detail strokes 1.25 px, a flat wash (paper tint on ink maps, material colour on painted maps) and no
gradients. Rotation in 90° steps around the box centre. Hidden props are drawn at 45 % with a dashed
outline and an eye-off glyph for the DM.

**Tokens on the map.** The combat token shapes (round party, rounded-square ally, hex enemy) fill
their squares with an 8 % inset and a ring in the side colour. A name plate sits under the token
(cream on espresso at 85 %, `clamp(12px, 22 % of a square, 22px)`, two squares wide at most, ellipsis).
The active turn is a double amber ring that breathes over 2.4 s (static with reduced motion);
defeated creatures turn grey with an ink strike and a skull; the health band is the combat glyph
in a small seal with its word for screen readers.

**Fog.** DM: the fog colour at 55 % with a crisp edge, so the map shows through. Table and Player:
opaque fog filled with a paper-fibre noise tile made once on a canvas, edges feathered by a slight
mask blur (0.15 square).

**Measuring tape.** An amber line (`--app-accent`, 0.08 square) over a dark halo (0.16 square) so it
reads on any map, dashed like a tape; a diamond at every counted square; waypoint knots with a dark
ring. The readout plate: feet as a large Georgia figure, squares beneath in the sans.

**Areas of effect.** Fill at 28 % and outline at 80 % per damage type: fire `#E06A2B`, cold
`#74B9DE`, lightning `#E5D04A`, thunder `#8FA3C7`, acid `#B5C93A`, poison `#7FAE4E`, necrotic
`#7D6B91`, radiant `#F2D27A`, force `#B08CE6`. Caught squares get corner ticks. The label always
names the shape and the damage type in words (never colour alone).

**Motion (answers to actions only; reduced motion removes movement and keeps opacity).**

- Tool switch: the active key inks in over 120 ms; the option strip cross-fades.
- Door toggle: the leaf swings 90° about its hinge in 180 ms.
- Token moves on the table glide 220 ms so players can follow them.
- Story card on the table: the parchment plate settles from 96 % scale and transparent in 280 ms.
- Ping: two rings expand three times over 900 ms; with reduced motion one static ring for 2 s.
- Fog changes are instant (a reveal is the DM's deliberate act; no animation to wait for).

## 3. Impeccable critique and audit of the rendered UI

Run on the first rendered build at 390, 820 and 1440 px (ES dark). Critique 22/40, audit 12/20.
Each finding and what changed:

| Finding | Severity | Change |
| --- | --- | --- |
| The board is not the hero: tablet chrome, a 170 px map on phones, the sheet covering the board under 75em | P1 | Portrait tablets (48–62em) put the tools in one row under a full-width board and open panels below it; the phone editor hides the app bottom bar and footer (the back arrow leaves); the option strip is hidden for Select |
| Failed writes were silent and optimistic moves stayed on screen | P1 | Every write goes through one runner: a failure shows over the board (`role="alert"`) with Try again for offline/unavailable errors; optimistic item patches roll back |
| No keyboard way to use the board itself | P1 | The board takes focus with a square cursor: arrows move it (Shift: five), Enter does what a tap does with the current tool (measure waypoint, area origin, fog room/brush/box, door, note, event, prop, ping, select, move) and the square is announced |
| Dragging had no single-pointer alternative | P1 | The inspector's "Move to a square" waits for a tap or the cursor; areas turn with two 15° keys and a degree readout |
| Lasting areas could not be selected, edited or removed | P1 | A seal at each area's origin is a focusable button that opens the area inspector; Delete removes, Undo restores |
| The DM's Player preview read the DM projection | P1 | The Player view always asks for the table projection; the board also drops hidden items, notes, events and secret doors outside DM mode |
| Lair aliases reached the table under the real name | P1 | Migration `20261111130000_tabletop_alias.sql` (PRE first, then production) |
| Focus and selection rings vanished at fit zoom | P1 | Rings and selection strokes are sized by `--tt-z` so they stay 3 screen pixels; tokens get a dark halo |
| Tool letters worked from anywhere | P1 | Letters work only while focus is in the editor; entering the editor focuses its title (WCAG 2.1.4) |
| DM fog was a muddy 55 % sheet | P1 | A 45° hatch (about 35 % coverage) keeps the map readable and fogged ground obvious |
| Event trigger buried under its settings | P1 | Trigger and a one-line summary of what it does come first; the settings sit under a disclosure |
| Rooms had no names on the DM board | P2 | Room numerals (serif, haloed) on the DM board only |
| Plain chips for ambiences; Stop duplicated Silence | P2 | Three-column glyph tiles; the extra Stop removed (each track keeps its own) |
| Generator preview and Create scrolled away on phones; full-size repaint per keystroke | P2 | Sticky preview (capped at 30 % of the height) and sticky footer; deferred generation and a light preview canvas |
| Table words in fixed pixels | P2 | `--tt-sq` sizes status (0.4 sq), story title (1.1 sq) and text (0.6 sq), capped by the viewport height; table names at about 0.28 sq; status above the story dimmer |
| Selection seals over tile words; side stripes on active tab and shown card | P3 | Reserved room for seals; full accent border and a tinted row instead of stripes |
| Delete without undo or focus return; repeated announcements swallowed | P2 | Undo after removing; focus returns to the board cursor; identical announcements still reach screen readers |
| Hidden tokens dimmed their name plate | P2 | Only the art dims |
| Map image failure was silent | P2 | A message over the grid |
| Player offline gave no notice | P2 | The stale notice shows above the board |
| Percentages and sizes built by hand | P3 | `Intl.NumberFormat` for percent and MB, no-break spaces before units |
| "Open the table screen" competed with the primary action | P3 | A subtle link with an external-window glyph and a hidden "opens in a new window" |
| Door buttons used `aria-pressed` for a three-state door | P3 | Plain buttons; the state is in the name |

Left as known limitations: tool letters follow the English initials in both languages (documented
in the board help); the table's health band uses the combat token's own ring, not a separate seal;
SVG hit areas stay in squares (at fit zoom the cursor and Tab are the reliable way to reach doors).
