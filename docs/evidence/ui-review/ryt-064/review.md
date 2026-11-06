# ui-ux review: RYT-064 painted sprites and dressed painted maps, RYT-065 Universal VTT import

- Tickets: RYT-064 and RYT-065 (refinements of the tabletop; RYT-055–063 have PASS reports in
  [ryt-055/review.md](../ryt-055/review.md) and [ryt-063/review.md](../ryt-063/review.md)). Delivery
  report: [RYT-064/validation.md](../../RYT-064/validation.md), ADR 032 addendum "painted props and
  Universal VTT import", research note "Painted map references and assets", backlog entries RYT-064
  and RYT-065 (status `review`).
- Reviewer: `ui-ux` (role `.codex/agents/ui-ux.toml`, applied by an independent agent)
- Date: 2026-11-05
- Reviewed source fingerprint: `e5c568a6072e38b005902eb1717b750b43d6b8e540ab9742470f761844e775a1`.
  I checked it with `node scripts/check-ui-review.mjs --fingerprint` before and after the review, and
  it did not change.
- Base: `main` at 8a862ac (equal to `origin/main` after `git fetch`) plus the uncommitted
  RYT-055–065 working tree. Implementation code was read only.

## Verdict: CHANGES_REQUIRED

The painted look works on the table. On a simulated 55″ 4K table (80 device px per square):

- Walls of dressed stone stand out from the floor in every kind.
- The board grid stays the one regular pattern on the flagstones, and torches light the floor
  without leaking.
- Props read at a glance, and turned long props stay inside their box.
- Uploaded maps keep their own doors on the table.
- The Universal VTT import reads the grid, the origin, the doors, the windows and the lights, and
  refuses oversize and broken files with clear words.

One P1 and three P2 issues block the delivery:

- **P1-1:** ink maps get painted sprites and painted doors on the table screen and on Players'
  phones, while the DM sees line art. RYT-064's second acceptance criterion fails where it matters
  most.
- **P2-1:** the area numbers in the import preview are unreadable on realistic exports: 11px with no
  halo on desktop and 5px on phones.
- **P2-2:** choosing a file drops keyboard focus to `<body>`, and the result is a live region
  inserted with its content, so the read is not reliably announced.
- **P2-3:** tapping or clicking a door or prop on the DM board draws the browser focus ring in
  square units: a black and white ring about five squares thick around the item.

## Findings

### P1-1: ink maps show painted props and doors on the table and Player view

- **Where:**
  - `src/features/tabletop/ui/palette.ts:7-10`: `paintedScene` uses `scene.recipe?.look` and
    otherwise returns `!(map_kind === 'blank' && ground === 'parchment')`.
  - The projection for the table and Players drops `recipe`:
    `supabase/migrations/20261111120000_tabletop.sql:392-399`
    (`case when full_view then … 'recipe' … else '{}'`). The e2e fixture mirrors it in
    `tests/e2e/fixtures/tabletop.ts:60-66`.
  - So `board.tsx:62` (`painted`) and `:574` (`thick`) are true for every generated ink scene
    outside the DM editor.
- **Scenario:** dungeon seed 4242 in "Tinta sobre pergamino", ES dark.
  - The DM editor at 1440 shows line art (`editor-Mazmorra-ink.png`).
  - The table screen at 1920 × 1080, DSF 2, calibrated 55″ 4K, shows painted sprites: coloured
    beds, crates, bookshelves and braziers with warm halos. It also shows thick painted doors with
    stone jambs on the parchment (`table-Mazmorra-4242-ink.png`, `crop-ink-bedroom.png`;
    `table-Mazmorra-4242-ink.json`: 52 sprites, 0 line drawings, 12 jambs).
  - The Player view at 390 shows the same: DM 37 line drawings and 0 jambs, Player 37 sprites and
    17 jambs (`player-looks.json`, `player-ink.png`).
- **Impact:**
  - The table and the players' phones mix two visual languages on every ink map, against "Ink
    maps and parchment grids keep the line art" (RYT-064 acceptance) and the design-system rule
    "each map keeps one visual language".
  - What the DM prepares is not what the table shows.
  - The hosted RPC strips the recipe the same way, so this is not a fixture artefact.
- **Suggested direction:**
  - Give the public projection the look only, for example `'look', s.recipe->>'look'` for every
    viewer, or a scene column. Keep the seed DM-only, because a seed would let a player regenerate
    the map with its secret doors.
  - Then read that field in `paintedScene`.
  - Add an e2e assertion on the table screen for an ink scene.
  - This needs a reviewed migration and a PRE test, which the working agreement allows within the
    delivery.

### P2-1: the import preview's area numbers are unreadable on realistic exports

- **Where:**
  - `src/features/tabletop/ui/library.tsx:563-572`: `fontSize={cell * 0.6}` in picture pixels.
  - `src/features/tabletop/ui/tabletop.css:470-477`: `.tt-align-area` has a `stroke-width: 3px`
    halo, also in picture pixels, inside an SVG scaled to the frame.
- **Scenario:** a Dungeon Alchemist-like `.dd2vtt`, 40 × 28 squares at 120 px a square. The 4800 ×
  3360 picture is reduced to 4096 px. It has a light floor, 6 rooms, 8 doors, 4 windows, 10 lights
  and a 45° corner wall. Measured on screen (`uvtt-*.json`):

  | Viewport | Numeral | Halo |
  | --- | --- | --- |
  | 1440 ES dark | 11.2px | 0.54px |
  | 820 EN light | 10.3px | 0.5px |
  | 390 ES dark | 5.3px | 0.26px |
  | 390 EN light, 150 % | 5.1px | 0.25px |

  In the captures the cream numerals almost vanish on the light floor at 1440 and disappear on
  phones (`uvtt-1440-mansion-preview.png`, `uvtt-390-es-dark-100-preview.png`,
  `uvtt-820-en-light-100-preview.png`). The e2e fixture (10 × 6 at 72 px) is the only case where
  they read, at about 21px with a 3px halo.
- **Impact:**
  - The preview is the DM's one check that the walls split the map as intended. The summary says "8
    áreas de niebla", but the DM can't tell which tint is which, or find area 3, which the door
    inspector names later ("Al abrirla se revelan Sala 2 y Sala 3").
  - The validation claims "the preview tints each area with its number". That holds only for
    small files.
- **Suggested direction:**
  - Size the numerals and halo in screen terms, either with a minimum on-screen size derived from
    the frame scale or with `vector-effect` on the halo.
  - Or place HTML labels over the frame, as the board's room plates do.
  - Use a dark plate behind each numeral so it reads on light and dark maps.

### P2-2: choosing a file loses keyboard focus, and the read is not reliably announced

- **Where:**
  - `library.tsx:507-516`: the pick button gets `loading={reading}`. Mantine's `loading` also sets
    `disabled`.
  - `library.tsx:594-616`: the summary `<p role="status">` is rendered only once the file is read,
    with its content already inside.
- **Scenario:** 1440 ES dark, keyboard only.
  1. Focus "Elegir un mapa" and press Enter. The file chooser opens.
  2. Pick the 40 × 28 export.
  - Sampled every 25 ms (`uvtt-1440.json` `created.samples`): the button turns `disabled` with
    `data-loading` while focused, and `document.activeElement` becomes `BODY` within about 35 ms.
  - After the read (about 0.7 s), focus is still `BODY`, and the next Tab lands on the scrolling
    preview.
  - The status region count goes from 0 to 1 at the same moment its text appears.
  - The reading state is a spinner with no text and no `aria-busy`.
- **Impact:**
  - Keyboard and screen reader users lose their place (WCAG 2.4.3), with nothing said while a
    large export is read.
  - A `role="status"` element inserted with its content is not reliably announced. Together with
    the focus loss, the result ("40 × 28 casillas… 8 puertas · 8 áreas de niebla") can go unheard.
  - This is the same defect class as RYT-063 P2-2 ("Anterior").
- **Suggested direction:**
  - Keep the pick button focusable while reading, for example with `aria-disabled` and
    `aria-busy`, or show a "Leyendo el archivo…" line in a live region that is always mounted.
  - Render the result into a status region that exists before the read.
  - Optionally move focus to the summary or the name field when the read ends.

### P2-3: pointer or touch selection of a door or prop draws a ring about five squares thick

- **Where:**
  - `board.tsx:480-486` (props) and `:576-582` (doors): `<g tabIndex={-1}>`, focused by pointer
    down.
  - `tabletop.css:548-553` removes the outline only for `:focus-visible`. The remaining `:focus`
    outline (`outline: auto 5px`, computed) is drawn in SVG user units, where one unit is a square.
- **Scenarios:**
  - 1440 mouse: a generated ink dungeon, the painted tavern (selecting the hearth) and an
    uploaded `.dd2vtt` (opening a door).
  - 820 touch: the painted tavern, tapping a door and then a prop. Playwright `tap()` gives the
    same result (`touch-taps.json`).
  - In every case, the focused `g` shows a black and white ring about 3–6 squares across,
    depending on zoom. It covers room keys, props and the doorway until focus moves
    (`debug-generated-ink-tapped.png`, `tavern-hearth-selected.png`, `upload-door-pointer.png`,
    `touch-door-tap.png`; `debug-*.json`: active `g.tt-door is-open`, outline
    `rgb(238, 238, 238) auto 5px`, `:focus-visible` false).
  - `elementsFromPoint` finds nothing there, because it is the focus ring, not an element.
- **Impact:**
  - Opening doors and picking props by tap is the DM's most frequent board action on a tablet.
    Each tap hides a patch of the map, including the key of the room being revealed.
  - The DM board only: the table and Player views have no focusable items.
- **Status:** the `tabIndex={-1}` items date from RYT-055. I couldn't confirm whether the ring
  predates this delivery. It is on the owned DoorShape and PropShape paths and is reproducible on
  every map kind.
- **Suggested direction:**
  - Add `.tt-door:focus, .tt-prop:focus, .tt-pin:focus, .tt-area-handle:focus { outline: none }`.
    The keyboard keeps the `.tt-hit` stroke on `:focus-visible` and the board cursor.
  - Also check the pins and area handles, which use the same pattern. I did not exercise them by
    pointer.

### P3-1: an error for a new file sits under the previous file's preview

- **Where:** `library.tsx:455-505`. A failed pick keeps the earlier `picked` and `name`.
- **What happens:**
  - After the mansion, picking a 130 × 20 file shows "El mapa mide 130 × 20 casillas; Rytta admite
    de 4 a 120 por lado." under the mansion's preview and its "40 × 28…" summary.
  - "Crear la escena" stays enabled and would create the mansion (`uvtt-1440.json` `hugeState`,
    `uvtt-390-es-dark-150-huge.png`). A broken file behaves the same way.
  - The scene name also keeps the first file's name when another file is picked ("Mansion_Alchemist"
    stayed for `Celdas.dd2vtt` and `Cripta_30x20.png`).
- **Suggested direction:** name the refused file in the error, or clear the earlier pick. Replace
  an auto-filled name when a new file is picked, unless the DM typed one.

### P3-2: the preview scrolls inside the dialog, and axe flags it

- **Where:** `tabletop.css:1420-1425` (`max-height: 50vh; overflow: auto`).
- **What happens:**
  - At 1440 × 1000 the 40 × 28 preview is 521px, more than 50vh, so it becomes a scroll region with
    no focusable content. Axe reports `scrollable-region-focusable` (1 node) on the dialog
    (`uvtt-1440.json`). The project's e2e axe gate would fail on such a file.
  - Chromium makes the region focusable (the Tab after the read lands on it), but Safari does not.
  - A portrait export (for example 20 × 40) would show a third of its areas at a time.
- **Suggested direction:** fit the picture to the frame (`max-height` with `contain`) rather than
  scrolling, or give the region `tabindex="0"` and a name.

### P3-3: import summary copy

- **Zero counts show:**
  - "Ventanas (0) y luces (10)" can appear: the line shows when either count is non-zero.
  - "0 puertas" shows for files without doors (`closetsState`), as RYT-063 P3-6 fixed for the
    generator.
- **Agreement:** with one area, the ES string gives "1 área de niebla, tomadas de los muros"
  (`tabletop-es.ts:363-368`).
- **Oversize files:** a file over 120 MB says "no es una imagen ni un Universal VTT" rather than
  that it is too large (`library.tsx:463`).

### P3-4: the library and inspector show line art on painted maps

- **Where:** `panels.tsx:317-321` (prop cards) and `inspector.tsx:240-247` (preview). Both use
  `PropIcon` on parchment.
- **What happens:** on painted maps the DM picks a line drawing and the board paints a sprite
  (`tavern-props-panel.png`; 42 cards, 0 sprites). Most sprites are close to their icon. The statue
  is not: the icon is a bust, while the sprite is a plinth with a grey bowl.

### P3-5: sprites that read weakly at the table

- **Weak sprites** (`maps064/sheet.png`, `blank-stone.png`, the table crops):
  - The statue reads as a plinth with a bowl or skull.
  - The stalagmite is hard to tell from a rock.
  - The flowers are a few dots (already listed as a follow-up).
  - The lever and rubble are small.
- **Muddled lights:**
  - A crypt niche puts a wall torch under the bones sprite (`crop-crypt-top.png`).
  - The dungeon hall puts candles on top of a painted wall torch (`crop-dungeon-hall.png`).
- **The rest:** all other sprites read as what they are. They are clear at 80 device px per
  square.

### P3-6: texture notes for the table TV

- **Cave plates.** The cave floor's round plates, about a square each, have dark joints that form a
  lattice close to the grid. The grid still reads (`crop-cave-mid.png`).
- **Crypt wall tracing.** Where niche walls meet, the tracing leaves small curved dark bites in the
  masonry (`crop-crypt-top.png`).
- **Doors on blank grids.** On stone and grass grids, painted doors stand between stone jambs with
  no wall, and an open door looks like a gate (`blank-stone.png`).
- **Rating.** None of these hurt the floor and wall contrast or the grid.

### P3-7: door handles on uploaded maps, and documentation

- **Every upload door is DM-only.** On every `upload` scene, doors are DM handles only
  (`board.tsx:64`, `:573`), including doors a DM places on a plain picture that has no door art.
  Players and the table then see an open gap. The validation records this as intended. The DM gets
  no hint in the door tool or inspector, for example "La mesa ve la puerta del mapa".
- **Undocumented.** `docs/design-system.md` describes neither the dashed door handles on uploads nor
  the import preview (tints, numbers, doors).
- **Wording mismatch.** The validation table says "only walls split areas", while the ADR, the
  acceptance and the code split along walls, doors and windows. Only furniture sight lines are
  ignored. Align the validation wording.

## What works (verified in the browser)

- **Painted maps on the table** (1920 × 1080 DSF 2, 55″ 4K calibration, tokens 80 device px;
  dungeon 4242, crypt 7, cave 1, tavern 42, forest 4242):
  - Walls of dressed stone are clearly lighter than the floor.
  - The flagstone joints stay below the grid, so the grid is the only regular pattern.
  - Torch light stays on the floor.
  - Cobwebs, cracks and puddles read as surface.
  - The cave stone rim and the forest crowns, grass and stream read.
  - Painted doors with jambs match the walls (`table-*-painted.png`, `crop-dungeon-*.png`,
    `crop-forest-mid.png`).
  - All props are sprites (`table-*.json`: 0 line drawings).
- **Turned props:**
  - The tavern's hearth at 270° stays inside its 1 × 2 box (`outsidePx` 0 for every prop).
  - The inspector's ×2 gives 2 × 4 and keeps 270°, Normal returns to 1 × 2, and "Girar a la
    derecha" gives 2 × 1 at 0° (`tavern-editor.json`).
- **Line art kept** on the DM's ink editor and on parchment blank grids (9 line drawings, 0 jambs).
  Stone and grass grids get sprites (`blank-grounds.json`). The generator opens on "Pintado", and
  its preview paints sprites.
- **Universal VTT import:**
  - **Recognition.** The accept list includes `.dd2vtt`, `.uvtt` and `.df2vtt`, and the scene name
    comes from the file.
  - **The fixture file.** It reads as "10 × 6 casillas de 72 píxeles · 1 puerta · 3 áreas de
    niebla" (delivery e2e).
  - **The mansion export.** It reads as "40 × 28 casillas de 102 píxeles · 8 puertas · 8 áreas de
    niebla…", with "Ventanas (4) y luces (10) no se importan…".
    - The origin (2, 3) is honoured: Rytta's doors sit on the picture's doors.
    - The 45° wall cuts off its own area.
    - The free-standing diagonal and the furniture do not split rooms.
  - **The 450-closet file** keeps 400 areas and says "50 áreas pequeñas no caben en la escena y
    quedan fuera".
  - **Refusals.**
    - 130 × 20 gives "El mapa mide 130 × 20 casillas; Rytta admite de 4 a 120 por lado." as an
      alert.
    - A broken file gives "Ese archivo no es una imagen ni un Universal VTT que Rytta pueda leer."
  - **Plain pictures.** `Cripta_30x20.png` starts at 30 across, which gives "30 × 20 casillas de 50
    píxeles".
  - **No alignment fields** for Universal VTT files.
  - **One primary action** ("Crear la escena"). "Elegir otro mapa" turns secondary after a pick.
  - **Escape** closes the dialog and returns focus to "Nueva escena".
- **Created upload scene:**
  - The DM sees 8 dashed handles (no jambs, no Rytta leaves) and keys 1–8.
  - Opening a door names "Sala 2 y Sala 3".
  - The table screen draws no door (0 `.tt-door`) and shows the picture's own doors on the grid
    (`uvtt-1440-board.json`, `uvtt-1440-table.png`).
- **Phones and text size:**
  - 390 ES dark and EN light at 100 % and 150 %: no horizontal scroll and no button under 44px in the
    upload dialog.
  - Axe found 0 violations at 390 and 820, and only the P3-2 node at 1440.
- **Languages:** ES and EN have the same 555 tabletop keys.
- **Reduced motion:** sprites and halos are static, and the door swing transition only runs with
  `prefers-reduced-motion: no-preference`. All runs emulated `reduce`.
- **No pill or badge overuse:** the import summary is prose, and the areas are map labels.

## Scenarios tested

### Real browser (Playwright Chromium against the `dist-identity` build of this source)

- **Delivery spec:** `RYT_CAPTURE=1 npx playwright test tests/e2e/tabletop.spec.ts
  --project=identity-desktop --project=identity-tablet --project=identity-mobile
  --output=test-results/ui-review-064/run1`. Result: 18 passed. This run rebuilt `dist-identity`.
  I did not set `RYT_EVIDENCE`, so `docs/evidence/RYT-055/*.png` were not rewritten.
- **Throwaway specs and config.** I wrote them under the gitignored
  `test-results/ui-review-064/spec/` (`helpers.ts`, `uvtt.spec.ts`, `maps.spec.ts`,
  `debug.spec.ts`, `extra.spec.ts`, `playwright.config.ts`) and served the same `dist-identity` on
  port 4174.
  - Runs: 5/5, 9/9 and 3/3 passed. The `extra` run had 2 passes and 1 failure in my own spec: the
    Player fixture replaced the DM session in the shared context. I rewrote it and it passed 1/1.
  - I deleted the specs afterwards. Copies are in the evidence folder below.
- **What they covered:**
  - **Import at 1440 ES dark:**
    - the keyboard file chooser path and the reading state sampled every 25 ms;
    - focus before, during and after the read;
    - the summary;
    - numeral and halo sizes;
    - doors and tints in the preview;
    - axe;
    - the oversize, broken, 450-closet and `30x20` plain picture cases;
    - creating the scene, door handles, keys, a door tap with its inspector text, and the table
      screen.
  - **Import on phones and tablets:** 390 ES dark at 100 % and 150 %, 390 EN light at 150 %, and
    820 EN light. These covered the summary, sizes, overflow, sub-44px buttons, axe and the
    oversize error.
  - **Table TV:** the five painted kinds plus the ink dungeon at 1920 × 1080 DSF 2 with the 55″ 4K
    calibration. Fog was revealed and two tokens placed. I checked sprite and line-art counts,
    jambs, doors, the token size, and every prop's drawing against its box.
  - **Tavern editor:** selecting a turned hearth, ×2, Normal, turning, and the props panel.
  - **Blank grids:** parchment, stone and grass with nine props and closed, open and locked doors.
  - **Uploaded scene:** a painted prop, a pointer door tap, and the board cursor state.
  - **Debug of the focus ring:** an uploaded and an ink generated map with `elementsFromPoint`
    and the computed outline.
  - **Escape** from the upload dialog after a read.
  - **Player view at 390** for an ink and a painted dungeon, counted against the DM editor.
  - **820 touch:** tapping a door and a prop.
- All runs emulate `prefers-reduced-motion: reduce`.

### Screenshot and code inspection

- **Captures:**
  - the delivery spec's captures (generator, editor, measure, table, audio, event and uvtt at
    desktop, tablet and mobile);
  - the coordinator's renders `scratchpad/maps064/v3-*.png` and `sheet.png` (all 42 sprites on
    stone), which I judged against my own table captures;
  - 1:1 crops of the table captures.
- **Source:**
  - `sprites.ts`, `palette.ts`, `board.tsx` (PropShape, DoorShape, GridLines, MapLayer);
  - `library.tsx` UploadScene, `generator-dialog.tsx` (painted default and preview sprites),
    `inspector.tsx` PropFields and `tabletop.css` (preview, numerals, focus rules);
  - `domain/uvtt.ts`, both i18n catalogues, the scene projection in the tabletop migration and
    the e2e fixture.
- **Format check:** a web search confirmed the convention that a closed portal is a door and an
  open one a window
  ([Roll20 UVTT support](https://help.roll20.net/hc/en-us/articles/41643201127831-Universal-Virtual-Tabletop-UVTT-Support)).

## Untested states and limitations

- **Platforms:**
  - Chromium emulation only. No iOS Safari, Firefox, real TV or real miniatures, so the TV
    judgement comes from 4K-density captures.
  - Safari may not focus SVG items on tap, so P2-3 may not show on iPad. It shows in Chromium on
    desktop and with touch emulation.
  - No screen reader: the focus loss and live region in P2-2 were read from the DOM.
- **Real files:** no real Dungeon Alchemist or Dungeondraft export was tried. Mine follow the
  published fields.
- **Paths not reached:**
  - The `uvttDense` refusal (rooms payload over 240 000 characters).
  - Files over 120 MB.
  - Upload failure after Create.
  - Exports near 120 squares a side and decoding time on slow devices.
- **Not run:** 200 % text, class themes other than Default, a hosted Supabase backend,
  `npm run check` (the delivery reports it passing with 299 tests), and the full e2e suite outside
  the tabletop spec.
- **Pointer checks:** pins, area handles and tokens were not checked by pointer for P2-3.
- **Earlier PASS:** areas outside the RYT-064/065 paths were not re-reviewed beyond the delivery
  spec passing.

## Evidence

- Review folder (outside the repository):
  `C:\Users\dmont\AppData\Local\Temp\claude\84e3d83304c88c7a\0c99e808-b9b4-4a01-b66f-295a20858619\scratchpad\uiux-ryt064\`
  - `shots/*.png` and `shots/*.json`: every capture and measurement named above, including
    `crop-*.png` (1:1 table crops).
  - `run1-captures/`: the delivery spec captures.
  - `spec-copy/`: copies of the deleted throwaway specs and config.
  - `run1.log` … `run6.log`: the run logs.
- Working copies: `test-results/ui-review-064/run1` and `run2` (gitignored).

## Re-review request

Fix P1-1, P2-1, P2-2 and P2-3, then ask for a focused re-review of:

- **P1-1:** an ink and a painted generated scene on the table screen and in the Player view, with
  sprite and jamb counts and a capture.
- **P2-1:** the numerals of a 40 × 28 export reduced to 4096 px, at 390, 820 and 1440, on a light
  and a dark map.
- **P2-2:** focus and announcements through a keyboard file pick of a large export.
- **P2-3:** pointer and touch taps on doors, props, pins and area handles, plus the keyboard focus
  ring on the board.

Please also take any of P3-1 to P3-3 you address. Record the new fingerprint.

This verdict applies only to fingerprint
`e5c568a6072e38b005902eb1717b750b43d6b8e540ab9742470f761844e775a1`.

## Re-review (round 2)

- Date: 2026-11-05
- Reviewed source fingerprint: `2d35a5e4ff32786619c6f11f699826f69f3e01f723f8245f76b709050e3ada4b`.
  I checked it with `node scripts/check-ui-review.mjs --fingerprint` before and after this round,
  and it did not change.
- Scope: the four blockers, the P3 fixes the coordinator listed, and anything those fixes touch.
  The files are:
  - `supabase/migrations/20261111140000_tabletop_look.sql`, `model.ts` (`look`) and `palette.ts`
    (`paintedScene`);
  - the e2e fixture projection;
  - `library.tsx` UploadScene, `board.tsx` PropShape, `tabletop.css` (focus rules and numerals),
    both i18n catalogues and `docs/design-system.md`.

### Verdict: PASS

The four blockers are fixed and verified in the browser. What remains is P3, non-blocking. One P3 is
a side effect of the P2-1 fix on very large, dense maps (R2-1). The others are copy and small
follow-ups.

| Finding | Status | Verification |
| --- | --- | --- |
| P1-1 ink maps painted on the table and phones | Fixed | Browser, dungeon 4242, 55″ 4K table at 1920 × 1080 DSF 2, and the Player view at 390. **Ink:** the DM editor, the table screen and the Player view each show 52 line drawings, 0 sprites and 0 jambs (round 1: table 52 sprites and 12 jambs). **Painted:** 52 sprites and 12 jambs in all three (`r2/shots/r2-looks-*.json`, `r2-table-ink.png`, `r2-player-*.png`). The look comes from the projection's new `look`; the table view still carries no recipe. I read the migration but did not query the hosted PRE or production databases: their application is the coordinator's report. |
| P2-1 import numerals unreadable | Fixed (see R2-1) | The 40 × 28 export reduced to 4096 px (`r2-mansion-preview-*.png`): **1440** 29.8px with a 4.8px halo; **820 EN light** 27.5px; **390 ES dark** 14.2px with a 2.3px halo; **390 EN light 150 %** 13.5px. No overlaps. A dense 60 × 40 dungeon with 80 rooms of 6 × 5: 29.8px, 0 overlaps (`r2-dense-60x40-preview-1440.png`). |
| P2-2 focus lost while reading; result not announced | Fixed | 1440, keyboard file chooser, sampled every 25 ms (`r2-import-1440.json`). The pick button is never `disabled`, shows `aria-busy="true"` while reading, and keeps focus throughout ("Elegir un mapa", then "Elegir otro mapa"). The `role="status"` region is mounted, empty, before any pick, then reads "Mapa leído: 40 por 28 casillas, 8 puertas y 8 áreas de niebla." The visible summary has no role. EN: "Map read: 40 by 28 squares, 8 doors and 8 fog areas." |
| P2-3 ring about five squares thick on pointer or touch selection | Fixed | Mouse at 1440 and touch (`tap()`) at 820 on a door, a prop, a note pin and an area handle. The focused `g` has `outline-style: none` in each case, and no ring is drawn (`r2-select-*.json`, `r2-select-*-touch-820.png`). The keyboard path still works: after focusing the board and pressing an arrow, the viewport is `:focus-visible` with its outline and the square cursor shows (`r2-keyboard-*.png`). |
| P3-1 error under the previous preview | Mostly fixed (see R2-2) | After a good pick, the 130 × 20 and broken files clear the preview and summary, disable "Crear la escena" and empty the status region, while the alert carries the message. |
| P3-2 preview scroll region | Fixed | A portrait 20 × 40 export scrolls inside a `role="region"` with `tabindex="0"`, named "Vista previa del mapa con su cuadrícula". PageDown scrolls it by 435px. Axe (wcag2a/aa, 21aa, 22aa) on the dialog found 0 violations at 1440 for the mansion and the portrait map, and at 390 and 820. |
| P3-3 summary copy | Mostly fixed (see R2-3) | "sin puertas" appears for a file without doors. Skipped items now show only when present: "No se importan 4 ventanas y 10 luces: ya están pintadas en el mapa." and "Not imported: 4 windows and 10 lights, already painted on the map." |
| P3-7 documentation | Mostly fixed | `docs/design-system.md` now describes the look in the projection, the dashed DM door handles on uploads and the import preview. The validation table still says "only walls split areas". |
| P3-4, P3-5, P3-6 | Open, accepted follow-ups | No change in this round. They are not blocking. |

### Remaining notes (P3, non-blocking)

- **R2-1: numerals overflow small areas on very large maps.**
  - **Where:** `library.tsx`, `label = max(cell * 0.6, width / 25)`. The numeral size follows the
    picture, not the area.
  - **What happens:** on a 100 × 70 export with 280 rooms of 5 × 5, each room is about 37px wide
    at 1440. The 30px numerals (up to three digits) run into each other: 215 overlapping pairs,
    unreadable (`r2-huge-100x70-preview-1440.png`). At typical sizes (40 × 28 and 60 × 40) they are
    clear.
  - **Suggested direction:** cap the numeral at a share of its area's largest rectangle, for example
    `min(width / 25, 0.8 × min(w, h) × cell)`.
- **R2-2: the scene name keeps the first file's name.** Picking another file keeps
  "Mansion_Alchemist" (`setName((n) => n || base)`), so a later `Una.dd2vtt` or `Cripta_30x20.png`
  would be created as "Mansion_Alchemist". Replace an auto-filled name, and keep only one the DM
  typed.
- **R2-3: Spanish agreement in the announcement and summary.**
  - The announcement does not pluralise: "Mapa leído: 10 por 6 casillas, 1 puertas y 2 áreas de
    niebla." and "…, 0 puertas y 1 áreas de niebla."
  - The visible summary still says "1 área de niebla, tomadas de los muros del archivo".
  - With a single skipped item, "No se importan 1 ventana" should be "No se importa".
  - English reads correctly.
- **R2-4: plain pictures are not announced.** Plain pictures (for example `Cripta_30x20.png`)
  leave the status region empty, so only Universal VTT reads are spoken. Focus stays on the button,
  so this is minor.

### Tested (round 2)

- **Delivery spec:** `RYT_CAPTURE=1 npx playwright test tests/e2e/tabletop.spec.ts
  --project=identity-desktop --project=identity-tablet --project=identity-mobile
  --output=test-results/ui-review-064/r2run1`. Result: 18 passed. This run rebuilt `dist-identity`
  from this source. I did not set `RYT_EVIDENCE`.
- **Throwaway specs** under the gitignored `test-results/ui-review-064/spec/` (`helpers.ts`,
  `r2.spec.ts`, `playwright.config.ts`), served from that `dist-identity`: 8 passed. I deleted them
  afterwards. Copies are in the evidence folder below.
- **What they covered:**
  - **1440 ES dark import:**
    - the keyboard file chooser with focus, `aria-busy` and status samples;
    - the mansion, dense 60 × 40, huge 100 × 70 and portrait 20 × 40 exports;
    - axe;
    - the region and its keyboard scroll;
    - oversize and broken files after a good pick;
    - a plain `30x20` picture;
    - one-door and no-door files.
  - **Phone and tablet import:** 390 ES dark 100 %, 390 EN light 150 % and 820 EN light. These
    covered numerals, summary, status, axe, horizontal overflow and sub-44px buttons (none).
  - **Looks on the table:** ink and painted dungeons on the 55″ 4K table and in the Player view
    at 390, counted against the DM editor.
  - **Selection:** mouse at 1440 and touch at 820 on a door, a prop, a note pin and an area handle,
    plus the board keyboard cursor.
- **Code inspection:** the new migration, `paintedScene`, the fixture's `sceneJson`, UploadScene,
  PropShape's single hit rectangle (the box target is kept), the focus rules, the i18n keys (562 in
  each language, the same set) and `design-system.md`.
- All runs emulate `prefers-reduced-motion: reduce`.

### Limitations (round 2)

- **Database:** I did not query hosted PRE or production, so the `tabletop_look` application and
  its grants are as the coordinator reports. The PGlite assertion was not re-run by me.
- **Not run myself:** `npm run check`. The coordinator reports it passing (299 tests, build).
- **Not re-run:** the round 1 table-TV art judgement for painted kinds other than the dungeon. No
  change in this round touches the painter or the sprites.
- **The round 1 limitations still apply:**
  - Chromium emulation only;
  - no screen reader (the announcement was read from the DOM);
  - no real Dungeon Alchemist export, no iOS Safari and no 200 % text;
  - only the Default class theme.

### Evidence (round 2)

- Review folder:
  `C:\Users\dmont\AppData\Local\Temp\claude\84e3d83304c88c7a\0c99e808-b9b4-4a01-b66f-295a20858619\scratchpad\uiux-ryt064\r2\`
  - `shots/*.png`, `shots/*.json`: `r2-import-*`, `r2-*-preview-*`, `r2-looks-*`, `r2-table-*`,
    `r2-player-*`, `r2-select-*`, `r2-keyboard-*`.
  - `run1-captures/`: the delivery spec captures.
  - `spec-copy/`: copies of the deleted specs and config.
  - `../r2-run1.log`, `../r2-run2.log`: the run logs.

This PASS applies only to fingerprint
`2d35a5e4ff32786619c6f11f699826f69f3e01f723f8245f76b709050e3ada4b`.
