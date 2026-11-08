# Generated sprite art for painted maps

RYT-066. Rytta's painted props were drawn in code (`src/features/tabletop/ui/sprites.ts`, RYT-064). The
author now paints them with ChatGPT image generation, by hand: Rytta cuts each picture, fits it to its
squares and keeps the drawn sprite as the fallback. The ink look keeps its line art and prints props
that only have a picture in sepia. RYT-068 imported all 211 pictures of the [catalogue](#catalogue):
91 props (439 pictures), 50 floors, 16 walls, 20 decal sheets and 17 effects
([ADR 033](decisions/033-map-art.md)). On 2026-11-08 a sprite audit sent 35 sheets back because they
were drawn from the front, from the side or at three quarters. The author generated them again, with
prompts that describe what each object shows from directly above. The same day the signpost, lantern
post and market stall sheets and the shards decals arrived.

## Catalogue

[`art/sprites/sprite-catalogue.xlsx`](../art/sprites/sprite-catalogue.xlsx) (and the same rows in
[`art/sprites/catalogue.csv`](../art/sprites/catalogue.csv)) has one row per picture: the prompt to
paste, the file name and the path to save it at, in the order to generate them. Both are written by
`python scripts/sprites/catalogue.py` from the data in that script; edit the script, not the files.

| Category | Rows | What it is                                                                                      | Used today                                 |
| -------- | ---- | ----------------------------------------------------------------------------------------------- | ------------------------------------------ |
| prop     | 108  | Sheets of 4 variants of one prop (2 sheets for the commonest): 42 library props and 48 new ones | The library and the generators (RYT-068)   |
| floor    | 50   | Seamless 4 × 4 square textures: stone, wood, earth, sand, grass, water, lava…                   | Floors of the map themes                   |
| wall     | 16   | Seamless textures of wall tops for the wall bands                                               | Walls of the map themes                    |
| decal    | 20   | Sheets of 9 scattered details: cracks, puddles, moss, leaves…                                   | Scattered over painted maps                |
| effect   | 17   | Seamless spell effects per damage type and magic circles, on black or white for blending        | Spell areas; magic circles as a 2 × 2 prop |

Priority 1 is what generated maps use today, 2 adds variety (floors, walls, effects), 3 is new props
that Rytta adds to its library and generators when they are imported. Within a priority the rows are
interleaved so floors and walls arrive early enough to try them on maps.

`python scripts/sprites/import_sheets.py` imports every picture saved at its path and marks it
imported in the catalogue (`--props` or `--art` for one half, `--inspect` to only report). Props on a
sheet are found by the layout's position (a 2 × 2 grid, a row of 4 or 3); shapes painted close
together are counted again unjoined, or cut by their share of the sheet. A sheet that came without
transparency, on a flat magenta or other plain background, is keyed out, and a faint veil behind the
props is lifted. Floors and walls become 512 px tiles with the wrap seam evened out; effects painted on
black or white get their transparency from it; decal sheets become 3 × 3 atlases. A row listed in
`REJECTED` in `catalogue.py` is skipped and shows `rejected` with the reason. The sources stay out of
git (`art/sprites/source/*/` is ignored); the shipped WebPs and the catalogue are committed.

## Rules

- **Who generates:** the author, by hand in the ChatGPT app. ChatGPT Plus does not include the API,
  which is billed separately, and OpenAI's terms forbid scripting the ChatGPT website. Nothing here
  automates ChatGPT.
- **Licence:** OpenAI's Terms of Use give the user ownership of the output, commercial use included.
  Purely generated pictures may not be protected by copyright, so others could reuse them. That is
  acceptable for props.
- **No borrowed style:** prompts never name an artist, studio, asset pack or product (Forgotten
  Adventures, Czepeku, Dungeon Alchemist, D&D Sync…). Never upload third-party art as a reference;
  only sheets made for Rytta.
- **Provenance:** ChatGPT writes a C2PA manifest into each downloaded PNG (software agent ChatGPT,
  `gpt-image`, trained algorithmic media). The sources under `art/sprites/source/` keep it; the WebPs
  Rytta ships are edited derivatives without metadata. Every imported sheet is in the
  [log](#provenance-log) below, and the [credits](#credits) name the shipped pictures.

## Conventions the pictures must follow

- **Strictly from above:** orthographic, camera pointing straight down. No legs, sides or perspective
  visible. A three-quarter or isometric view is the most common failure; generate it again.
- **Footprints in 5 ft squares:** sizes come from the prop library (`src/features/tabletop/domain/props.ts`).
  Every object on a sheet is painted at the same scale per square.
- **Orientation:** a prop against a wall has its back to the top edge, and its front faces the bottom
  edge. The board turns it to fit the room. That covers the bookshelf, hearth, chair backrest, bed pillow,
  bar tap end and chest lock.
- **Light from overhead, soft:** turned props then still look right. Directional highlights would point
  the wrong way after a 90° turn.
- **Flames from above:** a bright core with embers, never upright tongues of fire, which players on the
  far side of the table would see upside down.
- **Real size in the square:** a chair takes about half a square, a table almost all of it. The
  catalogue's prompts say the share for each prop, and the import fits it to that share.
- **No shadow, no glow outside the object:** Rytta adds one soft contact shadow, centred so it stays
  right when the board turns the prop, and the warm halo of light sources itself, so all props match.
- **Readable on a TV:** a square is about 2.5 cm and 70 px under miniatures. Ask for bold shapes, a
  thin dark outline and moderate detail.
- **Transparent background:** a real alpha channel, not a painted checkerboard.

## Style block

Every prompt below already includes this block. For new sheets, paste it unchanged:

```text
Style: hand-painted digital art for a fantasy virtual tabletop battle map, soft painterly brushwork,
slightly desaturated warm palette (oak brown, dark iron grey, cream linen, muted red, ochre, moss green,
slate blue). A thin dark-brown outline around every object so it stays readable when small. Bold simple
shapes and clear silhouettes, moderate detail, no tiny clutter. Soft light from directly overhead with
gentle shading toward the edges. No cast shadows, no drop shadows and no glow or light spilling outside
the objects. No text, letters, runes, numbers, labels, watermark, signature, people or animals.
View: strictly top-down orthographic, the camera pointing straight down; no perspective, no isometric or
three-quarter angle, no visible legs or sides.
Background: fully transparent PNG with a real alpha channel. No floor, no ground texture, no grid, no
cells, no frames.
```

## Pilot: tavern

Generate both sheets in the same ChatGPT conversation. Download each picture with ChatGPT's download
button (not a screenshot) and save it in `art/sprites/source/` with the file name given.

### Sheet 1: `tavern-small.png`, nine props of one square

```text
Create a square (1:1) sprite sheet of 9 props for a fantasy tavern, for a tabletop RPG battle map.

Layout: a 3 by 3 arrangement. Each prop sits alone in the middle of its own third of the image, all at
the same scale, each the size of one 5-foot floor square, with wide empty space around it. Nothing
touches, overlaps or crosses into its neighbour's space. Do not draw the grid.

Top row, left to right:
1. A square wooden table with rounded corners; on it a pewter mug and a clay plate with bread.
2. The same table with a lit candle in a brass holder and a folded cloth.
3. A wooden chair: square seat, the backrest along the top edge.
Middle row, left to right:
4. An upright oak barrel seen from above: round lid, iron hoops, a wooden bung.
5. A wooden crate: plank lid and corner battens.
6. A tied burlap sack of grain, slightly slumped.
Bottom row, left to right:
7. An iron-banded wooden chest, lid closed, a brass lock on its bottom edge.
8. A bookshelf against a wall: a narrow dark-wood shelf along the top edge of its square, the tops of
   colourful books along its front; the bottom half of the square stays empty.
9. Three lit wax candles of different heights on a small iron dish.

Style: hand-painted digital art for a fantasy virtual tabletop battle map, soft painterly brushwork,
slightly desaturated warm palette (oak brown, dark iron grey, cream linen, muted red, ochre, moss green,
slate blue). A thin dark-brown outline around every object so it stays readable when small. Bold simple
shapes and clear silhouettes, moderate detail, no tiny clutter. Soft light from directly overhead with
gentle shading toward the edges. No cast shadows, no drop shadows and no glow or light spilling outside
the objects. No text, letters, runes, numbers, labels, watermark, signature, people or animals.
View: strictly top-down orthographic, the camera pointing straight down; no perspective, no isometric or
three-quarter angle, no visible legs or sides.
Background: fully transparent PNG with a real alpha channel. No floor, no ground texture, no grid, no
cells, no frames.
```

### Sheet 2: `tavern-large.png`, four larger props

Send it in the same conversation once sheet 1 is accepted. If you start a new conversation, attach
`tavern-small.png` first.

```text
Now create a landscape (3:2) sprite sheet of 4 larger tavern props in exactly the same style, palette,
outline weight, lighting and scale per square as the sheet of 9 props above. One 5-foot square is about
a quarter of the image height. Leave wide empty space between the props; nothing touches.

Left to right:
1. On the left, a bar counter standing vertically, 1 square wide and 3 squares long: a dark wood rim, a
   worn wooden top, a few tankards along it, and a beer tap block with a brass spigot at the top end.
2. Next to it, a single bed standing vertically, 1 square wide and 2 squares long: a wooden frame, a
   white pillow at the top end, a red wool blanket folded back just below the pillow.
3. On the right, at the top: a square woven rug, 2 by 2 squares, flat on the floor, deep red with an
   ochre border and a simple geometric medallion.
4. On the right, below the rug: a stone hearth against a wall, 2 squares wide and 1 square deep: the
   back of the fireplace along the top edge, burning logs and embers inside, a stone apron along the
   bottom edge.

Style: hand-painted digital art for a fantasy virtual tabletop battle map, soft painterly brushwork,
slightly desaturated warm palette (oak brown, dark iron grey, cream linen, muted red, ochre, moss green,
slate blue). A thin dark-brown outline around every object so it stays readable when small. Bold simple
shapes and clear silhouettes, moderate detail, no tiny clutter. Soft light from directly overhead with
gentle shading toward the edges. No cast shadows, no drop shadows and no glow or light spilling outside
the objects. No text, letters, runes, numbers, labels, watermark, signature, people or animals.
View: strictly top-down orthographic, the camera pointing straight down; no perspective, no isometric or
three-quarter angle, no visible legs or sides.
Background: fully transparent PNG with a real alpha channel. No floor, no ground texture, no grid, no
cells, no frames.
```

### Accept or generate again

Check each sheet before moving on:

1. Every prop is seen straight from above, with no legs or sides showing.
2. The count and order match the prompt, each prop stands apart, and there is no text.
3. The background is really transparent (see below).
4. Zoomed out until a square is about the size of a fingertip, each prop still reads.
5. The scale holds: the chair is smaller than the table, the barrel fills its square.

Corrections to send in the same conversation:

- A three-quarter view: `Redo it strictly from directly above, orthographic, with no sides or legs visible.`
- A painted checkerboard instead of transparency: `The background is a drawn checkerboard. Make it truly transparent (alpha channel).`
- If transparency keeps failing: `Use a flat, uniform pure magenta (#FF00FF) background with no texture or gradient.` The import removes it.
- One bad prop: name it by its number and ask to redraw only that one, keeping the rest unchanged.

## What Rytta does with the files

1. `import_sheets.py` finds each prop on its sheet by the layout's position, trims and cleans it, fits it
   to its share of its footprint (wall props on the back edge), adds the contact shadow and the halo of
   light sources (stopped at the wall behind wall props) and saves it as WebP at 192 px a square.
2. `propSprite` returns a picture when one exists for the prop's size or its proportions, and the drawn
   sprite otherwise. The item id picks the picture, whether it is mirrored and, for square props without
   a front, a quarter turn, so the same picture is not lined up twice.
3. The board decodes a painted map's pictures before showing them, so props appear together on the
   table's first load; a picture that fails to load falls back to the drawn sprite.
4. The pilot render ([tavern](evidence/RYT-066/tavern-pictures-42.png)) is compared with the drawn one
   ([RYT-064](evidence/RYT-064/tavern-painted-42.png)) in the [RYT-066 verification](evidence/RYT-066/validation.md).

## Provenance log

| Sheet            | File                                  | Date       | Model                       | Prompt        | Notes                                                                                                                                                                              |
| ---------------- | ------------------------------------- | ---------- | --------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tavern, 1 square | `art/sprites/source/tavern-small.png` | 2026-11-06 | ChatGPT, `gpt-image` (C2PA) | Sheet 1 above | Imported: 6 props, 1254 × 1254, real transparency. Not used: the candle table and the candles (flames from the side) and the chest (reads as a barrel); they keep the drawn sprite |
| Tavern, large    | `art/sprites/source/tavern-large.png` | 2026-11-06 | ChatGPT, `gpt-image` (C2PA) | Sheet 2 above | Imported: 3 props, 1536 × 1024. Not used: the hearth (fire drawn from the front)                                                                                                   |

Later sheets are logged by their catalogue row: the import marks them imported, and the C2PA
manifest in each source keeps its date and model. The pictures of RYT-068 were saved by the author
between 2026-11-06 and 2026-11-08 (ChatGPT, `gpt-image`). The 35 sheets of the 2026-11-08 audit and the
four last sheets replaced or completed them on 2026-11-08.

## Credits

The pictures under `public/tabletop/props/`, `public/tabletop/textures/` and
`public/tabletop/decals/` were made by the Rytta author with ChatGPT image generation (OpenAI,
`gpt-image`), from the prompts of this guide and of the catalogue, and edited by
`scripts/sprites/import_sheets.py`. Under OpenAI's Terms of Use the output belongs to the author.
