# RYT-068 verification: the sprite catalogue imported, map themes and textured painted maps

Delivery of 2026-11-07 on top of RYT-066 (uncommitted on `main`, base d303101). Decision:
[ADR 033](../../decisions/033-map-art.md). Art rules: [generated sprite art](../../sprite-art.md).
Design flow: [design flow](design-flow.md).

## What changed

- **Import** (`scripts/sprites/import_sheets.py`): 207 pictures imported, 1 rejected (`decals/shards.png`
  is a copy of `decals/moss.png`), 3 prop sheets still to generate (signpost, lantern post, market
  stall). Props: 88 props, 427 WebPs at 192 px a square (9.6 MB). Floors 50 and walls 16 as 512 px
  tiles of 4 × 4 squares with the wrap seam evened out; 16 effect tiles with transparency from their
  black or white ground; 19 decal atlases (7 MB together). The magic circles became the 2 × 2
  `magic-circle` prop. Sheets with a faint veil behind the props (the webs) are lifted; shapes painted
  close together (the second tree sheet) are counted unjoined. Sources (430 MB) are ignored by git.
- **Library:** 46 new props (furniture, containers, dungeon, nature, light, structures), named in
  English and Spanish; picture-only props are printed in sepia on ink maps; the props panel and the
  inspector show the pictures on painted scenes. Variants now divide evenly among up to 9 pictures.
- **Generator v3:** themes per kind stored in the recipe; dungeon rooms by purpose (armoury, forge,
  kitchen, prison, study, training ground, throne room, hoard, shrines with magic circles, fallen
  pillars in ruins); caves, forests and taverns furnished by theme (crystals, reeds and lily pads,
  standing stones, fairy rings, bedrolls, keg racks, stools, wardrobes, a bath, a wagon, fences).
- **Painting** (`painted.ts`, `materials.ts`): room floors by purpose with their own offset and turn,
  worn patches through a smooth mask, decals, shade along walls, torches and cold sconces, wall bands,
  cave rock that fades into the dark, tree pictures with shadows, loud floors quieted, lava that glows.
  The outside of underground maps is an untextured dark ground with faint clouds and specks. Maps are
  stored at up to 96 px a square.
- **Generator dialog:** theme samples, the summary as sentences, a legend of the DM marks, R for
  another seed, Create kept in reach, a loading state while the tiles arrive, the five places on one
  row on wide screens.
- **Board:** spell areas filled with the damage's painted effect; a revealed room shows 0.4 of a
  square past its squares so its walls appear; secret doors are painted as the room's wall across the
  doorway, past that margin.

## Renders

- [Before and after, same seed](before-after-dungeon-42.jpg): the RYT-066 drawn painted look on the
  left, the textured one (96 px a square) on the right.
- [Fifteen themes](themes.jpg) at 48 px a square, props as the board draws them, with a faint grid:
  caves (crystal, ice, rock), crypts (vault, marble nave), dungeons (dwarf hold, stone, temple, lava),
  forests (autumn, summer, winter) and taverns (oak, walnut, winter).
- Full size at 48 px a square: [stone dungeon](dungeon-stone-42-48.jpg), [rock cave](cave-rock-42-48.jpg)
  (the untextured outside and the rock fading into it), [summer wood](forest-forest-42-48.jpg).
- Stored maps measured at 96 px a square (3840 × 2688): 0.65–2.9 MB WebP with props, painted in
  0.2–0.65 s; an 80 × 80 map at 51 px a square: 0.94 MB.

## Impeccable critique and audit (2026-11-07)

Method: dual-agent, isolated sub-agents (A design review with browser captures at 390, 820 and 1440
in both themes; B detector, overlay, axe, tap targets, overflow and focus). Detector CLI: no findings
(exit 0, also without config). Overlay: 3 warnings in the dialog. Axe: 0 violations at every size;
no horizontal overflow; focus trapped in the dialog. A scored 27/40.

| Finding | Fix |
| --- | --- |
| P1 Theme samples misled: tavern samples showed the yard's grass, lava showed no lava, forest greens alike, painted samples under Ink (A) | A sample is a small map plate: floor (a tavern's hall), a band of its wall, a pool of its water or lava, a tavern's yard or a wood's trail; signature floors for autumn and swamp; Style comes before Setting and Ink prints the samples in sepia with a note that the setting still dresses the place |
| P1 Secret doors showed as a framed slab (A) | The room's wall is carried across the doorway in the band's own layers and tile, in map space, wide enough to hide the passage's edge lines |
| P1 Painted spell areas hid the map and read as terrain (A) | Effect at 0.5 (0.4 while placing), a dark halo under the outline and the counted squares; ink maps hatch the area in the damage colour |
| P2 In-between states: the new map's marks floated over the old painting, the chip was unreadable in light theme, options and R stayed live while creating, the error could be off-screen (A) | The marks wait for the painting; theme tokens for the chip; samples show their tile's colour while loading; creation steps and errors (with Try again) in the sticky footer; options locked, Escape and R ignored while creating |
| P2 Loud floors (marble blotches, checker, mosaic, herringbone) out-contrasted walls (A) | No wear on marble, marble quieted; checker replaced (temple throne room: red carpet; crypt lord: slate or slabs); mosaic and parquets quieter |
| Phone legend hidden while marks are drawn; DM line removed for screen readers (A) | The legend stays on phones; the holdings and DM lines are only visually hidden; the preview is shorter (24dvh) |
| R only, no keyboard Create; default name the kind (A) | Ctrl/Cmd+Enter creates; the default name is the place (the layout's name or the kind) |
| Copy (A): "Ambiente" also names the sound ambiences, "Otra semilla", fragments | "Entorno", "Otro mapa" / "Volver al mapa anterior", "Bosque con arroyo", "Cueva con lago", "Gruta húmeda", "Pintando el mapa…"; the DM line names the notes (Entrada, Objetivo, Trampa ×2) |
| Mixed tile label sizes, disabled "Anterior" looked enabled, white sticky bands in light theme (A) | One size for every tile; the back key dims; sticky parts take the dialog's surface |
| Overlay: thick-bottom kbd on a rounded box, tight switch descriptions (B) | Even 1px border; 1.4 line height |
| Overlay: preview "cramped padding" on tablet and phone (B) | Not changed: the sticky preview's background is the dialog's own, flush with the dialog's padding |
| Fewer bright specks in the void (A asked whether they read as stars) | Bright specks halved; the dark ground the user asked for stays |

Left (P3): the halo of a light prop can cross a cave wall; tiny cave decals are noise at TV scale; a
revealed cavern shows 0.4 of a square of the cavern it touches (no wall between them).

## Independent ui-ux review

Round 1 ([review](../ui-review/ryt-068/review.md)): CHANGES_REQUIRED, four P2 and four P3.

| Finding | Fix |
| --- | --- |
| P2-1 The five place tiles overflowed their words at 1024 and 1180 wide and at 150 % text | One row only through a container query on the options column (30rem, so larger text falls back to the wrapping grid), without the seal gutter |
| P2-2 Under a revealed room's blurred fog margin, a secret door showed a notch and the passage mouth | Behind the carried wall, the plain dark ground and the walls' cast shade reach 0.85 of a square into the passage and a square either side, over the passage's own wall bands |
| P2-3 The summary sentences were visually hidden on the 820 tablet and phones | Visible at every size: full size from 48em, small on phones (preview 22dvh) |
| P2-4 Create dropped keyboard focus to the page (disabled fieldset around the footer) | The footer is outside the locked fieldset; Create and Cancel are `aria-disabled` while saving, focus stays on Create and on "Reintentar" after a failure |
| P3-1 Empty status split the footer into two rows | An empty status takes no room |
| P3-2 Legend marks in theme colours, not the map's | The map's own fixed colours on a small dark plate |
| P3-3 A lava cave named "Cueva con lago" | "Cueva con lago de lava" / "Cave with a lava lake" |
| P3-4 Status node switching role; dead CSS rule | Separate status and inserted alert; rule removed |

Not changed: the mosaic stays at its quieted level (props on it read, 0.55 shade); hiding a room
grows like revealing it, on purpose (symmetry).

Round 2: CHANGES_REQUIRED. All four P2 verified fixed in the browser (the nine secret doors on a 4K
table screen show a straight wall with dark ground behind, even brightened). New P2 (R2-1): with 150 %
text the sticky preview hid focused options on a 390 phone and pushed the reroll keys off-screen on
iPads in landscape (WCAG 2.4.11).

| Finding | Fix |
| --- | --- |
| R2-1 Sticky preview taller than its room at 150 % text | The dialog measures its header, preview and footer; stacked, the preview sticks only while it leaves the options 200 px; side by side, only while its column fits; otherwise it scrolls with the options. Scroll padding comes from the measured heights, top and bottom, at every size |
| R2-3 Place glyph touching the tile border in the wrapping grid | Inline start padding |
| R2-2 The passage behind a secret door ends 0.85 of a square short of the room | Kept: the price of P2-2 |

Own probe after the fix (Tab through the dialog, each focused control measured against the sticky
parts): no hidden focus at 390, 820, 1024, 1180 and 1440, at 100 % and 150 % text.

Round 3: PASS (10 size and text combinations, 18 Tab stops each: nothing hidden; axe 0; no
regression in the keyboard flow through Create or at the secret door). One P3 (R3-1): at 1180 × 820
the first place tile could sit 18 px under the sticky header; fixed by padding the scroll for the
header and footer on wide dialogs.

Round 4: PASS for fingerprint `0cb31778…`: every focused control clear of the sticky parts in all ten
size and text combinations, axe 0, the keyboard flow through Create unchanged.

Round 5 (after closing the open notes, below): PASS for fingerprint `16f432ff…`. Verified: the three drawn props in the library, inspector and
on the 4K table in both looks; the nine secret doors (no tell from the room, a walled dead end from the
passage); the calmer mosaic; the cave camp's fire inside its cavern; the focus probe unchanged. P3
notes left: drawn props sit beside pictures until their sheets exist, the lantern post's library icon
is small, and hiding a room again also covers 0.4 of a square of a neighbour without a wall between.

Rounds 6 and 7 closed those last two: the lantern post is drawn larger with a flame seen from above;
hiding a room restores its still-revealed neighbours with their margin (the shared wall stays in view)
and covers the hidden room's own squares again (`stillRevealed` and `stillHidden` in
`domain/geometry.ts`, unit-tested). Round 7: **PASS** for source fingerprint `ab7ad116…`.

Rounds 8 and 9 reviewed the Safari keyboard fix and the R8-1 focus fix (below, under Safari's
engine), in Chromium and WebKit. Round 9: **PASS** for source fingerprint
`96abbe7b26f2f9230fc60daea6580d09b80af8055ab93383f6c44a16a497142e`, recorded in
`docs/evidence/ui-review-current.json`. Notes left: drawn props beside pictures until their sheets
exist, and a revealed cavern shows 0.4 of a square of a cavern it touches without a wall (the table
has no map of walkable squares to clip by).

The faint lines at secret doors (R2-4, R5-3), seen only brightened 2.5×, are closed. Behind the wall
the outside's own ground is painted again (the same seeded clouds and specks), and the wall's layers
use the room band's depths. Every patch edge sits on a whole device pixel. Before and after, brightened:
[secret-door-seams.jpg](secret-door-seams.jpg).

Round 10 then found R10-1 (P2): revealing **only the passage** showed, past its dead end, a dark strip,
the room's wall and about half a square of the secret room's floor. The passage's reveal held the
square touching the door and grew 0.4 plus the fog's blur across it.
- **Fix:** that square now belongs to no reveal area (`sealSecretDoors`). The passage's reveal stops
  short of the door and shows its dead end; the room's reveal shows its wall across the doorway.
- **After the door is found:** once both sides are revealed, the DM's room reveal also reveals the
  square, so tokens crossing it stay in view.
- **Leak check:** the table still never learns where a secret door is.
- **Tests:** a unit test covers 14 dungeons and crypts (`generator.test.ts`); `doorSquares` and
  `areaRevealed` are in `geometry.test.ts`.
- **Renders:** with the table's fog simulated on dungeons 42 and 4242 and crypt 13, the passage alone
  ends in its wall and darkness, even brightened 2.5×. The room alone shows its straight wall
  ([secret-passage-fog.jpg](secret-passage-fog.jpg)).
- **Review:** round 11 gave a **PASS** for source fingerprint
  `68ad0aa6c810a53a43fd42e4b50a111419651edf2a3cc08bb2334fd388c73f3d`, recorded in
  `docs/evidence/ui-review-current.json`.
  - **Table screen:** 16 sequences on the real 4K screen, passage first, room first and both. Behind
    a passage's dead end the fog's mean luminance is 10.3, the same as plain fog; in round 10 it was
    34.3.
  - **The door's square after both reveals:** a token on it shows in full, and a failed write retried
    saves both ops.
  - **Generator sweep:** 600 maps and 404 secret doors, with no lost passage and no other area
    touching a door.
  - **Notes left:** a found secret door is still painted as wall (map doctrine §5; the DM can unmark
    the door as secret). Scenes generated before this change keep their stored areas, so regenerate
    them for the fix.

## After round 4: the open notes closed

| Note | Change |
| --- | --- |
| Three catalogue props without a picture (signpost, lantern post, market stall) | Drawn by Rytta in both looks (painted sprite and ink line art) and added to the library; taverns get a lantern post by the front door and a signpost where the path leaves. The import replaces the drawings when the author's pictures are saved |
| The passage behind a secret door ended in void | Past the dark ground that a revealed room's margin can show, the passage is closed by its own wall (a dead end seen from the passage) |
| A fire's halo crossed cave walls | Cave camps light their fire where its two squares of light stay inside the cavern (three steps from the rock, else as far as the place allows) |
| Tiny cave decals read as noise at TV scale | Fewer, larger pebbles and bones in rock, damp, crystal and ice caves |
| The mosaic floor stayed busy | Busy floors (mosaic, checker, hex tiles, cobbles) also lose contrast under their own average colour |

Not done: the shards decals and the three props' pictures need the author's image generation.

## Safari's engine (WebKit)

Run with Playwright's WebKit 2370 (downloaded with the author's approval), on Windows: Safari's engine,
not Safari on an iPad.

- **Every map in both engines.** All 23 themes painted and the five kinds in ink (seed 42, 34 × 19 at
  40 px) paint in WebKit with no page error. WebP encoding works there. Against Chromium, the mean pixel
  difference is under 2 % for dungeons, crypts and caves, and 3–5.5 % for taverns and forests: WebKit's
  blur is a little sharper on path edges and tree shadows. Side by side:
  [webkit-compare.jpg](webkit-compare.jpg). Painting takes 40–130 ms in WebKit and 3–42 ms in Chromium.
- **The tabletop e2e in WebKit:** Desktop Safari at 1440, iPad (gen 7) at 820, iPhone 13 at 390. The
  first run had 8 failures out of 18:
  - **A real Safari bug, fixed.** After clicking a button in the editor (for example "Activar el
    evento"), Safari leaves focus on the page's `<main>`, outside the editor, so tool letters stopped
    working. The editor now also takes its keys when focus is on an element that holds it (body,
    main). Dialogs, drawers and menus are portals outside `main` and keep their own keys; fields
    are still excluded.
  - **Test assumptions, fixed in the spec.** WebKit does not focus a button on click, so the generator's
    "Volver al mapa anterior" focus check now presses the key from the keyboard. On phones, the "Mover a
    una casilla" tap now waits for the drawer's closing overlay to be gone, a 200 ms race that Chromium
    happened to win.
  - **Runner limits, not shipped.** The table's token-width check assumes a pixel ratio of 1, as the
    Chromium projects do, so the WebKit run sets `deviceScaleFactor: 1`. Playwright's WebKit route
    drops multipart Blob bodies, so the fixture stored the uploaded map as 0 bytes. The app had sent a
    659 KB WebP, and the board showed its "La imagen del mapa no se cargó" fallback, the right state.
    A scratch shim sent the bytes as an array for the run.

  After the fixes: **18 / 18 pass** in WebKit, and the full Chromium suite passes (500 passed, 55
  existing skips).
- **Round 8 note R8-1, fixed.** In Chromium, "Activar el evento" disappears when pressed and focus fell
  to the body, so a letter switched the tool behind the open drawer. Now focus moves to the key that
  replaces the one pressed ("Rearmar", or back), and the editor ignores keys from behind an open
  sheet or dialog. After the fix: WebKit 18 / 18 in two runs in a row, Chromium 18 / 18 and
  `npm run check` pass.

Every canvas and CSS feature used exists in Safari 16.2 or later: pattern transforms, DOMMatrix,
Path2D, shadow blur, container queries, `:has`, `color-mix`, `dvh`, `Intl.ListFormat` and WebP.

## Checks

| Check | Result |
| --- | --- |
| `npm run check` (typecheck, lint, contracts, 317 unit and SQL tests, build), after every review round | Pass |
| `npx playwright test tests/e2e/tabletop.spec.ts` (390, 820, 1440; axe; touch targets), after every review round | 18 passed |
| Generator focus probe (Tab ×16; 390, 820, 1024, 1180, 1440; 100 % and 150 % text) | No focused control hidden by the sticky parts |
| Tabletop e2e in WebKit (Desktop Safari 1440, iPad 820, iPhone 13 390), after the Safari fix | 18 passed |
| Full e2e suite in Chromium, after the Safari fix | 500 passed, 55 skipped (existing) |
| All 28 map looks painted in WebKit and Chromium | No errors; same maps (see above) |

Not tested: a real TV, a real iPad or iPhone (Safari's engine ran on Windows), or a screen reader; the production subpath build was exercised by
the e2e (served under `/rytta-dnd-app/`), not by hand. Database: no migration (the theme lives in the
recipe, already open JSON).

## Sprite audit (2026-11-07)

- **Method:** I reviewed every prop picture (427) and texture for a top-down view on contact sheets,
  then generated 2,829 maps (every kind, theme, three sizes, 25 seeds and three densities) to see
  what each generator places.
- **Fixed:** dungeon prisons left a 1 × 1 bedroll, but the bedroll's picture is 1 × 2 and Rytta has
  no drawing for it. That was an invisible prop the DM could select (78 times in those maps). It is
  now placed at 1 × 2. `sprites.test.ts` fails if a generator places a prop with neither a picture
  for its size nor a drawing.
- **Not top-down, for the author to regenerate:**
  - front or side views: bookshelf, weapon rack, wardrobe, keg rack, oven, fence, tent, hearth,
    banner, forge, throne, idol, archery target, one bench and the spinning wheel;
  - 3/4 views: some chairs, columns, chests, sacks, firewood, mushrooms, an urn, crystals,
    stalagmites, statues, chains, the cart, the obelisk and the spike trap;
  - side views among the decals: flower patches and grass tufts.

  Floors, effects and the other decals are top-down. The audit page (private artifact) lists every
  variant, where it is used, and a prompt to regenerate it.

## Second import (2026-11-08)

- **What arrived:** the author regenerated the 35 sheets the audit flagged and delivered the four
  missing ones (signpost, lantern post, market stall, shards).
- **Prompts:** they now say what each object shows from directly above, and their View line forbids
  front faces. They live in `scripts/sprites/catalogue.py`, so the Excel keeps them across imports.
- **Two files saved at the wrong path, moved:** `props/grass-tufts.png` went to `decals/`, and
  `props/bench.1.png` became `props/bench-1.png`. The old files are backed up in the session
  scratchpad.
- **Import:** 91 props (439 pictures), 50 floors, 16 walls, 20 decal sheets and 17 effects; all 211
  catalogue rows are imported.
- **Fit on painted maps:** checked on taverns (oak, walnut), dungeons (stone, dwarf hold, temple,
  ruins), the crystal cave, the forest and the crypt.
  - Wall props put their back to the wall and face the room.
  - The signpost and lantern post were tiny, so they now fill 0.85 of their square and the lantern's
    halo shows.
  - Taverns and ruins scatter the shards decals.
- **Still not top-down, back to pending in the Excel:** grass tufts (fans of blades standing up) and
  the market stall (a three-quarter awning). Minor: 2 of 9 shards and the lavender and lilies among
  the flower patches.
- **Checks:** `npm run check` passes (310 tests; the others went with RYT-069's changes in this
  working tree), and the tabletop e2e passes 18/18.
- **ui-ux round 12: CHANGES_REQUIRED, two P2 findings.**
  - R12-1: the wall torches (sheet #59, not part of the audit) were front views with flames as
    tongues, so they pointed into the wall once turned with it. The import now leaves the whole
    sheet out, and Rytta draws its top-down torches.
  - R12-2: two chests of sheet #20 read as barrels. The import leaves out those two pictures, so six
    chests remain.
  - Both sheets are pending in the catalogue with stronger prompts. `REDO` in
    `scripts/sprites/catalogue.py` lists the sheets to generate again and what the import leaves out
    meanwhile.
- **ui-ux round 13: PASS.**
  - Torches: 26 placed on all four walls show the bracket on the wall edge and the flame inside the
    room.
  - Chests: the six that remain read as chests, never barrels.
  - Nothing else changed: 89 other props and the decal atlases match round 12 pixel for pixel.
  - The verdict is bound to the asset and code hashes in `docs/evidence/ui-review/ryt-068/review.md`,
    because assets do not move the UI fingerprint.
  - Notes left (P3): the lantern's halo is faint in daylight, the drawn torch flame is small, and the
    four sheets are still pending.

## Third import (2026-11-08)

- **What arrived:** the author regenerated the four pending sheets: wall torches, chests, market stall
  and grass tufts. All four are top-down: a bracket plate on the wall edge with a round flame, flat
  chest lids, a flat awning over the counter, and grass rosettes.
- **Import:** `REDO` is empty again and all 211 catalogue rows are imported. The torch fills 0.75 of
  its square, because at 0.5 it was a third of a square.
- **Fit:**
  - On the crypt, the dungeons (temple, ruins, stone) and the oak tavern, the torch keeps its plate on
    the wall and its handle toward the room.
  - Chests read as chests beside barrels.
- **Accepted by the author:** two of nine shards and the lavender among the flower patches.
- **ui-ux round 14: PASS** (bound to asset and code hashes in the review).
  - All four torch variants keep the plate on the wall in all four turns.
  - The eight chests never read as barrels.
  - The market stall reads from above in the library, the inspector and ink.
  - Grass rosettes read as texture.
- **The reviewer's P3, fixed:** the unlit torch kept a warm halo. The import now takes options per
  object (`OBJECT_EXTRAS` in `scripts/sprites/catalogue.py`), and the unlit torch has none. After it:
  91 props (439 pictures), and `npm run check` passes (310 tests).
- **Notes left (P3):** the lantern halo is faint in daylight, the torch flame sits by the wall, the
  checked tablecloths stand out, and the menhirs are small.

## Left with the author (decided 2026-11-07)

- **Pictures:** the author will generate the signpost, lantern post, market stall and shards sheets
  with the prompts in `art/sprites/catalogue.csv`, save them under `art/sprites/source/`, and run
  `python scripts/sprites/import_sheets.py`. Until then Rytta draws the three props; no map uses shards.
- **Devices:** the author will try the generator, the editor and the table screen at the next session
  on the TV under miniatures and the iPad, and report what to fix.
