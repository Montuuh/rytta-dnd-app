# RYT-066 verification: painted props from generated art, and the sprite catalogue

Delivery of 2026-11-06 on top of RYT-055–065 (uncommitted on `main`, base 8a862ac). Guide and rules in
[generated sprite art](../../sprite-art.md).

## What changed

- **Pilot pictures:** two sheets the author made with ChatGPT (`gpt-image`, C2PA in the sources under
  `art/sprites/source/`) give 9 tavern props: table, chair, barrel, crate, sack, bookshelf, bar (rebuilt
  for 1 × 2 to 1 × 5), bed and rug. 12 WebPs, 236 KB, in `public/tabletop/props/`. The candle table,
  candles and hearth (flames drawn from the side) and the chest (reads as a barrel) are not used after
  the UI review; they keep the drawn sprite until their catalogue sheets arrive.
- **Import** (`scripts/sprites/import_sheets.py`): finds each prop by its layout position, cleans the
  edge (and keys out a flat background), fits it to its real share of its squares (wall props on the back
  edge), adds a centred contact shadow and, for light sources, a dithered halo that stops at the wall
  behind wall props; writes `prop-pictures.ts` formatted, and the catalogue with the sheets imported.
- **Board** (`sprites.ts`, `board.tsx`, `generator-dialog.tsx`): `propSprite` uses a picture for the
  prop's size or proportions, else the drawn sprite. The item id (now 0–59, even over 1–6 pictures)
  picks the picture, a mirror image and, for square props without a front, a quarter turn. Pictures are
  decoded before they show, so a map's props appear together; a picture that fails falls back to the
  drawn sprite. Drawn sprites' shadows are centred too, so both kinds match on one map.
- **Orientation:** wall props on east and west walls (dungeon `wallRotation`), tavern chairs and the
  hall hearth, and dungeon library chairs turned the wrong way; all fixed (rotation 0 = back north,
  clockwise), with tests over 40 seeds that fail on the old values.
- **Catalogue** (`scripts/sprites/catalogue.py` → `art/sprites/catalogue.csv` and
  `art/sprites/sprite-catalogue.xlsx`): 211 rows, each the prompt, file name and path of one picture:
  108 prop sheets (42 library props, 48 new), 50 floors, 16 walls, 20 decal sheets, 17 effects.

## Renders

Painted maps at 40 px a square with the board's variant rules: [tavern](tavern-pictures-42.png) (before:
[RYT-064](../RYT-064/tavern-painted-42.png)), [tavern detail at 80 px](tavern-pictures-detail.png),
[dungeon](dungeon-pictures-42.png) (generated pictures beside drawn sprites); every shipped picture:
[pictures](pictures.png).

## design critique and audit (2026-11-06)

Method: two independent reviews (A design review, B detector and technical audit). Detector:
no findings (exit 0; regex rules only, the app needs a sign-in for URL rules). A scored 26/40
(renormalised from 13/20 on five applicable heuristics); B scored 16/20.

| Finding | Fix |
| --- | --- |
| P1 Dungeon library chairs back to front (916 of 916, B) | Turned 270/90; the chair test covers taverns and dungeons |
| P1 Provenance log pending, no credits (B) | Log filled from the C2PA manifests; credits section; sources keep C2PA, WebPs carry none |
| P1 Variety fell: clone tables, beds, crates; variants 0–1 twice as likely (A) | Variant 0–59; mirror and quarter turns from the item id; content variants (blanket colours, table settings, crate states) in the catalogue's prop sheets |
| P1 Two styles on one map (A) | Catalogue orders the tavern and dungeon sets first; drawn sprites stay the fallback until each picture exists |
| P2 Chair as big as the table (A) | Real shares per prop (chair 0.6, barrel 0.75, sack 0.65, chest 0.75…), said in each prompt |
| P2 Offset shadow turns with the prop (A) | Centred contact shadow for pictures and drawn sprites |
| P2 Flames, candles and tap drawn from the side (A) | The style block asks for flames from above; hearth and candles are rows to regenerate |
| P2 No decode step; a failed picture leaves an invisible prop (B) | Pictures decoded before they show; `onError` falls back to the drawn sprite; e2e checks every picture returns 200 and shows |
| P2 Generated list fails Prettier (B) | The import runs Prettier on it |
| P2 Magenta fallback promised, not implemented (B) | A sheet without transparency is keyed out from its corners' colour, with despill |
| P2 Orientation tests could pass checking nothing (B) | 40 seeds and a minimum count per map kind |
| P2 design-system.md silent on pictures (B) | Tabletop paragraph updated |
| P3 Halo bands and spills past the wall (A, B) | Dithered; cut at the back edge of wall props |
| P3 Bar seams at 4–5 squares (A) | Wider blends |

Left: the generator preview picks variants by list position while the board uses the item id (the
created items get their ids on the server), props resized to proportions without a picture use the drawn
sprite, the bookshelf reads thin until its catalogue sheet arrives, and the
generator's table spacing puts chairs back to back.

## Checks

- `npm run check`: typecheck, lint, architecture, docs contracts, 305 unit and SQL tests
  (`sprites.test.ts` and the orientation tests new), build — passed.
- `RYT_CAPTURE=1 npx playwright test tests/e2e/tabletop.spec.ts` on identity-desktop, identity-tablet and
  identity-mobile: 18 passed, including the new picture assertions.
- Import re-run deterministic (B: 24 WebPs identical byte for byte before this round's changes).

Untested: a real TV, Safari and Firefox decoding, GitHub Pages cache headers, pan and zoom with
hundreds of pictures, a sheet on a magenta background (the key-out has no fixture yet).

## Independent UI review

Round 1 (CHANGES_REQUIRED, report): flames of the candles, the candle
table and the hearth drawn from the side, turned sideways or upside down by quarter turns and wall
rotations, and the chest reading as a barrel. Fixed by leaving those four pictures out (the drawn
sprites stay) until pictures seen from above arrive. Also fixed: drawn sprites on a mixed map wait with
the pictures so all props appear together, and a failed picture's fallback is tied to that picture.
The renders above are from after this round.

Round 2: **PASS** for fingerprint `fc9f03f0e16c65e76bdee4f2528451df567f795f1d6529d1883a1f07df68286d`
(report). Open P3s (not blocking): small three-quarter details on the
chair, bookshelf and bar tap; the drawn chest looks flatter beside painted props; plus the round-1 P3s
listed above. Untested: a real TV, Safari and Firefox, screen readers, the light theme, 150 % text.
