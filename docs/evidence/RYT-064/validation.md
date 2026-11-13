# RYT-064–065 verification: painted sprites, dressed maps and Universal VTT import

Delivery of 2026-11-05 on top of RYT-055–063 (uncommitted on `main`, base 8a862ac). ADR 032 addendum
"painted props and Universal VTT import"; research in [research](../../research.md).

## What changed

- **Sprites** (`src/features/tabletop/ui/sprites.ts`): every library prop drawn by Rytta on a canvas
  at 96 px a square with shadow, top-left light and variants; light sources carry a warm halo; a
  shared `crown` drawer for trees and bushes. Cached as image URLs per prop, size and variant.
- **Where they show** (`board.tsx`, `generator-dialog.tsx`, `palette.ts` `paintedScene`): painted
  generated scenes, uploads and coloured-ground grids; ink scenes and parchment grids keep the line art.
  Props keep their box as the tap target; halos do not catch taps. Painted doors gain stone jambs.
- **Painter** (`painter.ts`): stone-block walls outside the floor (a tiled pattern), rings of curved
  stones in round rooms, wall torches with light, cobwebs in corners, cracks, puddles, a rim of loose
  stones in caves, textured crowns, grass tufts and trail fringes, stone tavern walls. Standing stones
  in forests use boulders. The generator opens in the painted look.
- **Universal VTT** (`src/features/tabletop/domain/uvtt.ts`, `library.tsx`): `.dd2vtt`, `.uvtt` and
  `.df2vtt` files from Dungeon Alchemist and Dungeondraft. The picture is decoded and fitted, the
  grid comes from the file, closed portals become doors, walls and portals split the floor into fog
  areas, and doors name the areas on both sides. The preview shows the grid and the doors. Picture
  names such as `Crypt_30x20` set the grid of plain uploads.

## Renders

Painted maps at 40 px a square, 30 × 20, with props drawn as the board draws them and a faint grid:
[dungeon](dungeon-painted-42.png), [crypt](crypt-painted-7.png), [cave](cave-painted-1.png),
[forest](forest-painted-4242.png), [tavern](tavern-painted-42.png); every sprite: [sprites](sprites.png).

## Checks

- `npm run check`: typecheck, lint, architecture, docs contracts, 298 unit and SQL tests
  (42 files; `uvtt.test.ts` new), build — passed.
- `RYT_EVIDENCE=1 RYT_CAPTURE=1 npx playwright test tests/e2e/tabletop.spec.ts` on identity-desktop,
  identity-tablet and identity-mobile: 18 passed, including the new Dungeon Alchemist import
  (summary, no alignment fields, scene with 3 areas and a door joining two of them).
- Map renders of every kind in the painted look with sprites drawn over them, and a sheet of all 42
  sprites, checked in a browser.
- No database change: doors, rooms and props use the existing contracts.

Untested: a real Dungeon Alchemist export (the format follows Dungeondraft's published fields; the
e2e builds an equivalent file), very large exports near 120 squares a side, iOS Safari decoding.

## design critique and audit (2026-11-05)

Method: two independent reviews (A design review, B detector and technical audit). Detector:
no findings (exit 0). A scored 26/40; B scored 15/20 on the audit. Fixed:

| Finding | Fix |
| --- | --- |
| P1 Floor joints as dark as the grid; dungeon courses fell on grid lines; crypt slabs drew a second grid | Large flagstones in courses of 0.83 (dungeon) and 1.17 (crypt) squares from an offset of 0.37, joints half as wide, mortar within a few percent of the stone |
| P1 Long props turned 90°/270° drawn outside their box (every tavern hearth); scale reset a turned prop | The footprint stays; the drawing keeps its natural size and is centred (board and preview); scaling keeps the turned footprint |
| P2 Torch light leaked through walls and out of buildings | Torch light painted on the floor under the walls, clipped to it, without additive blending; sprite halos smaller and gentler, the torch halo on its flame |
| P2 Walls read as a bead chain; cave rim as a string of pearls | A 4 × 1 square masonry tile of four courses with blocks 0.3–0.8 long, sharper corners, top light and bottom shade, a 0.6 square band; cave rims as clusters of 3–6 stones with gaps and the odd boulder |
| P2 About ten sprites misread | Statue, weapon rack, altar, bones, candles, torch, brazier, stalagmite, tent and bar redrawn; urn handles, thicker webs, a mug with a handle, three rug motifs |
| P2 Universal VTT: Rytta doors over the picture's own doors; areas not shown; furniture carving areas | Doors on uploaded maps are the DM's dashed handles only (the table sees the picture); the preview tints each area with its number; walls, doors and windows split areas (furniture sight lines do not); windows and lights are said not to be imported |
| P2 Oversize files processed before being refused; unbounded arrays | Size checked first (4–120 a side), file and array limits in the schema |
| P2 45° walls stranded squares; areas dropped silently; no progress | Crossing tests off the exact centre (a 20 × 20 diagonal map covers all 400 squares); biggest areas kept first and the dropped count shown; a reading state, stale picks ignored, the summary announced |
| P2 Sprite cache duplicates | Only drawers that use the variant are cached per variant |
| P3 Grid from width ÷ squares; rooms payload over the save limit after upload; masonry seam; dead code | Square size from the file's pixels per grid; a too-detailed scene is refused before upload; whole bricks inside the tile; the unreachable forest branch removed |
| P3 Doors thin and unlike the walls | Painted doors 0.38 thick with planks and iron bands between jambs as deep as the wall |

Left as P3 follow-ups: generating sprites off the main thread or when idle, a shared door glyph for
the previews, standing-stone and flower sprites with more presence, preview colours that match the
created scene (preview by index, board by item id), and a real Dungeon Alchemist file in the tests.

Checks after the fixes: `npm run check` passed (299 tests, build); tabletop e2e 18 passed on desktop,
tablet and mobile.

## Independent UI review, round 1 fixes

Round 1 (CHANGES_REQUIRED, report) found ink maps drawn painted on
the table and phones (the projection had no recipe), unreadable area numbers in the import preview,
focus lost while a file was read, and the browser's focus outline swelling to several squares when an
item was tapped. Fixed:

- **Migration `20261111140000_tabletop_look.sql`:** `private.tabletop_scene_json` adds `look` (ink or
  painted, else null) for every view; the recipe and rooms stay DM-only. PGlite test: the table view has
  `look: 'ink'` and no seed. Hosted: applied to PRE first (remapped DDL; checked on its two scenes: the
  generated one projects `painted`, no recipe or rooms in the table view), then to production as
  `tabletop_look` (function updated, not executable by anon or authenticated, `get_tabletop` for
  authenticated only, 0 scenes). `paintedScene` reads the recipe or the projected look.
- Area numbers sized to the picture with a dark outline; the picker stays focusable while it reads
  (busy, a loader, not disabled) and a lasting live region announces the result; item focus outlines off
  (items draw their own ring in squares); a failed pick clears the previous one; counts without zeros
  ("sin puertas", only the windows or lights that exist); the scrolling preview is a focusable region;
  design-system.md describes upload door handles and the import preview.

Checks: `npm run check` passed (299 tests, build); tabletop e2e 18 passed on desktop, tablet and mobile.

Round 2: **PASS** for fingerprint `2d35a5e4ff32786619c6f11f699826f69f3e01f723f8245f76b709050e3ada4b`
(report). Open P3s (not blocking): area numbers can overlap on very
dense maps (cap them to their area), the scene name keeps the first file's name when another file is
picked, Spanish agreement in the import announcement and summary ("1 puertas", "1 áreas", "1 área …
tomadas", "No se importan 1 ventana"), plain picture uploads are not announced, plus the design review P3s
above. Untested: iOS Safari, screen readers, a real Dungeon Alchemist export, 200% text.
