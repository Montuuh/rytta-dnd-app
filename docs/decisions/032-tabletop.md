# ADR 032: a table-first tabletop built into Rytta

Date: 2026-11-05. Status: proposed for `RYT-055` to `RYT-062`. Revises the product non-goal "Full
VTT, battle-map renderer" ([product](../product.md)). Builds on ADR 024 (combat), ADR 027 (combat
art), ADR 028 (bestiary) and ADR 030 (bestiary art). Design analysis:
[tabletop design](../tabletop-design.md).

## Context

The user asked for a tabletop in Rytta: a map generator (random or from an upload) whose grid
matches the screen and the miniatures, and DM tools for enemies, areas of effect, story, audio,
doors, notes, events, fog, props and, above all, measuring distances. D&D Sync's Tabletop was
reviewed in the browser with the user's account (see [research](../research.md)). Owlbear Rodeo was
evaluated as the alternative.

Rytta's table is in person: a screen lies on the table under physical miniatures, the DM drives from
a tablet or phone and players carry phones. Owlbear is an online VTT whose data, fog and tokens live
in its rooms; an extension would run inside Owlbear's page and could not calibrate the table screen,
read Rytta's combat or follow its RLS. Building on Owlbear would mean two products at the table.

## Decision

- **Own tabletop, table first.** Rytta adds a `tabletop` feature and campaign module: scenes with a
  map and grid, a DM editor, a chrome-less table screen and a read-only Player view. It is not a
  remote-play VTT: no dynamic lighting, vision, line of sight, wall blocking, drawing, dice, chat or
  player-moved tokens (non-goals in the design analysis).
- **No rendering dependency.** The board is a CSS-transformed world in square units: the map image
  (or a ground pattern), one SVG overlay for grid, doors, props, areas, measures and pings, tokens as
  positioned DOM elements (focusable buttons for the DM, with names) and an SVG mask for fog. A few
  hundred items stay fast without WebGL, and the DOM keeps keyboard, focus and screen-reader support
  that a canvas would lose. Map generation draws once on a 2D canvas.
- **Calibration.** One square equals one miniature base. The setup stores the table screen's
  diagonal, its resolution in physical pixels (reported by the table screen itself), the base in
  millimetres and a fine adjustment. Square size = base ÷ 25.4 × hypot(px) ÷ diagonal × adjustment;
  each screen divides by its own `devicePixelRatio`. The generator's "table" size and the editor's
  table frame use the whole squares that fit.
- **Data (RYT-055 migration).** `tabletop_scenes` (map, grid, ground, fog, rooms, generator recipe,
  revision), `tabletop_items` (tokens, props, doors, notes, events and areas in square units, with
  public `data`, DM-only `secret`, `hidden` and optional links to an encounter combatant or a
  character), `tabletop_cards` (story cards), `tabletop_tracks` (uploaded audio) and `tabletop_live`
  (one secret-free row per campaign: the scene on the table, the table frame, the shown card, audio,
  last ping, shared measure and the screen setup). Tables are read-only through the Data API; RPCs
  write, lock the campaign row and replay request ids (`private.tabletop_requests`).
- **Projection.** `get_tabletop(campaign, scene, as_table)` returns everything to a DM editing a
  scene. Players, and anyone with `as_table`, get only the scene on the table: no notes, events,
  hidden items, undiscovered secret doors, tokens of hidden combatants or of draft encounters, item
  secrets or prepared scenes; creatures under an alias show the alias and no art. Players read only
  while `tabletop` is a player module (the glossary rule); the DM always reads.
- **Realtime.** `tabletop_live` joins the realtime publication. Any change to the scene on the table
  (scene, items, fog), to the live row or to a card on show bumps its revision, so subscribers
  refetch the projection; polling and reconnect refetch remain. The table screen also follows the
  combat channel for turns and health bands.
- **Media.** One private bucket, `tabletop-media` (20 MB, WebP/PNG/JPEG and MP3/OGG/M4A/WebM), with
  paths `{public|pre}/{campaign}/{map|card|audio}/{uuid}.{ext}`. The campaign DM reads, uploads and
  deletes; members read the map of the scene on the table, the image of the shown card and the
  current track. Generated maps are rendered in the browser at 64 px per square (at most 4096 px) and
  uploaded as WebP; their rooms, doors and props stay data so they remain editable.
- **Rules.** Measuring follows SRD 5.2.1 "Playing on a Grid": 5 feet per square and one square per
  orthogonal or diagonal step, so a segment costs max(|dx|, |dy|) squares. Token sizes follow
  "Creature Size and Space". Areas use the SRD shapes; which squares an area covers is a Rytta table
  convention (a square counts when its centre is inside), shown as such.
- **Original content.** Generator algorithms, map looks, the prop library and every ambience and
  effect (Web Audio synthesis) are Rytta's own code. Uploaded maps, images and tracks belong to the
  campaign and are never bundled.

## Consequences

- The product brief's non-goal narrows to "remote-play VTT features"; the combat table display
  remains the combat screen, and the tabletop screen shows the fight's turn on the map.
- New migration with denial tests for anon, outsider, Player (module off and on) and a DM of another
  campaign, a PRE mirror and a storage router; hosted PRE is exercised before production.
- Bundle: the tabletop is a lazy route; the generator and audio engine load with the editor only.
- Fog hides the map from view, not from a determined player with the network inspector: the map
  image is one file. Secret content uses the hidden flag, which never leaves the database.
- Storage use grows with uploaded maps and tracks; the free tier (1 GB) is shared with portraits and
  item images. The library lists sizes so the DM can delete what is not used.

## Addendum: generator v2 and a full-width section (RYT-063, 2026-11-05)

- **Where D&D Sync's maps come from.** Its static assets show its own generator ("Dynamic Dungeons",
  `vtt/dungeon.js` plus `env-*` modules, about 700 KB of hand-written code) built from public
  techniques: a seeded PRNG, rooms from a size wish list, a spanning tree plus loops, A* passages
  with a turn penalty, cellular-automata caves, contour tracing with smoothing, furniture by room
  kind, traps and notes on separate seed streams, and a print-like "parchment" look after Watabou's
  One Page Dungeon. No code was read for reuse or copied; only module headers were reviewed to
  name the techniques.
- **Generator v2 is Rytta's own implementation of those public techniques** and follows the
  [map doctrine](../map-doctrine.md): rooms by size, packed close; passages found with A*; loops
  that join distant parts; an entrance by the edge, a goal farthest by walking, treasure in a dead
  end; arches, closed, locked and secret doors; furniture by purpose; catacomb niches; caverns as
  lobes joined by winding tunnels with one mouth; forests with clearings on a trail, a stream and
  dart-thrown trees. Variants (nave or catacomb crypts, caverns or a lake, a stream or deep woods)
  are drawn from their own stream, as are traps, so options never move the layout.
- **Passages and notes are data.** Passages become reveal areas (`pass-N`), numbered apart from
  rooms; a door reveals its room and its passage. Key rooms, places and optional traps become DM
  notes written in the DM's language when the scene is made. Secret doors are painted as wall.
- **Painter v2.** Walls are one traced outline (contour tracing on square corners, relaxation and
  corner cutting on soft corners only), so caves and round rooms curve and built rooms keep right
  angles. Ink maps hatch the rock in clusters along the walls with a light band; painted maps lay
  flagstones, slabs or cave plates in batched paths. Trails and streams are stroked along their
  centre lines. `generatorVersion` is 2: saved scenes keep their stored picture.
- **Full width.** The DM's tabletop (library and editor) is the one section whose main area spans
  the window on screens from 48em; the header and navigation keep the shell's measure.

## Addendum: painted props and Universal VTT import (RYT-064, RYT-065, 2026-11-05)

- **Own painted sprites, no downloaded packs.** Painted maps (generated in the painted look, uploads
  and blank grids on a coloured ground) show props as painted sprites that Rytta draws on a 2D
  canvas at 96 px a square: drop shadow, light from the top left, a warm halo past the square for
  braziers, torches, candles, campfires and hearths, and a few variants per prop chosen from the
  item id. Ink maps and parchment grids keep the line art. Popular painted asset packs are licensed
  for use in one's own maps, not for redistribution inside an app, and the free CC0 packs at hand are
  pixel or flat art that does not match a painted battle map, so nothing was downloaded. The props
  stay items: the DM can still move, hide and remove them.
- **Dressed painted maps.** The painter adds what D&D Sync's painted look taught: thick walls of
  dressed stone (a tiled block pattern outside the floor), rings of curved stones in round rooms,
  torches in brackets with their light, cobwebs in corners, cracks and puddles, a rim of loose stones
  inside caverns, textured tree crowns, grass tufts and trail fringes, stone walls for taverns.
  Painted is now the generator's default look.
- **Universal VTT import reverses a non-goal.** The upload accepts `.dd2vtt`, `.uvtt` and `.df2vtt`
  files (Dungeon Alchemist, Dungeondraft, DungeonFog). The picture inside is decoded and fitted like
  any upload; the grid comes from the file; closed portals become door items; walls, doors and
  windows split the floor into reveal areas (squares joined without crossing a barrier, two squares
  or more), and each door names the areas on its two sides. Lights are already painted into the
  picture and are not kept. Nothing leaves the browser except the fitted picture and scene data.

## Alternatives

- **Owlbear Rodeo with an extension:** rejected for the reasons above; a bridge stays possible.
- **PixiJS or Konva:** faster for thousands of sprites and lighting, which Rytta does not need, at the
  cost of a canvas without accessibility and a new dependency. Revisit if dynamic lighting returns.
- **Regenerating maps from the seed on every device:** no storage, but every change to the
  generator would alter saved maps. Rytta keeps the recipe for "generate again" and stores the image.
