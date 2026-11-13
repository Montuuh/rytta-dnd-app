# Tabletop module: design analysis

Tickets: RYT-055 (foundation: scenes, maps, grid calibration, table display), RYT-056 (map
generator), RYT-057 (tokens and the combat link), RYT-058 (measuring and areas of effect), RYT-059
(fog, rooms and doors), RYT-060 (notes, events and story cards), RYT-061 (table audio), RYT-062
(props). Decision record: [ADR 032](decisions/032-tabletop.md). Research:
[D&D Sync Tabletop](research.md#dd-sync) reviewed in the browser with the user's account on
2026-11-05, [Owlbear Rodeo](research.md#owlbear-rodeo), SRD 5.2.1 "Playing on a Grid" and "Creature
Size and Space" (pages 13–14, CC-BY-4.0) and the area of effect entries of the Rules Glossary.

This document separates observations (what the table needs and what D&D Sync does) from decisions
(what Rytta builds) and lists deliberate non-goals.

## 1. Context and constraints

- In-person play. The battle map lives on a screen lying on the table (a TV, a monitor or a large
  tablet), and the players put physical miniatures on it. Every player also has a phone. The
  product brief said "a shared screen already handles maps"; the user now wants Rytta to be that
  screen (ADR 032 revises the non-goal).
- The table screen is a projection: it never shows DM secrets, even when the DM's account opens it
  (the same rule as the combat table display, RYT-038).
- The DM prepares and drives from a tablet or a phone, often the same device that runs combat.
  Touch first, 44px targets, keyboard and Escape, both themes and both languages, no colour-only
  status (design system).
- PostgreSQL RLS and security definer RPCs are authoritative; the browser never edits shared state
  read-modify-write. Realtime is a hint; polling and refetch on reconnect keep the truth.
- Every generated map, prop and sound is made by Rytta's own code.

## 2. What D&D Sync's Tabletop does (observed)

| Area         | Observed in D&D Sync                                                                                                                                                                                                                                                                             | Rytta                                                                                                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scenes       | Scenes hold several maps (floors), quick switch, folders, tags, music per map, duplicate                                                                                                                                                                                                         | **Adapt**: a scene is one map with its grid, items and fog; one is "on the table"                                                                                                                                 |
| Map sources  | Drop an image, video or Universal VTT file; blank grid; generator                                                                                                                                                                                                                                | **Adapt**: image upload, blank grid, generator. No video maps; Universal VTT import came later (RYT-065)                                                                                                          |
| Generator    | 15 kinds (dungeon, crypt, cave, sewer, mine, temple, town, village, tavern, building, forest, ruins, camp, swamp, desert); look (painted, classic, parchment); density, corridors, loops, traps, secret doors, water, rubble; floors 1–4; size presets including "Table 48 × 27"; seed; GM marks | **Adapt**: dungeon, crypt, cave, forest and tavern in two looks (ink on parchment, painted); density, corridors, secret doors, size from the calibrated table, seed and reroll; rooms and doors come with the map |
| Table setup  | Cast or open the table window; tap for full screen and sound; pick the TV diagonal, the width follows from the reported resolution; "1 square = 1 inch"; a ruler to check with a miniature; players' side; interface size                                                                        | **Keep**: calibration from diagonal, resolution and the miniature base, a ruler, a fine adjustment and a screen that reports its own resolution                                                                   |
| Tokens       | Party and combatants listed with HP and initiative; place one or all; place hidden; size in cells; vision and carried light                                                                                                                                                                      | **Adapt**: place the encounter's combatants (one, all enemies, the party), hidden, size from the creature size; no vision or light                                                                                |
| Turn bar     | Initiative bar on the map with Next and End                                                                                                                                                                                                                                                      | **Link**: the table shows whose turn it is from the combat module; turns stay in combat                                                                                                                           |
| Measure      | Ruler tool                                                                                                                                                                                                                                                                                       | **Keep, first-class**: waypoints, SRD grid counting, feet and squares, shown on the table on demand                                                                                                               |
| Spell areas  | Sphere, cube, cone, line, cylinder, size, label, lasting                                                                                                                                                                                                                                         | **Keep**: the six SRD shapes, affected squares and tokens, lasting areas                                                                                                                                          |
| Walls, doors | Line, room, round, cut a door; wall, door, window, secret door, invisible; auto-detect                                                                                                                                                                                                           | **Adapt**: doors only (open, closed, locked, secret); walls are part of the map art                                                                                                                               |
| Lights       | Torches, braziers, flicker, day/night                                                                                                                                                                                                                                                            | **Skip** (dynamic lighting is a remote-VTT feature)                                                                                                                                                               |
| Fog          | Reveal and hide by brush, box or room; player view preview                                                                                                                                                                                                                                       | **Keep**: brush, box and room; reveal or hide all; the DM sees through it                                                                                                                                         |
| Draw, ping   | Free drawing, ping, "pull everyone's view"                                                                                                                                                                                                                                                       | **Adapt**: ping and "move the table view here"; no free drawing                                                                                                                                                   |
| Props        | Pictures and short videos shown over the map (handouts), NPC portraits                                                                                                                                                                                                                           | **Split**: story cards (text and image handouts) and map props (objects drawn on the map)                                                                                                                         |
| Objects      | Objects with material AC, HP, damage threshold, cover, blocks movement                                                                                                                                                                                                                           | **Adapt**: props with a size, rotation and an optional cover note; no object combat stats                                                                                                                         |
| Notes        | "Add a note here", link to another map                                                                                                                                                                                                                                                           | **Keep**: DM notes; **Add**: events (pins that reveal, show and play)                                                                                                                                             |
| Audio        | Synthesized ambience (dungeon, cave, crypt, forest, rain, storm, campfire, tavern), uploaded tracks and YouTube, mixer, effects, soundscapes                                                                                                                                                     | **Adapt**: synthesized ambience and effects, uploaded tracks, played by the table screen. No YouTube                                                                                                              |
| Extras       | Dice, roll requests, casino, combat banners and animations, 3D dice, IR touch frame, Owlbear extension                                                                                                                                                                                           | **Skip** (dice are physical; banners belong to combat)                                                                                                                                                            |

No code, text or art was copied: the table is a list of behaviours. Labels and visuals are Rytta's.

## 3. Jobs to be done

| Role       | Job                                                                                  | Moment                 |
| ---------- | ------------------------------------------------------------------------------------ | ---------------------- |
| DM         | Get a map that fits the table: generate one, upload one, or a plain grid             | Prep                   |
| DM         | Make the grid match the table: one square under each miniature base                  | Setup, once per screen |
| DM         | Put enemies where they stand, hidden until they are seen                             | Prep and play          |
| DM         | Hide the unexplored map and reveal rooms as the party walks in                       | Play                   |
| DM         | Open, close, lock and discover doors                                                 | Play                   |
| DM         | Keep private notes on the map and fire prepared events (a trap, an ambush, a reveal) | Play                   |
| DM         | Read a story beat aloud while the table shows it                                     | Play                   |
| DM         | Set the mood with ambience and sounds without a second device                        | Play                   |
| DM, Player | Measure a distance or a range without counting squares                               | Every turn             |
| DM         | Show a spell area and know which creatures it catches                                | Every turn             |
| Player     | See the map on the phone when the table is far                                       | Always                 |
| Table      | Show the map at the calibrated scale, the party's view, whose turn it is             | Always                 |

## 4. Feature set

1. **Scenes (RYT-055)**: name, map source, grid (columns, rows, image cell size and offset), ground
   for a blank grid, fog switch and the generator recipe when it was generated. One scene per
   campaign is on the table; the others are prepared. Duplicate is out of scope; delete asks first.
2. **Grid calibration (RYT-055)**: the table screen knows its pixel size; the DM gives the
   diagonal in inches and the miniature base (25, 28 or 32 mm, or custom); Rytta computes the
   physical pixels per inch and the size of one square, and how many whole squares fit. A ruler
   of squares on the table lets the DM check one base and adjust ±10 %. The DM's editor frames
   what the table shows and moves that frame.
3. **Map sources (RYT-055)**: an uploaded image (WebP, PNG or JPEG, downscaled to 4096 px on the
   long side) with "squares across" and an offset to align its own grid; a blank grid on parchment,
   stone, grass, wood or sand; a generated map (RYT-056); a Universal VTT export from Dungeon Alchemist or Dungeondraft with
   its grid, doors and reveal areas (RYT-065).
4. **Map generator (RYT-056, v2 in RYT-063)**: seeded, deterministic, original algorithms that
   follow the [map doctrine](map-doctrine.md). Dungeon (rooms from a size wish list, A* passages, a
   spanning tree plus loops, an entrance by the edge, a goal far away, a hidden treasure, arches,
   closed, locked and secret doors, furniture by purpose), crypt (a pillared nave with mirrored
   chapels, or catacombs with tomb rooms and burial niches), cave (caverns as lobes joined by
   winding tunnels, one mouth, pools or an underground lake, each cavern a reveal area), forest
   (clearings with a purpose on a trail, a stream with a bridge, dart-thrown trees) and tavern
   (a hall with a bar, hearth, tables, side rooms and a cellar door). DM notes mark key rooms and,
   optionally, traps. Looks: ink on parchment (the
   field-journal identity) and painted. Options: size (the table, small 24 × 18, medium 32 × 24,
   large 48 × 32, custom up to 80 × 80), density, corridor width, secret doors, seed. The result is
   an image, its rooms (for fog) and items (doors and props), all editable afterwards.
5. **Tokens (RYT-057)**: place combatants of the live encounter or a draft (one, every enemy, the
   party), or a free token (label and colour). Size in squares from the creature size (Tiny shares
   a square, Large 2 × 2, Huge 3 × 3, Gargantuan 4 × 4). Hidden tokens are DM-only. The table shows
   the active turn, defeated creatures and the health band the combat projection already allows.
   Tokens of a draft stay off the table until the fight starts.
6. **Measure (RYT-058)**: drag or tap waypoints; each segment counts squares with the SRD rule
   (orthogonal or diagonal steps cost one square, 5 feet); the total and each segment read in feet
   and squares; snap to square centres; "show on the table" publishes the last measure.
7. **Areas of effect (RYT-058)**: sphere, cylinder (radius), cube (side), cone (length), line
   (length and width) and emanation (from a token). Rytta's grid convention, not an SRD rule: a
   square is in the area when its centre is. The tool lists the tokens caught; a lasting area
   stays on the map until removed. Shape names link to the glossary.
8. **Fog (RYT-059)**: off, or every square hidden; reveal or hide with a brush, a box or a room;
   reveal or hide all. The DM sees through it; the table and phones do not. Fog is a table
   convenience, not a secret: hidden content uses the hidden flag.
9. **Doors (RYT-059)**: on the edge between squares; closed, open or locked; a secret door is
   DM-only until discovered. Opening a door can reveal the room behind it.
10. **Notes and events (RYT-060)**: notes are private pins with a title and text. Events are pins
    with a trigger description and actions run together when the DM fires them: reveal a room or a
    radius, show hidden tokens nearby, show a story card, start an ambience or a sound. A fired
    event is marked and can be reset.
11. **Story cards (RYT-060)**: title, text to read aloud and an optional image. "Show on the table"
    puts one over the map on the table and on players' phones; "hide" removes it.
12. **Audio (RYT-061)**: synthesized ambiences (dungeon, cave, forest, rain, storm, campfire,
    tavern, sea) and effects (door, thunder, gong, swords, coins) made by Web Audio code, and
    uploaded tracks (MP3, OGG, M4A, WebM up to 20 MB). The table screen plays; the DM controls
    ambience, track, loop and volume from the editor and may also listen locally. Browsers start
    sound only after a tap, so the table asks for one.
13. **Props (RYT-062)**: a library of original vector props in the ink style (furniture,
    containers, dungeon dressing, nature, light sources, structures) placed, rotated, resized,
    hidden or locked. The generator uses the same library.

## 5. Visibility model

| Data                                  | DM          | Table screen                                     | Player phone               |
| ------------------------------------- | ----------- | ------------------------------------------------ | -------------------------- |
| Scene on the table: map, grid, ground | ✓           | ✓                                                | ✓ (module enabled)         |
| Prepared scenes                       | ✓           | —                                                | —                          |
| Fog                                   | translucent | opaque                                           | opaque                     |
| Tokens                                | ✓           | not hidden, not of a hidden combatant or a draft | same as table              |
| Token name                            | real        | alias for creatures under one                    | alias                      |
| Health band, active turn              | ✓           | from the combat projection                       | from the combat projection |
| Doors                                 | ✓           | not secret (or discovered)                       | same                       |
| Props                                 | ✓           | not hidden                                       | same                       |
| Notes, events                         | ✓           | —                                                | —                          |
| Story card                            | all         | the shown card only                              | the shown card only        |
| Audio                                 | library     | the current ambience and track                   | — (the table plays)        |
| Measure, areas, ping                  | ✓           | shared measure, lasting areas, ping              | same                       |

The table screen requests the projection with `as_table`, so a DM account on the table gets the
Player view without own data. Players read only while `tabletop` is among the campaign's player
modules (the glossary pattern); the DM always reads.

## 6. Screens

```
/tabletop                    DM: scene library (on the table, prepared), table setup, new scene
                             Player: the scene on the table, read-only, with fog
/tabletop/:sceneId           DM: the editor (board, tools, panels)
/tabletop-table              The table screen, without app chrome (route outside the layout)
```

**Editor.** The board fills the page under a compact header (scene name, "On the table" state or
"Put on the table", the live table link). A tool rail (select, measure, area, fog, door, note,
event, prop, ping) sits on the left on tablets and at the bottom on phones; the active tool's
options appear in a strip above the board. Panels open as a side sheet on tablets and a bottom
drawer on phones: Tokens, Props, Story, Audio, Scene (grid, map, fog). The table frame (the
rectangle the table shows) is drawn on the board and can be dragged. Two fingers pan and zoom in
every tool; one finger acts with the tool. Keyboard: tool letters, arrows move the selection one
square, Delete removes, H hides, Escape returns to select and closes menus.

**Table screen.** The map at the calibrated scale, centred on the table frame, with a thin status
corner (scene name, round and turn when a fight runs, connection state). A first-run card asks for
a tap (sound and full screen) and points to calibration. Story cards slide over the map with the
text set large for reading across the table. The screen keeps itself awake (Wake Lock) while open.

**Player view.** The same board read-only, fitted to the phone, pinch to zoom, measure locally.

## 7. Grid calibration maths

```
ppi        = hypot(screen px wide, screen px high) / diagonal in inches   (physical pixels)
square px  = base mm / 25.4 × ppi × fine adjustment (0.90–1.10)           (physical pixels)
css square = square px / devicePixelRatio                                 (on that screen)
columns    = floor(screen px wide / square px), rows likewise
```

A 55″ 3840 × 2160 TV has 80.1 ppi: a 25.4 mm base is 80 physical pixels and the table holds
47 × 26 whole squares. The table screen reads its own resolution (`screen.width × devicePixelRatio`)
and, when a DM account opens it, offers to save that resolution with the setup.

## 8. Map art direction

Two looks share one palette family with the app: **ink** (warm parchment ground, sepia ink walls
traced as one line, clusters of hatching hugging the walls with a light band, props as line
drawings with a light wash) and **painted** (flagstones, slabs or cave plates in low contrast, a
masonry rim and a soft shadow along the walls, colour props). Caves and round rooms curve; built
rooms keep right angles; trails and streams follow smooth centre lines (RYT-063). Painted maps
dress their walls in stone blocks with lit torches, and show props as painted sprites (RYT-064). Both draw from seeded
noise so a seed always gives the same map. Maps render at 64 px per square (capped at 4096 px)
and upload as WebP; rooms, doors and props are stored as data, not baked, so they stay editable
and can be hidden.

## 9. Non-goals

Dynamic lighting, vision and line of sight, walls that block vision, free drawing, dice, chat,
video maps, multi-floor scenes, player-moved tokens, an Owlbear Rodeo
extension and hardware touch frames. Each can return as its own ticket.
