# ui-ux review: RYT-066 painted props from generated art and the sprite catalogue

- Ticket: RYT-066 (backlog status `review`, depends on RYT-064, whose round 2 PASS is in
  [ryt-064/review.md](../ryt-064/review.md)). Delivery report:
  [RYT-066/validation.md](../../RYT-066/validation.md); guide: [generated sprite art](../../../sprite-art.md).
- Reviewer: `ui-ux` (role `.codex/agents/ui-ux.toml`, applied by an independent agent that did not
  implement the work)
- Date: 2026-11-06
- Reviewed source fingerprint: `69772958277743c9551d74f32c82b5b8d644b5dd19689e1133bf4ce8464898b3`.
  I ran `node scripts/check-ui-review.mjs --fingerprint` before and after the review. It matched the
  coordinator's value both times.
- Base: `main` at 8a862ac, equal to `origin/main` after `git fetch`, plus the uncommitted
  RYT-055–066 working tree. I treated implementation code as read-only.

## Verdict: CHANGES_REQUIRED

The pilot pictures are a clear step up from the RYT-064 drawn sprites on a painted tavern. I judged
them on a simulated 55″ 4K table at 80 device px a square:

- Tables, chairs, barrels, crates, sacks, beds, the bar and the rug read at a glance.
- They sit well on the plank floor, and the grid still reads.
- The orientation fixes hold: every chair faces its table, and hearths, beds and bookshelves have
  their backs to a wall.
- The decode wait makes the pictures appear together. Reduced motion removes the fade.
- A missing or aborted picture falls back to the drawn sprite.
- Keyboard, pointer and touch behaviour of props is unchanged.

Two P2 issues stop the delivery. Both concern acceptance criterion 2 ("seen from above … read at
about 70 px a square"):

- **P2-1:** flames painted from the side end up pointing sideways or upside down on the board. This
  affects the candles, the candle table (`table-1`) and the hearth. The quarter turns this delivery
  adds make it more frequent: in one tavern, 8 of 18 tables showed a sideways or inverted candle.
  The guide forbids exactly this.
- **P2-2:** the chest picture reads as a barrel lying on its side at table scale. The drawn chest it
  replaces read as a chest, and a chest marks loot.

Both are known to the delivery, which lists them as pictures to regenerate. But they ship in the
build, and the drawn sprite is a working fallback. Either fix them or hold those pictures back, or
the producer records an explicit exception to the acceptance criterion.

## Findings

### P2-1: flames drawn upright are turned sideways or upside down

- **Where:**
  - The pictures:
    - `public/tabletop/props/candles-0-1x1.webp`: three candles in three-quarter view with
      upright flames.
    - `table-1-1x1.webp`: a candle in a holder, upright flame.
    - `hearth-0-2x1.webp`: a fireplace front elevation, mantel on top, fire tongues upward.
  - `src/features/tabletop/ui/prop-pictures.ts:18` and `:25`: `candles` and `table` have
    `spin: true`. Through `sprites.ts:1028` they get quarter turns from the item id.
  - The item rotation adds to that turn:
    - `domain/generator/dungeon.ts:607`: candles are scattered against walls with
      `wallRotation[side]`, so a candle on a south wall is turned 180°.
    - `tavern.ts:106`: the hall hearth is placed at 270, so after the tavern's mirror it ends up at 90
      or 270.
- **Scenario:** tavern seeds 42 and 7, dungeon seeds 4242, 23 and 99, all painted. I checked them on
  the table screen at 1920 × 1080, DSF 2, with the 55″ 4K and 1″ base calibration (80.1 device px a
  square), and in the DM editor at 1440.
  - **Tavern tables:** the candle on `table-1` points down or sideways on 8 of 18 tables in one
    run. Ids are random, so the count varies per scene; on average 3 of every 4 `table-1`
    instances are turned.
    - Captures: `zoom-candle-tables.png` (two candles pointing down, one upright),
      `crop-bar.png` and `crop-kitchen.png` (pointing right).
  - **Dungeon candles:** at rotation 180 the flames hang downward (`dungeon-4242-candles-*-r180.png`,
    `dungeon-23-candles-13-9-r180.png`). At 270 they lie sideways (`dungeon-99-candles-*-r270.png`).
  - **Hall hearth:** on the east or west wall it shows its fire tongues sideways
    (`crop-east-hearth.png`).
- **Impact:**
  - The table TV lies flat and players sit around it. `docs/sprite-art.md:60` sets the rule for that
    reason: "Flames from above … never upright tongues of fire, which players on the far side of the
    table would see upside down."
  - Line 51 asks for strictly top-down pictures, and the "Accept or generate again" checklist says to
    regenerate three-quarter views.
  - `docs/design-system.md:308` states that pictures are "seen from above", which is not what renders.
  - An upside-down candle on a table, repeated across the hall, is the most visible flaw of the new
    look at TV scale.
- **Status:** the validation's Impeccable row "P2 Flames, candles and tap drawn from the side" is
  marked fixed by a prompt change ("rows to regenerate"). The shipped pictures are unchanged, and the
  provenance log says the hearth is "to redo from above". So the finding is known but still open.
- **Suggested direction (any one):**
  - Regenerate `candles`, the candle table and `hearth` from above, per the guide's style block: a
    bright core with embers, no upright tongues. Then re-import.
  - Until then, leave those three to the drawn sprite. For example, import only `table-0` and leave
    `candles` and `hearth` out of `propPictures`.
  - Turning off `spin` alone is not enough. Item rotation still turns the candles, and an upright flame
    is upside down for half the table whatever the turn.
  - If the producer prefers to keep them, record the exception in the RYT-066 acceptance evidence
    and correct `design-system.md:308`.

### P2-2: the chest picture reads as a barrel lying on its side

- **Where:** `public/tabletop/props/chest-0-1x1.webp` (`prop-pictures.ts:20`), cut from
  `art/sprites/source/tavern-small.png` row 3, item 1. The picture has a rounded body, horizontal
  staves and two vertical iron bands. Its only cue is a small brass lock.
- **Scenario:** the 4K table at 80 device px a square:
  - tavern guest rooms (`crop-guest.png`);
  - dungeon treasure rooms and east-wall chests at rotation 90 (`dungeon-99-chest-43-*-r90.png`,
    `dungeon-23-chest-42-5-r90.png`).

  Turned 90° beside a wall, it looks exactly like the barrel props. RYT-064's drawn chest, a box with
  a lid line and a gold lock, read as a chest at 40 px (`../../RYT-064/tavern-painted-42.png`).
- **Impact:**
  - On a dungeon map, a chest tells players there is something to open or loot. Misreading it as a
    barrel changes what they do at the table.
  - Acceptance 2 asks that props "read at about 70 px a square", and this picture fails it. The
    delivery replaces a sprite that passed with one that does not.
- **Status:** known ("the chest like a barrel until their catalogue sheets arrive", validation line
  60).
- **Suggested direction:**
  - Keep the drawn chest (drop `chest` from `propPictures`) until the catalogue's chest sheet is
    imported.
  - Or regenerate it with a flat, rectangular lid seen from above, the hasp and lock large, and no
    rounded barrel body.

### P3-1: drawn sprites appear before the pictures on mixed maps

On the table's first load, the 7 drawn sprites of the tavern show at once. These are the stairs,
well, rock, bushes, trapdoor and cart. The 83 pictures wait for the decode, about 0.5 s with a
700 ms network delay (`table-fade-*.json`). On dungeons, where most props are still drawn, braziers
and altars show first and the pictured props follow.

The pictures do appear together, as `design-system.md` says, but the map's props as a whole do not.
This is minor. One fix would be to hold the drawn sprites too, through the same `shown` flag in
`board.tsx:564`.

### P3-2: generator preview

- **Variants differ from the board.** `generator-dialog.tsx:200` picks variants by list position,
  while the board uses the item id, so the preview's tables, mirrors and turns are not what the
  created scene shows. For tavern 42, the preview had 13 `table-0` and 5 `table-1`; the board had
  9 and 9. Known ("Left:" in the validation).
- **No fallback.** The preview `<image>` (`:211-226`) has no `onError` fallback, so a missing
  picture leaves an empty spot in the preview only. Code inspection; the board handles it.

### P3-3: the props panel and inspector still show line art

This is RYT-064 P3-4, still open, and the gap is now wider. On a painted tavern at 390, tapping a
table opens the sheet with a line-drawn table on parchment, while the board shows a painted table
with a mug and bread (`mobile-pointer-table.png`).

### P3-4: variety and layout notes

- **Beds:** they are now all the same red blanket. The RYT-064 drawn beds varied their dye
  (purple, red). A mirror does not change a bed much.
- **Generator spacing:** it still puts chairs of neighbouring tables back to back (known).
- **Bookshelf and bar:**
  - The bookshelf is a thin strip with spines seen from the front, and the bar's tap and mugs are
    in three-quarter view.
  - Both still read at 80 px, so they are not blocking. They belong to the same "from above"
    regeneration as P2-1.

### P3-5: fallback state never resets

`board.tsx:526`: `failed` stays true for the life of the PropShape. Suppose a picture fails once and
the DM then resizes the prop, for example a bar from 1 × 3 to 1 × 4, whose picture exists. The prop
keeps the drawn sprite until the board remounts. This is an edge case, found by code inspection only.

## What works (verified in the browser)

- **Pictures:**
  - Under the production subpath every picture returns 200 (delivery e2e).
  - The painted tavern (seed 42, 32 × 24) shows 83 pictures and 7 drawn sprites, with no image
    left unloaded and no page or console errors (`*-editor.json`).
- **Orientation:**
  - **Chairs:** 35 of 35 chairs (seed 42) and 49 of 49 (seed 7) face their table, and none sit back
    to their own table.
  - **Wall props:**
    - Both hearths and all beds have their backs to a wall.
    - Bookshelves on north, south, east and west walls keep the shelf against the wall (seeds 23
      and 99).
    - Chests turn their lock toward the room.
  - **Chair pictures** are never quarter-turned, only mirrored.
- **Variety:**
  - 18 tables used 12 of the 16 possible picture × mirror × turn combinations.
  - Crates, barrels and sacks turn and mirror.
  - The hall no longer repeats one table (compare `tavern-pictures-42.png` with RYT-064).
- **Fade-in** (table screen, first load, pictures delayed 700 ms):
  - All 83 pictures stay `data-shown="false"` at opacity 0.
  - They then switch together, and opacity rises 0 → 0.46 → 0.71 → 0.96 → 1 over 160 ms.
  - With `prefers-reduced-motion: reduce` the switch is instant (computed transition `1e-05s`).
  - With pictures delayed 3 s, the wait ends at the 1.5 s cap and the pictures then appear as they
    arrive, as documented.
- **Fallback** (table screen):
  - `chair-0-1x1.webp` answering 404 and `table-1-1x1.webp` aborted: all 35 chairs and the
    `table-1` tables render as drawn sprites (50 drawn, 90 of 90 props painted). There are no page
    errors, and the other pictures show (`table-fail.png`).
  - The drawn chairs keep the same backrest orientation.
- **Ink look:** an ink tavern (seed 42) has 0 `<image>` props in the generator preview and on the
  board, so all 90 props are line drawings.
- **Keyboard** (1440 and 820):
  - The board cursor announces "Casilla 27, 10: Mesa", "Casilla 28, 10: Silla" and
    "Casilla 29, 14: Chimenea".
  - Enter moves focus to the inspector's `h2` with the prop's name, and Escape returns focus to the
    board (`role="application"`).
- **Pointer and touch:**
  - A click at 1440 and a tap at 820 on a pictured table draw the selection ring with
    `outline-style: none`, so the RYT-064 P2-3 ring does not return.
  - At 390, a tap opens the selection sheet with focus on "Cerrar".
  - The accessible name stays "Objeto: Mesa".
  - The hit target is the prop's footprint only; the picture has `pointer-events: none`, so halos
    and shadows do not catch taps.
- **Axe** (wcag2a/aa, 21aa) on `main` with the tavern editor: 0 violations at 1440, 820 and 390.
- **Player view at 390:** 104 pictures shown and 5 drawn sprites, matching the table projection.
- **Generator dialog:**
  - The painted tavern preview shows the pictures with mirrors and turns at 1440, 820 and 390.
  - There is no layout regression. The delivery spec's axe and touch target checks on the dialog
    pass at all three sizes.
- **TV readability:**
  - At 80 device px a square, everything except the items in P2-1 and P2-2 reads at a glance.
  - Pictures keep a dark outline and contrast with the plank and stone floors, and the centred
    contact shadow does not turn with the prop.
- **Pills and buttons:** no new chrome, so none are overused.

## Scenarios tested

### Real browser (Playwright Chromium against `dist-identity`, built from this source by the delivery spec run)

- **Delivery spec:**
  - `RYT_CAPTURE=1 npx playwright test tests/e2e/tabletop.spec.ts --project=identity-desktop
    --project=identity-tablet --project=identity-mobile --output=<scratch>/e2e`.
  - Result: 18 passed. I inspected `editor.png`, `generator.png` and `measure.png` at all three sizes.
  - I did not set `RYT_EVIDENCE`, so no repository evidence was rewritten.
- **Throwaway spec** (`<scratch>/spec/review.spec.ts` and `playwright.config.ts`, outside the
  repository, with `@playwright/test` loaded through `createRequire` of the project
  `package.json`), served by `vite preview` of `dist-identity` on port 4175:
  - **Runs:** 7 + 9 + 1 + 1 passed.
  - **What it covered:**
    - **Tavern editor at 1440, 820 and 390:** the generator, picture counts, combinations,
      orientation from the stored items, zoom, pointer and touch selection, and axe.
    - **Keyboard at 1440 and 820:** cursor, Enter and Escape on a table, a chair and the hearth.
    - **Table screen at 1920 × 1080, DSF 2, 55″ 4K:**
      - fade-in sampled every 40 ms with `no-preference` and with `reduce`;
      - the 404 and abort fallback;
      - 3 s pictures;
      - tavern seed 7.
    - **Player view at 390, DSF 3.**
    - **Painted dungeons 4242, 23 and 99 on the 4K table:** 1:1 clips of every candles,
      bookshelf and chest.
    - **Ink tavern.**
  - All runs emulate `prefers-reduced-motion: reduce`, except the `no-preference` fade run.
- **Unit tests:** `npx vitest run src/features/tabletop/ui/sprites.test.ts
  src/features/tabletop/domain/generator/generator.test.ts`: 17 passed.

### Screenshot and code inspection

- **Delivery renders:**
  - `docs/evidence/RYT-066/*.png`: the tavern and dungeon at 40 px, the 80 px detail and
    `pictures.png`.
  - Compared with `docs/evidence/RYT-064/tavern-painted-42.png`.
- **Source sheets:** `art/sprites/source/tavern-small.png` (and the list of the large sheet).
- **Source code:**
  - `prop-pictures.ts`, and in `sprites.ts`: `pictureOf`, `decodePictures` and `variantOf`.
  - `board.tsx`: `usePropArt` and `PropShape`.
  - `generator-dialog.tsx`: the preview.
  - `tabletop.css:469-480`, and in the generators: `dungeon.ts` (`wallRotation`, library and
    scatter) and `tavern.ts` (chairs, hearth, mirror).
  - `docs/sprite-art.md`, and the tabletop section of `docs/design-system.md`.
- **WebP sizes:** all 16 match `(w + 2·pad) × (h + 2·pad) × 192` px, so the default
  `preserveAspectRatio` never letterboxes.
- **Catalogue** (glance only, a working document):
  - `art/sprites/catalogue.csv` has 211 rows (108 prop, 50 floor, 16 wall, 20 decal, 17 effect),
    order 1–211 without gaps, unique paths and no empty prompt. Two rows are marked imported.
  - A scan for artist, studio and asset-pack names found only "alchemist's desk", a generic noun.

## Untested states and limitations

- **Platforms:** Chromium emulation only. There was no real TV, miniatures, Safari or Firefox, so
  WebP decoding and `image.decode()` in those browsers are untested.
- **Not exercised in the browser:**
  - light theme and class themes other than Default. The board art does not depend on the theme,
    and no chrome changed;
  - 150 % and 200 % text. RYT-066 adds no text;
  - a screen reader. Announcements were read from the live region's DOM.
- **Paths not reached:**
  - a pictured prop resized ×2 in the inspector (covered only by the unit test for a 2 × 2 table);
  - pan and zoom performance with hundreds of pictures;
  - GitHub Pages cache headers;
  - the magenta key-out in the import.
- **Not run myself:** `npm run check` in full, or the import scripts (`scripts/sprites/*.py`). The
  coordinator reports `npm run check` passing with 305 tests.
- **Database:** RYT-066 makes no changes to the database or the projection, so none were tested.

## Evidence

- Review folder (outside the repository):
  `C:\Users\dmont\AppData\Local\Temp\claude\c4e52948c4112156\0c99e808-b9b4-4a01-b66f-295a20858619\scratchpad\uiux-066\`
  - `shots/*.png` and `shots/*.json`:
    - editor: `*-editor-tavern*.png`, `*-editor.json`, `*-keyboard.json`, `*-kb-*.png`,
      `*-pointer-table.png`;
    - fade: `table-fade-*.json`, `table-tv-*.png`;
    - fallback: `table-fallback.json`, `table-fail.png`, `table-slow.png`;
    - TV: `table-tv-seed7.*`, `crop-*.png`, `zoom-candle-tables.png`, `dungeon-*-tv.png`;
    - dungeon clips: `dungeon-*-{candles,bookshelf,chest}-*.png`, `sheet-dungeon-crops.png`;
    - Player view: `player-390-tavern.png`;
    - ink look: `ink-tavern.*`.
  - `e2e/`: the delivery spec captures.
  - `spec/`: the throwaway spec and config.
  - `run1.log` to `run5.log`: the run logs.

## Re-review request

Fix P2-1 and P2-2 by regenerating the pictures or holding them back, or have the producer record an
explicit exception. Then ask for a focused re-review of:

- a painted tavern and a painted dungeon with candles, on the 4K table at 80 device px a square, with
  1:1 crops of tables, candles, hearths and chests;
- the fallback and fade-in, if the picture list changes;
- `docs/design-system.md` and `docs/sprite-art.md`, if the claims or the shipped list change.

Take any of P3-1 to P3-5 you address. Record the new fingerprint.

This verdict applies only to fingerprint
`69772958277743c9551d74f32c82b5b8d644b5dd19689e1133bf4ce8464898b3`.

## Re-review (round 2)

- Date: 2026-11-06
- Reviewed source fingerprint: `fc9f03f0e16c65e76bdee4f2528451df567f795f1d6529d1883a1f07df68286d`.
  I ran `node scripts/check-ui-review.mjs --fingerprint` before and after this round. It matched the
  coordinator's value both times.
- Base: `main` at 8a862ac, still equal to `origin/main` after `git fetch`, plus the working tree.
- Scope: the two blockers, the P3 fixes the coordinator listed, and anything those fixes touch. The
  files are:
  - `prop-pictures.ts` and `public/tabletop/props/` (12 WebPs);
  - `board.tsx` PropShape (`data-shown` on every prop image, `failed` keyed to the URL);
  - `scripts/sprites/catalogue.py` and `import_sheets.py` (`skip`);
  - `docs/sprite-art.md` (provenance log), `docs/evidence/RYT-066/validation.md` and the regenerated
    renders.

### Verdict: PASS

Both blockers are fixed and verified in the browser. What remains is P3 and recorded in the
validation.

| Finding | Status | Verification |
| --- | --- | --- |
| P2-1 flames turned sideways or upside down | Fixed | **Shipped set:** `prop-pictures.ts` lists bar, barrel, bed, bookshelf, chair, crate, rug, sack and table, and `public/tabletop/props/` holds those 12 WebPs only. `table` has one picture (bread and mug). **Tavern seeds 42 and 7** (4K table, 80.1 device px a square): all 18 and 24 tables use `table-0`, mirrored and turned. The picture has no flame, so no turn gives it a wrong way up (`r2/shots/crop-bar.png`, `crop-guest.png`, `crop-east-hearth.png`). **Hearths:** drawn sprites again, with no front elevation (`crop-east-hearth.png`, `table-tv-seed7.png`). **Dungeon seeds 4242, 23 and 99:** every candles prop at rotation 0, 180 and 270 is the drawn sprite seen from above, which has no up or down (`r2/shots/sheet-dungeon-crops.png`). |
| P2-2 chest reads as a barrel | Fixed | Chests are drawn sprites again: a box with a lid line and a gold lock, turned with the lock toward the room. They read as chests in the guest rooms and in treasure rooms, at rotation 0, 90 and 180 (`crop-guest.png`, `dungeon-*-chest-*.png`). |
| P3-1 drawn sprites appear before the pictures | Fixed | **Fade-in** (table screen, first load, pictures delayed 700 ms): the 78 pictures and the 12 drawn sprites are all `data-shown="false"` at opacity 0. They switch in the same frame and fade together, opacity 0.17 → 0.59 → 0.89 → 1 over 160 ms (`r2/shots/table-fade-no-preference.json`). **Reduced motion:** with `reduce` they appear at once (`1e-05s`). **Slow pictures:** delayed 3 s, everything appears at the 1.5 s cap. **Plain drawn map:** the ink tavern still shows its line art at once, and a painted map without pictures has nothing to wait for (`picturesReady([])` is true). |
| P3-5 fallback never resets | Fixed | **Browser:** with `chair-0-1x1.webp` answering 404 and `table-0-1x1.webp` aborted, 65 props render as drawn sprites (35 chairs, 18 tables and the 12 drawn ones). All 90 are painted, the other pictures show, and there are no page errors (`table-fallback.json`). **Code:** the state now holds the failed URL (`board.tsx:526-530`), so a resize that picks another picture tries it again. I did not exercise the resize in the browser. |
| P3-2, P3-3, P3-4 | Open, accepted follow-ups | Recorded in the validation. The preview and the board now differ only in mirror and turn, because `table` has a single picture: the generator preview's file counts match the created board exactly (`r2/shots/*-editor.json`). |

### Regression checks (round 2, browser)

- **Tavern 42 editor** at 1440, 820 and 390:
  - 78 pictures and 12 drawn sprites, none unloaded, no page or console errors;
  - axe on `main` found 0 violations at each size.
- **Orientation:** chairs face their table, 35 of 35 (seed 42) and 49 of 49 (seed 7). Bookshelves
  on all four walls keep the shelf against the wall.
- **Variety:** 18 tables used 7 or 8 of the 8 mirror and turn combinations, depending on the run.
- **Keyboard** (1440 and 820): the cursor announces "Casilla 27, 10: Mesa", "… Silla" and
  "… Chimenea". Enter moves focus to the inspector `h2`, and Escape returns focus to the board.
- **Pointer and touch:**
  - At 1440 and 820, selection draws the ring with `outline-style: none`.
  - At 390, a tap opens the sheet with focus on "Cerrar".
- **Other views:**
  - **Player view at 390:** 99 pictures and 10 drawn sprites, all shown.
  - **Ink tavern:** 0 pictures in the preview and on the board.
- **Delivery spec:** `RYT_CAPTURE=1 npx playwright test tests/e2e/tabletop.spec.ts` on the three
  identity projects, `--output` to the review folder: 18 passed. This run rebuilt `dist-identity` from
  this source. I did not set `RYT_EVIDENCE`.
- **Throwaway spec:** the round 1 spec, adapted to point its outputs to `r2/`, to abort
  `table-0-1x1.webp` and to sample drawn sprites, ran against `vite preview` of that build: 11 passed.
- **Unit tests:** `sprites.test.ts` and `generator.test.ts`, 17 passed.

### Remaining notes (P3, non-blocking)

- **R2-1: stale line in the validation.** The "Left:" paragraph of
  `docs/evidence/RYT-066/validation.md` still says the chest reads "like a barrel until their
  catalogue sheets arrive". The chest picture is no longer used, so this is a docs-only fix.
- **R2-2: "seen from above" is nearly true.** It holds for what ships now. Three remaining pictures
  keep small three-quarter details: the chair's backrest spindles, the bookshelf's spines and the
  bar's tap and mugs. None carries a flame or a clear up direction, and all read at 80 px, so
  `design-system.md` stands. They are already in the regeneration list.
- **R2-3: mixed styles in guest rooms.** The drawn chest sits next to the painted bed and table. It
  is flatter and more graphic, but it reads, and it stays until the chest sheet arrives.

### Tested (round 2) and limitations

- **Browser:** Chromium, as in round 1:
  - DM editor at 1440, 820 and 390;
  - table screen at 1920 × 1080, DSF 2, with the 55″ 4K and 1″ calibration;
  - Player view at 390, DSF 3.
- **Screenshot and code inspection:**
  - the regenerated `docs/evidence/RYT-066/pictures.png` (12 pictures);
  - `prop-pictures.ts`, the PropShape changes and `tabletop.css:469-480`;
  - the provenance log in `sprite-art.md` and the round 1 paragraph of the validation.
- **Not run myself:** `npm run check` in full (the coordinator reports it passing with 305 tests and
  the build) and the import scripts. I did not open the catalogue changes beyond the `skip` rows.
- **The round 1 limitations still apply:**
  - no real TV, Safari, Firefox or screen reader;
  - no light theme, 150 % text or GitHub Pages caching;
  - no browser check of the resize after a failed picture.

### Evidence (round 2)

- Review folder:
  `C:\Users\dmont\AppData\Local\Temp\claude\c4e52948c4112156\0c99e808-b9b4-4a01-b66f-295a20858619\scratchpad\uiux-066\r2\`
  - `shots/*.png` and `shots/*.json`:
    - editor: `*-editor*`, `*-keyboard*`, `*-pointer-table.png`;
    - fade: `table-fade-*`, `table-tv-*`;
    - fallback: `table-fallback.json`, `table-fail.png`, `table-slow.png`;
    - TV: `table-tv-seed7.*`, `crop-*.png`;
    - dungeons: `dungeon-*`, `sheet-dungeon-crops.png`;
    - Player view and ink look: `player-390-tavern.png`, `ink-tavern.*`.
  - `e2e/`: the delivery spec captures.
  - `../spec/review.spec.ts`: the round 2 spec. `../spec/review-r1.spec.ts.txt` is the round 1 copy.
  - `../r2-run1.log`, `../r2-run2.log`: the run logs.

This PASS applies only to fingerprint
`fc9f03f0e16c65e76bdee4f2528451df567f795f1d6529d1883a1f07df68286d`.
