# ADR 033: painted map art, themes and an untextured outside

Date: 2026-11-07. Status: accepted for `RYT-068`. Builds on ADR 032 (tabletop) and the sprite art
of `RYT-066` ([sprite art](../sprite-art.md)).

## Context

The author generated 208 of the 211 pictures of the sprite catalogue with ChatGPT: props, floors,
walls, decals and spell effects. Three prop sheets (signpost, lantern post, market stall) are still
missing and one decal sheet (shards) came out as a copy of another. The painted look drew its floors,
walls and trees in code, so maps of the same kind looked alike, and the rock outside underground
maps was mottled like a texture. The user asked for the import, for maps that are beautiful and useful
for players and DM, and for the outside of a map to be left untextured, like D&D Sync's dark
ground, or plain black.

## Decision

- **One import for all art.** `scripts/sprites/import_sheets.py` turns every saved picture into
  what Rytta ships: props fitted to their squares (`public/tabletop/props`), floor and wall tiles of
  4 × 4 squares at 512 px with the wrap seam evened out (`public/tabletop/textures`), effect tiles with
  transparency taken from their black or white background, and decal sheets cut into 3 × 3 atlases
  (`public/tabletop/decals`). It writes the lists the app reads (`prop-pictures.ts`, `map-art.ts`)
  and marks the catalogue. Rejected pictures are listed in the catalogue with the reason. The sources
  (about 430 MB) stay out of git.
- **Themes.** A map has a kind and a theme: dungeon (stone, ruins, temple, sandstone, dwarf hold,
  ice, lava), crypt (vault, moss, marble), cave (rock, damp, crystal, ice, lava), forest (summer,
  autumn, meadow, swamp, winter) and tavern (oak, walnut, winter). The theme is stored in the recipe
  (generator v3; v2 recipes read as the default theme). It picks the materials (`materials.ts`) and
  part of the furniture and plants.
- **Rooms by purpose.** Dungeon rooms get purposes that use the new props (armoury, forge, kitchen,
  prison, study, training ground, throne room, hoard) and a floor that says what they are (a
  library's parquet, a kitchen's flags), chosen per theme.
- **Textured painting.** The painted look fills each room with its tile (own offset and quarter
  turn), blends a worn tile in soft noise patches, scatters decals, darkens along the walls, lights
  torches, quiets loud floors and draws walls as a band of wall tile. Caves have no band: the wall
  rock fades into the dark within about a square. Forests plant tree pictures with drop shadows.
  Without the tiles (offline, or a failed load) the drawn painted look of RYT-064 is used.
- **The outside is not textured.** Underground maps paint the rock outside as a near-black ground
  with faint clouds and specks, tinted by theme (cold blue for ice, embers for lava). Nothing that
  nobody walks on competes with the map.
- **Useful at the table.** Stored maps are painted at up to 96 px a square (at most 4096 px a side
  and 16 million pixels, the tablet canvas limit). A revealed room shows 0.4 of a square past its
  squares, so its walls appear with it; secret doors are painted as the room's wall continuing across
  the doorway, past that margin. Spell areas fill with the damage type's painted effect. Ink maps
  print props that only have a picture in sepia.

## Consequences

- About 16 MB of WebP under `public/tabletop` (props 9.6 MB, tiles and decals 7 MB). A scene loads
  only the pictures its props use; the generator loads one theme's tiles (about 0.5 MB) when chosen.
- Old scenes keep their stored map; new seeds lay out differently from v2 because rooms have new
  purposes.
- The importer is pure Pillow and slow (about 18 minutes for the whole catalogue); it runs only when
  the author adds pictures.
- The signpost, lantern post and market stall were drawn by Rytta until their sheets arrived on
  2026-11-08; the drawings remain as the fallback and as the ink look. On the same day an audit of
  every picture sent 35 sheets back for not being strictly top-down. The catalogue's prompts now
  describe what each object shows from directly above, and its View line forbids front faces.
  Taverns and ruins scatter the new shards decals.
- A passage behind a secret door is painted as a dead end that starts past the margin a revealed
  room shows, so the room's wall never gives the door away. The passage square just behind the door
  belongs to no reveal area: revealing the passage shows its dead end and stops short of the door
  (its margin and the fog's blur reach about 0.7 of a square). Once both sides are revealed, the DM's
  room reveal also reveals that square, so tokens crossing it stay in view. The table never learns
  where the door is.
