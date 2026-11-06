# ui-ux review: RYT-063 map generator v2, map doctrine and a full-width DM section

- Ticket: RYT-063 (refinement of RYT-055–062, which has a PASS in
  [ryt-055/review.md](../ryt-055/review.md)). Delivery report:
  [RYT-063/validation.md](../../RYT-063/validation.md), ADR 032 addendum, [map doctrine](../../../map-doctrine.md),
  backlog entry RYT-063 (status `review`).
- Reviewer: `ui-ux` (role `.codex/agents/ui-ux.toml`, applied by an independent agent)
- Date: 2026-11-05
- Reviewed source fingerprint: `19938b99ce1f5a3cbafd81c837de6246f63c4963700d493cfa0f5055900cb876`.
  I checked it with `node scripts/check-ui-review.mjs --fingerprint` before and after the review, and
  it did not change.
- Base: `main` at 8a862ac (up to date with `origin/main` after `git fetch`) plus the uncommitted
  RYT-055–063 working tree. Implementation code was read only.

## Verdict: CHANGES_REQUIRED

Most of the delivery holds up in the browser:

- The DM library and editor span the window from 48em while the header keeps its measure.
- The generator has a clear single primary action ("Crear la escena") and kind-specific switches
  with help text; the Traps switch shows only for dungeon, crypt and cave, with cave-specific help.
- The preview shows note seals, trap triangles and keyholes on locked doors. The caption has
  `aria-live="polite"` and `aria-atomic="true"`. A double click on Create makes one scene and one
  upload, and Escape returns focus to "Nueva escena".
- Passage keys P1… appear only with Fog, a selected door or a selected event. The door inspector
  names what it reveals, and the event reveal list is grouped (Salas, Pasillos) and searchable.
- The painted and ink maps read well on a simulated 4K table screen.
- Axe finds nothing, and Spanish and English catalogues have the same 543 tabletop keys.

Three P2 issues remain. Each is concrete and reproducible:

- **P2-1:** room key plates collide with whatever sits at the room centre. The generator's own DM
  notes hide the keys of the entrance, goal and treasure rooms in 8 of 10 generated maps, and the
  plates cover tokens and props.
- **P2-2:** when "Anterior" disables itself, keyboard focus drops to `<body>`, outside the dialog.
- **P2-3:** clearing the seed field leaves a "0", so a typed seed comes out with an extra digit
  (77 becomes 770) and makes a different map.

## Findings

### P2-1: room key plates collide with notes, tokens and props at the room centre

- **Where:** `src/features/tabletop/ui/board.tsx:153-173` and `:237-268`.
  - `RoomNumbers` draws one plate at the centre of each room's largest rect, in the top SVG layer.
  - That layer is above the tokens, and below the pins that are drawn after it.
  - The generator puts its notes at the room centre: `src/features/tabletop/domain/generator/dungeon.ts:876-884`,
    at `r.x + floor((w - 1) / 2)`.
- **Scenario:** 1440 × 1000, ES dark, DM editor after "Crear la escena".
  - Dungeon and crypt, seeds 4242, 1, 7, 42 and 9001.
  - Also a seeded blank scene with a token on the centre square of a room.
- **What happens:**
  - **Notes hide the keys of the key rooms.** In 8 of the 10 maps, the plate of the entrance,
    goal or treasure room sits under that room's note pin ("Nota: Entrada", "Nota: Objetivo",
    "Nota: Tesoro escondido"). Between 31 % and 100 % of the plate is covered. In 5 maps the
    entrance key is fully hidden (`keys-dungeon.json`, `keys-crypt.json`).
  - **Example with seed 4242.** The door inspector says "Al abrirla se revela Sala 2 y Pasillo 2",
    but "2" can't be found on the board. It is under the Entrada pin (`board-fog-zoom-1440.png`,
    `board-door-1440.png`).
  - **Tokens and props are covered.** A token on a room's centre square is covered by the plate.
    The 52px "Ogro" token shows a 37 × 35px "1" plate instead of its initial, and the large
    "Gigante" token shows "2". On the DM board this reads as if the tokens were numbered
    (`token-under-key-1440.png`, `token-under-key-1440.json`).
  - Plates also sit over central props: the hall table in room 8, and the sarcophagi in crypt
    seed 7, where 6 plates cover props.
- **Impact:** the RYT-063 P1 fix made room numbers readable, but the rooms the DM most needs to find
  lose their key. The plates also cover the board's main content (tokens) at the most likely spot
  for a monster. The DM board only: the table and phones never show the keys.
- **Suggested direction:**
  - Anchor the plate to an inner corner of the room, for example the top-left inside square of
    the largest rect, as printed dungeon keys are. Pick a square that no note, event, token or
    prop occupies.
  - Alternatively, keep the centre but move it off occupied squares.
  - Whichever you choose, keep the plates above the fog. Pins should keep winning over plates, and
    plates should not cover tokens.

### P2-2: focus is lost when "Anterior" disables itself

- **Where:** `src/features/tabletop/ui/generator-dialog.tsx:65-70` and `:264-272`
  (`disabled={history.length === 0}`).
- **Scenario:** 1440 × 1000, ES dark, keyboard only.
  1. Focus "Otra semilla" and press Enter. The seed changes and focus stays.
  2. Press Tab to "Semilla anterior" and press Enter. The seed comes back (4242).
- **What happens:** the button becomes disabled while focused, and `document.activeElement` is
  `<body>`, outside the dialog. The next Tab is caught by the focus trap but lands on the first kind
  radio at the top of the dialog, not next to the preview (`gen-1440.json`: `afterPreviousFocus`,
  `tabAfterPreviousDisabled`). This happens every time the history empties.
- **Impact:** keyboard and screen reader users lose their place (WCAG 2.4.3). A screen reader gets
  no focus target after the action.
- **Suggested direction:** keep the button focusable with `aria-disabled` and a no-op while the
  history is empty, or move focus to "Otra semilla" when the last seed is taken back.
- **Minor, same control:** a typed seed is not pushed to the history, so "Anterior" skips it.

### P2-3: the seed field turns an empty value into 0, so typed seeds gain a digit

- **Where:** `src/features/tabletop/ui/generator-dialog.tsx:391-400`
  (`onChange={(v) => setSeed(Number(v) || 0)}`).
- **Scenario:**
  - 1440 × 1000 with Ctrl+A, Backspace, then typing "77".
  - 390 × 844 touch at 100 % and 150 % with Backspace four times on "4242", then typing "77".
- **What happens:** as soon as the field is empty it shows "0", with the caret before it, so typing
  "77" gives "770" (`event-1440.json`: `afterClear: "0"`, `afterType: "770"`;
  `phone-measure-100.json`, `phone-measure-150.json`). `fill('')` also leaves "0".
- **Impact:** the seed field exists to reproduce a map ("La misma semilla da el mismo mapa"). After
  the most common way of replacing a value, especially on a phone, the DM silently gets another
  seed's map.
- **Suggested direction:** keep the draft text while the field is empty or partial, and commit a
  number only when it is valid. Keep the last seed (or roll one) on blur if the field is left empty.

### P3-4: "Anterior" / "Previous" is clipped at 150 % text on phones

- **Where:** the `.tt-reroll` row, `tabletop.css:1469-1476` (two `flex: 1 1 0; min-width: 0` buttons).
- **Scenario:** 390 × 844 at 150 %, both languages.
- **What happens:**
  - The label reads "Anterio" (ES) or "Previou" (EN). Label scrollWidth is 90 and clientWidth 83
    (`gen-phone-es-150.png`, `gen-phone-en-150.png`, `phone-measure-150.json`).
  - "Otra semilla" and "New seed" wrap to two lines.
  - The accessible name ("Semilla anterior") is intact.
- **Suggested direction:** let the row wrap, or drop the icon at large text.

### P3-5: the phone sticky preview at 150 % text

- **Where:** `tabletop.css:1933-1960`.
- **Scenario:** 390 × 844 at 150 %. This applies to every sticky phone dialog, ES and EN.
- **What happens:**
  - **Preview under the header.** The sticky `top` is fixed at 44px + 2 × md, but the dialog
    header grows with its title. When the options scroll, the top 22px of the preview slide
    under the header (`phone-measure-150.json`: header bottom 115, preview top 93).
  - **Fields partly under the footer.** `scroll-padding-bottom: 5rem` (120px at 150 %) is less
    than the 131px footer. The focused Traps row and the seed field end 11px under the sticky
    footer (`gen-phone-focus-es-150.json`, `gen-phone-focus-en-150.json`). They are partly
    obscured, not hidden, so this passes WCAG 2.4.11 but not 2.4.12.
  - **A small options window.** The preview block (398px) and the footer (131px) leave about
    200px of 844 for the options, about one switch row at a time
    (`gen-phone-scrolled-es-150.png`).
  - At 100 % text everything lines up: the header bottom equals the preview top, and no focused
    control is covered.
- **Suggested direction:** derive the sticky offset from the real header, raise the bottom padding
  to the footer height, and consider releasing the sticky preview at large text, as the low-window
  rule already does for short screens.

### P3-6: caption wording

- **Where:** `generator-dialog.tsx:241-255`, plus `tabletop-es.ts:397-458` and `tabletop-en.ts:389-452`.
- **What happens:**
  - **Locked and secret counts follow the passages sentence.** "… · 12 puertas · 52 objetos.
    11 pasillos. 1 cerrada con llave." In English, "12 passages. 1 is locked. 1 is secret." reads
    as locked passages.
  - **"0 puertas" / "0 doors"** shows for every cave and forest.
  - **"áreas" means rooms only here**, while the reveal list calls the same set "Salas".
- **Suggested direction:** attach the door details to the doors count, for example "12 puertas
  (1 con llave, ninguna secreta)". Omit zero doors.

### P3-7: Spanish agreement in the door inspector

- **Where:** `tabletop-es.ts:463` and `inspector.tsx:311-317`.
- **What happens:** "Al abrirla se revela Sala 2 y Pasillo 2." should be "se revelan" when the list
  has more than one item (`board-1440.json`, `token-under-key-1440.json`).
- **Suggested direction:** pass `count: revealed.length` and add `_one` / `_other` forms.

### P3-8: key plates are small at the fitted zoom

- **What happens:**
  - At 1440, the fitted 47 × 26 board renders room numerals at 11.3px and passage keys
    (0.46px font in square units) at about 9px.
  - On the 390px phone, fitted, they are unreadable (`editor.png` in run1 mobile).
  - Zooming in fixes it: 17.7px after two zoom steps.
- **Suggested direction:** counter-scale the plates at low zoom with `--tt-z`, as the cursor
  strokes do, so they keep a minimum on-screen size.

### P3-9: wide screens, header measure and the library

- **What happens:** the header and navigation keep the 1360px shell measure while the tabletop
  main area spans the window. The left edge of the header content and the page content are offset
  by 35px at 1440, 268px at 1920 and 585px at 2560. At 820 the gutters differ by 8px (main 16px,
  topbar 24px) (`width-*.json`, `library-1920.png`, `library-2560.png`, `editor-2560.png`).
- **Library at 1920 and 2560:**
  - The setup card stretches the full width, so "Ajustar" and "Abrir la pantalla de mesa" sit
    about 1000–1600px from the text they act on.
  - Three scene plates fill the left eighth of the page.
  - "Nueva escena" sits outside the header's right edge.
- **Status:** the ADR and the validation record keeping the header measure as a decision, with
  header alignment over 1440px as a P3 follow-up. I agree it does not block. The editor itself uses
  the width well: board 1871px and dock 516px at 2560.

### P3-10: reveal list options are 34px high

- **Where:** `inspector.tsx:436-456`.
- **What happens:** the grouped, searchable Select now lists 21 entries for a typical dungeon
  (10 rooms, 11 passages), each 34px high (`event-1440.json`). That is under the 44px touch minimum
  on tablets and phones. Mantine's default option size is used elsewhere too, so this is not new,
  but the list got longer.

### P3-11: map art notes for the table TV

These are non-blocking (`table-open-*.png`, `maps/*-crop1x.png`, `maps/table-*-crop.png`; 1920 × 1080
at DSF 2, calibrated 55″ 4K, about 84 device px per square):

- **Painted dungeon:** courses half a square high stay close in tone to the board grid. The grid
  is still easy to follow because it is continuous and the joints are staggered, but one softer
  step on the joints would make the grid the only regular pattern on the floor.
- **Ink:** walls are crisp. On a TV in a dim room the parchment is very bright, which is already
  listed as a "night ink" follow-up.
- **Painted forest ("Bosque cerrado", seed 9001):** the canopy covers much of the interior. The
  trail, clearings and ground between trees still read, and the grid shows on the ground.
- **Walls:** they read at a glance in every look.

### P3-12: documentation gap

`docs/design-system.md`'s Tabletop section does not yet describe the room key plates, the passage
keys or when they show (Fog, a selected door or event). Once P2-1 is settled, add a line there.

## What works (verified in the browser)

- **Full width from 48em.**
  - Library: 1382px at 1440, 1847px at 1920 and 2481px at 2560.
  - Editor: same widths. The dock is 420px at 1440, 452px at 1920 and 516px at 2560.
  - Phones keep their 16px gutters, and no page scrolls horizontally at 390, 820, 1440, 1920 or
    2560 (`width-*.json`).
- **Generator switches** (`gen-1440.json`):
  - Secret doors shows only for dungeon and crypt, with help.
  - Traps shows for dungeon, crypt and cave. The cave help is "…en los túneles".
  - Wide corridors shows only for dungeon. Forest and tavern show none.
  - Each help text is wired through `aria-describedby`, and switch rows are 44–54px.
- **Preview** (`gen-1440.json`, `gen-*-1440.png`):
  - Turning Traps on adds a triangle and a note to the caption, while the door count stays at 12.
  - One keyhole appears for one locked door.
  - Note seals show for every kind.
- **Caption:** it shows the variant (Nave con capillas, Cavernas, Con arroyo, Bosque cerrado) and
  the counts. It is `aria-live="polite"` and `aria-atomic="true"`.
- **Reroll and Previous:**
  - "Otra semilla" keeps focus, and "Anterior" restores the rolled seed.
  - Previous is disabled before any reroll.
  - The seed help is linked to its field.
- **Dialog behaviour:**
  - The Tab order wraps inside the dialog: Close, reroll, kinds, look, size, density, switches,
    seed, name, Cancel, Create.
  - Escape closes the dialog and focus returns to "Nueva escena".
  - A double click plus a third click on Create makes 1 scene and 1 upload.
  - Axe (wcag2a/aa, 21aa, 22aa) on the dialog: 0 violations.
- **Sticky preview:**
  - At 1440 × 1000 and 1280 × 640 the preview sticks under the dialog header, and reroll stays in
    view.
  - At 844 × 390 nothing sticks (`position: static`), and the focused seed field and Create are
    visible.
  - At 390 at 100 % no focused control is covered.
- **Passage keys:**
  - Select tool: 10 room plates and no passage keys.
  - Fog: P1–P11.
  - A selected door or event: P1–P11.
  - Back to Select: none (`board-1440.json`).
  - Plates are parchment with a sepia numeral and read on ink, on painted maps and on DM fog. They
    are DM-only and never show on the table screen.
- **Door inspector:** it names its rooms ("Sala 2 y Pasillo 2"), and the board shows P2 at the same
  time.
- **Event reveal list:**
  - Grouped as Salas (10) and Pasillos (11).
  - Searching "Pasillo 1" filters it, and picking a passage gives "Al activarlo revela el
    pasillo 1".
  - Axe on the dock: 0 violations.
- **Primary actions:** one per view (Crear la escena; Poner en la mesa; Nueva escena). No new pills
  or badges: the counts are prose, and the keys are map labels.
- **Themes and languages:** ES dark and EN light at 390 and 820 (150 %), and EN light editor with
  Fog at 820 / 150 %. Both catalogues have the same 543 tabletop keys.

## Scenarios tested

### Real browser (Playwright Chromium against the `dist-identity` build of this source)

- **Delivery spec:** `RYT_CAPTURE=1 npx playwright test tests/e2e/tabletop.spec.ts
  --project=identity-desktop --project=identity-tablet --project=identity-mobile
  --output=test-results/ui-review-063/run1`. Result: 15 passed. This run rebuilt `dist-identity`.
  I did not set `RYT_EVIDENCE`, so `docs/evidence/RYT-055/*.png` were not rewritten.
- **Throwaway review specs and config.** I wrote them under the gitignored
  `test-results/ui-review-063/spec/` (`review.spec.ts`, `review2.spec.ts`, `review3.spec.ts`,
  `review4.spec.ts`) and ran them with a config that serves the same `dist-identity` on port 4174.
  - First run: 14 passed and 4 failed on a bad locator in my own spec after its data was already
    saved. I fixed the spec and reran the affected screenshots.
  - Later runs: 5, 2 and 2 passed.
  - I deleted the specs from the repository afterwards. Copies are kept outside the repository in
    the evidence folder below.
- **What the throwaway specs covered:**
  - 1440 × 1000 ES dark:
    - generator per kind (switches, help, caption, seals, keyholes, traps);
    - seed help and clearing;
    - reroll and Previous with the keyboard;
    - sticky preview;
    - axe;
    - Escape and focus return;
    - double-click creation.
  - Board keys in Select, Fog, zoomed Fog, selected door and selected event, plus the door
    inspector text.
  - Event reveal list: groups, search, option height, pick and summary, axe.
  - Plate overlap against pins and props on 5 dungeon and 5 crypt seeds.
  - A token at a room centre.
  - Full width measured at 390, 820 (touch), 1440, 1920 and 2560.
  - 390 × 844 touch, ES dark and EN light, 100 % and 150 %:
    - Tab walk with covered-focus checks against the sticky preview and footer;
    - sub-44px targets (only the visually hidden radio inputs, whose labels are the 44px tiles);
    - scrolled captures, header overlap and label overflow;
    - seed typing.
  - 844 × 390 (landscape) and 1280 × 640: sticky rules.
  - 820 × 1180 touch EN light 150 %: generator and editor with Fog keys.
  - Stored maps: all five kinds in ink and painted, created through the UI. I extracted the
    uploaded WebP files (3008 × 1664 at 64px per square) and inspected them at half size and 1:1
    with a board-like grid.
  - Table screen at 1920 × 1080, DSF 2, calibrated 55″ 4K: forest, dungeon, crypt and cave in both
    looks, the latter three with fog reset to revealed and two tokens.
- All runs emulate `prefers-reduced-motion: reduce`.

### Screenshot and code inspection

- **Captures:** `docs/evidence/RYT-055/*-{desktop,tablet,mobile}.png` (generator, editor, measure)
  and the run1 captures.
- **Source:** `generator-dialog.tsx`, `board.tsx` (RoomNumbers), `inspector.tsx` (DoorFields,
  EventFields), `editor.tsx:1244-1246` (showPassages), `tabletop.css` (full width, sticky and
  low-height rules, plates, switch rows), `dungeon.ts` (note placement), `model.ts` (`roomNumbers`),
  and both i18n catalogues.
- **Older map renders:** I looked at the coordinator's renders under `scratchpad/maps/` for
  context. Some predate the last palette tweak, so I based the art judgement on my own
  extractions and the table screen captures.

## Untested states and limitations

- **Platforms:** Chromium emulation only. No iOS Safari, real TV or real miniatures, so the TV
  judgement is from captures at 4K density, not a physical table. No screen reader: the live
  caption and focus loss were read from the DOM.
- **Phone door inspector:** not exercised. Door taps never open the phone sheet by design, so the
  "reveals" sentence was checked at 1440 only.
- **Low windows ≥ 62em wide** (for example 1440 × 500): reasoned, not run. The low-height rule only
  applies below 62em, so a desktop preview taller than the window keeps reroll out of view until
  the end of the scroll.
- **Not run:** 200 % text, class themes other than Default, a hosted Supabase backend, offline,
  generation failure and upload failure paths ("El mapa no se guardó"), and the preview timing on
  large forests (80 × 80).
- **Not re-run:** `npm run check` and the full e2e suite. The delivery reports `npm run check`
  passing (295 tests) and the tabletop e2e at 15/15. I re-ran the 15 tabletop tests myself.
- **Earlier PASS:** the RYT-055–062 PASS applied to fingerprint `c36ff3f5…`. I did not re-review
  areas outside the RYT-063 paths (Player view, audio, story cards, areas) beyond the delivery spec
  passing.

## Evidence

- Review folder (outside the repository):
  `C:\Users\dmont\AppData\Local\Temp\claude\84e3d83304c88c7a\0c99e808-b9b4-4a01-b66f-295a20858619\scratchpad\uiux-ryt063\`
  - `shots/*.png` and `shots/*.json`: every capture and measurement named above.
  - `shots/maps/*`: stored maps with the grid, and table-screen crops.
  - `shots/map-*.webp`: the uploaded maps.
  - `run1/`: delivery spec captures.
  - `*.spec.ts` and `playwright.config.ts`: copies of the deleted throwaway specs.
  - `ryt063-run*.log`: run logs.
- Working copies of the same shots: `test-results/ui-review-063/shots/` (gitignored).

## Re-review request

Fix P2-1, P2-2 and P2-3, then ask for a focused re-review of:

- **P2-1:** room keys versus note pins, tokens and props on several generated dungeons and crypts,
  with Fog and with Select, at 1440 and 390.
- **P2-2:** focus after "Anterior" empties the history (Enter and Space).
- **P2-3:** seed editing by Backspace, select-all and typing, and blur when the field is empty, on
  desktop and a touch phone.

Please also take any of the P3s you address, especially P3-4 and P3-5 at 150 % and the caption
wording in P3-6. Record the new fingerprint.

This verdict applies only to fingerprint
`19938b99ce1f5a3cbafd81c837de6246f63c4963700d493cfa0f5055900cb876`.

## Re-review (round 2)

- Date: 2026-11-05
- Reviewed source fingerprint: `af30c23e8d5745d742255e42228625a9756fa88cdf971d06a51c1b9cbb45ab28`.
  I checked it with `node scripts/check-ui-review.mjs --fingerprint` before and after this round,
  and it did not change.
- Scope: P2-1, P2-2 and P2-3, the P3 fixes the coordinator listed, and anything those fixes touch.
  The files are `board.tsx` (RoomNumbers), `generator-dialog.tsx` (Previous, seed field, caption),
  `inspector.tsx` (door agreement, reveal options), `tabletop.css` (reroll row, sticky offsets,
  scroll padding, option height), both i18n catalogues and `docs/design-system.md`.

### Verdict: CHANGES_REQUIRED

P2-2 and P2-3 are fixed and verified in the browser. P2-1 is fixed for the cases it named: dungeon
entrance, goal and treasure rooms, and tokens on the centre square. The same defect remains in two
places:

- the crypt's secret ossuary, where this fix newly causes it;
- forest clearings.

So one narrower P2 remains (R2-1). The other P3 fixes work, with two small side effects at large
text on phones.

| Finding | Status | Verification |
| --- | --- | --- |
| P2-1 key plates under notes and over tokens | Partly fixed (see R2-1) | Browser, 1440 ES dark, 5 seeds per kind (25 maps) in Select and Fog. **Fixed:** in dungeons no room key is under a note pin on any seed (round 1: 5/5 dungeons). A token on a room's centre square is now 0 % covered (round 1: the plate replaced its initial) (`r2/shots/p21-*.json`, `p21-dungeon-fog-zoom.png`, `p21-tokens.json`). **Remains:** the crypt ossuary key is under its note in 2/5 crypts, and clearing keys are under their place notes in 2/5 forests. |
| P2-2 focus lost when "Anterior" disables itself | Fixed | Browser, 1440, keyboard. The empty Previous is focusable and has `aria-disabled="true"`, with no `disabled` attribute; Enter, Space and a pointer click are no-ops. After two rolls, Enter then Space take both back (the seed returns to the start), focus stays on "Semilla anterior" as it turns `aria-disabled="true"` again, and the next Tab goes to the first kind tile. The disabled look is opacity 0.6 with `cursor: not-allowed` (`r2/shots/p22-p23.json`, `p22-previous-empty.png`). |
| P2-3 seed field adds a 0 | Fixed | Browser, 1440 and 390 touch. Backspace to empty leaves "" and the caption keeps the last map; typing "77" gives "77". Ctrl+A, Backspace and "9001" give "9001". Emptying the field and leaving it restores 9001. "12345678" clamps to 999999 on blur, and "-5" is entered as "5" (`p22-p23.json`, `p23-phone.json`). |
| P3-4 Previous clipped at 150 % | Not fixed (see R2-3) | 390 at 150 %, ES and EN: the labels now wrap and the buttons are 84px tall, but "Anterior" and "Previous" are single words and still overflow (`labels[].clipped: true`; `p3-phone-scrolled-es-150.png` shows "Anterio"). |
| P3-5 sticky preview at 150 % | Mostly fixed (see R2-2, R2-3) | The preview no longer slides under the header (header bottom 115, preview top 121). No focused control ends under the footer. The only partial overlap left is the Semilla field, whose top 10px are under the preview (ES), and nothing is fully hidden (`p3-focus-150-*.json`). |
| P3-6 caption wording | Fixed, one leftover | "1 puerta cerrada con llave. Ninguna puerta secreta con esta semilla.", "2 puertas secretas.", "2 secret doors". Caves and forests still say "0 puertas" / "0 doors". |
| P3-7 Spanish agreement | Fixed | "Al abrirla se revelan Sala 1 y Pasillo 1." (`p21-tokens.json`) |
| P3-10 reveal option height | Fixed | The options are 44px (`p22-p23.json`). |
| P3-12 design-system note | Fixed | `docs/design-system.md` describes the corner key plates and passage keys. |
| P3-8, P3-9, P3-11 | Open, accepted follow-ups | The key size at the fitted zoom, the header measure on wide screens and the art notes are unchanged. |

### R2-1 (P2): generator notes still hide room keys where the note sits on the plate's square

- **Where:** `board.tsx` RoomNumbers places the plate at the top-left of the largest rect, or at
  its centre when that rect is under 2 squares in either direction. The plate is drawn under the
  pins in the top layer.
- **Crypt.** `dungeon.ts:1055-1058` puts the ossuary note at the chamber's top-left square
  (`{ key: 'ossuary', x: c.x, y: c.y }`), exactly where the plate now goes. In crypt seeds 4242 and
  7, the plate for room 6 is 100 % under "Nota: Osario", in Select and in Fog
  (`p21-crypt.json`, `p21-crypt-fog-zoom.png`). Round 1 measured 0 % for those two seeds, so the
  corner move caused this case.
- **Forest.** Clearing areas are one-square-high runs (`outdoor.ts:654`), so their plates fall back
  to the centre, where the place note sits. In seeds 4242 and 1, the plates for room 3 and room 2
  are 100 % under "Nota: Santuario" and "Nota: Estanque" (`p21-forest.json`). Forest fog is off by
  default, so this case matters less.
- **Passage keys in Fog.** One-square passages are centred, and the trap notes sit in the middle of
  passages. P10 is 64 % under "Nota: Trampa" (dungeon 9001), and P1 is 42 % under it (crypt 1).
- **Impact:**
  - The ossuary is the room behind the crypt's secret door. It is the room a DM is most likely to
    reveal with that door or an event.
  - The door inspector and the reveal list call it "Sala 6", but the board doesn't show the 6 in
    40 % of crypts.
  - It is the same defect as P2-1: the generator's own note hides a room key.
- **Suggested direction:** make the plate avoid squares that hold a pin. For example, try the
  top-left square, then top-right, then bottom-left, then bottom-right, then the centre, and skip
  any square with a note or event. Moving the ossuary note one square in would fix the crypt case,
  but avoiding pins also covers forests, passages and notes the DM places by hand.

### Other notes (P3, non-blocking)

- **R2-2, a sliver above the phone preview.** The sticky `top` is now `3rem + 2 × md` (80px at
  100 %, 120px at 150 %), but the header is 77px or 115px. A 4–6px strip between the header and the
  preview lets scrolled options show through, for example fragments of "Lugar"
  (`p3-phone-scrolled-es-100.png`, `p3-phone-scrolled-es-150.png`). Matching the header height
  exactly (the close button is 44px, not 3rem) would close it. On desktop the preview column has
  nothing behind it, so the 4px gap is invisible.
- **R2-3, the phone options window at 150 %.** With the reroll buttons at 84px, the space between
  the sticky preview and the footer shrinks to 142px (ES) and 184px (EN), down from about 200px in
  round 1. "Anterior" and "Previous" still clip. Two options: drop the icons and let the row wrap
  to two buttons, one per line, at large text, or release the sticky preview at large text.
- **R2-4, plates over props and corner tokens.** This is the cost of the corner anchor. Plates now
  cover part of the furniture against the top wall: beds 24 %, chests, braziers and urns 49 %,
  shelves up to 63 %, and tavern tables. A token on a room's top-left square is 49 % covered, and
  the "1" plate hides the Arquera's initial (`p21-tokens-crop.png`). The furniture stays
  recognisable. The pin-avoiding placement suggested for R2-1 could also skip squares with tokens.
- **R2-5, forest keys far from what they name.** In forests, the top-left of an organic area's
  largest rect can land under tree crowns or on the trail, for example 6 by the stream and 8 under
  the trees in the bottom-left (`p21-forest-fog-zoom.png`). Fog is off there by default.

### Tested (round 2)

- **Delivery spec:** `RYT_CAPTURE=1 npx playwright test tests/e2e/tabletop.spec.ts
  --project=identity-desktop --project=identity-tablet --project=identity-mobile
  --output=test-results/ui-review-063/r2run1`. Result: 15 passed. This run rebuilt `dist-identity`
  from this source. I did not set `RYT_EVIDENCE`.
- **Throwaway specs** under the gitignored `test-results/ui-review-063/spec/` (`r2.spec.ts`,
  `r2b.spec.ts`), served from that `dist-identity`:
  - First run: 12 passed and 1 timed out. The timeout was my own spec: Playwright refuses to click
    an `aria-disabled` button. I fixed it with `force: true`, and the test passed.
  - The second spec: 2 passed, after a locator fix in the spec.
  - I deleted the specs from the repository afterwards. Copies are in the evidence folder below.
- **What they covered:**
  - **Key plates:** 1440 × 1000 ES dark, all five kinds × 5 seeds (with traps where offered), in
    Select and Fog, measured against pins, props and doors, with zoomed captures.
  - **Tokens:** a token on the centre square, one on the top-left square and a large token, plus
    the door inspector with one and two areas.
  - **Previous and seed:**
    - Previous with Enter, Space and a pointer, before and after emptying the history;
    - seed editing with Backspace, select-all, blur, a long value and a negative value;
    - captions for dungeon, crypt and cave;
    - axe (wcag2a/aa, 21aa, 22aa) on the dialog: 0 violations;
    - reveal list option heights.
  - **Desktop sticky preview:** 1440 × 1000 and 1280 × 640. The preview sits 4px below the header,
    and reroll stays in view.
  - **Phone, 390 × 844 touch,** ES dark and EN light at 100 % and 150 %:
    - reroll label overflow and height;
    - a Tab walk measuring each focused control against the sticky preview and footer;
    - header to preview offset and the options window;
    - scrolled captures;
    - seed Backspace on touch;
    - board plates zoomed in.
- **Screenshots and code:** the diff areas listed in the scope and `dungeon.ts` / `outdoor.ts` note
  placement.

### Limitations (round 2)

- **Not re-run:** the round 1 table-TV judgement, the wide-screen measurements (1920 / 2560) and the
  stored-map extraction. No change in this round touches the painter or the full-width rule.
- **The earlier limitations still apply:** Chromium emulation only, no screen reader, no 200 % text,
  only the Default class theme, and no hosted backend.
- **Not run myself:** `npm run check`. The coordinator reports it passing (295 tests, build).
- **Working copies:** the round 1 copies under `test-results/ui-review-063/` were cleared by a
  later default Playwright run. The round 1 evidence stays in the review folder in the scratchpad.

### Evidence (round 2)

- Review folder:
  `C:\Users\dmont\AppData\Local\Temp\claude\84e3d83304c88c7a\0c99e808-b9b4-4a01-b66f-295a20858619\scratchpad\uiux-ryt063\r2\`
  - `shots/*.json`, `shots/*.png`: `p21-*`, `p22-p23`, `p23-phone`, `p3-*`, `reg-*`.
  - `run1/`: the delivery spec captures.
  - `r2.spec.ts`, `r2b.spec.ts`, `playwright.config.ts`: copies of the deleted specs.
  - `../r2-run1.log`, `../r2-run2.log`: the run logs.

### Re-review request

Fix R2-1, then ask for a focused check of room keys against note pins on crypts (seeds 4242 and 7),
forests (4242 and 1) and passage keys in Fog (dungeon 9001, crypt 1). If R2-2 and R2-3 are
addressed too, check the phone sticky preview again at 100 % and 150 %.

This verdict applies only to fingerprint
`af30c23e8d5745d742255e42228625a9756fa88cdf971d06a51c1b9cbb45ab28`.

## Re-review (round 3)

- Date: 2026-11-05
- Reviewed source fingerprint: `2cdf9f3c86d28068e27554515a913c2885fdd2a9591a6dd1ab17c4c8adc6715b`.
  I checked it with `node scripts/check-ui-review.mjs --fingerprint` before and after this round,
  and it did not change.
- Scope:
  - R2-1: key placement in `board.tsx` RoomNumbers, which now takes the board items and picks the
    cheapest of four corners plus the centre, or for one-square passages the centre and both ends.
  - R2-2: the measured header height, `--tt-modal-head`, set by a ResizeObserver in
    `generator-dialog.tsx`.
  - R2-3: the reroll glyphs dropped under 30em.
  - The caption without a door count for caves and forests.
  - Anything those changes touch: room keys over props, doors and tokens, the sticky preview at
    desktop and tablet widths, and the round 2 fixes for P2-2 and P2-3.

### Verdict: PASS

No P1 or P2 findings remain. R2-1 is fixed for every seed it named and for a wider sample. R2-2 and
R2-3 are fixed. Two new P3 side effects of the passage-key search remain (R3-1, R3-2). They show only
while Fog is on or a door or event is selected, and they do not hide anything the DM can't see in
Select.

| Finding | Status | Verification |
| --- | --- | --- |
| R2-1 room keys under generator notes | Fixed | Browser, 1440 ES dark, all five kinds × 7 seeds (4242, 1, 7, 42, 9001, 77, 2026), traps on where offered, in Select and Fog. **Room keys:** 0 of 35 maps have a room key under a note pin, in Select and in Fog. Crypts 4242 and 7 now put room 6 at a free corner (top-right), with the Osario note at top-left (`r3/shots/p21-crypt-fog-zoom.png`). Forests 4242 and 1: 0 under pins. Plates over props dropped from most rooms to 1 map in Select (`p21-*.json`). **Tokens:** a token on the centre square, a token on the top-left square and a large token are all 0 % covered; the key moves to the free top-right corner (`p21-tokens.json`). **Passage keys in Fog:** dungeon 9001's P10 and P12 are no longer under a trap note, and P10 moves to the passage end. Crypt 1's P1 is still 45 % under its trap note (see R3-2). |
| R2-2 gap above the phone preview | Fixed | 390 touch, ES and EN, 100 % and 150 %: the header bottom equals the preview top (77/77 and 115/115), with no visible strip. Desktop 1440 × 1000 is 127/127, and 1280 × 640 is 109/109 (`p3-phone-*.json`, `reg-desktop.json`, `p3-phone-scrolled-es-150.png`). |
| R2-3 Previous clipped and the options window at 150 % | Fixed / improved | At 390 and 150 %, "Anterior" and "Previous" are no longer clipped, because the glyphs are hidden under 30em. The buttons are 84px tall in ES (two lines for "Otra semilla") and 60px in EN. The options window between the preview and the footer is 158px in ES and 214px in EN (142px and 184px in round 2). No focused control is fully hidden. The kind and look tiles and the Semilla field have 1–9px under the preview in ES at 150 %, which passes 2.4.11 (`p3-focus-150-*.json`). |
| P3-6 "0 puertas" in caves and forests | Fixed | "Cavernas · 47 × 26 casillas · 7 áreas · 16 objetos. 3 notas del DM." |
| P2-2 and P2-3 (round 2 fixes) | Still fixed | Focus stays on "Semilla anterior" with `aria-disabled="true"` after the history empties. The seed field gives "77" after Backspace and touch input, and is restored on blur. Axe on the dialog: 0. Reveal options are 44px (`p22-p23.json`, `p23-phone.json`). |

### Remaining notes (P3, non-blocking)

- **R3-1: passage keys cover doors at the ends of passages (Fog, or a door or event selected).**
  - **What happens:** when a passage centre holds a note, the key moves to the passage end, the
    square that touches the room's door. Doors cost 0 in the search. In 6 of 14 dungeons and
    crypts, at least one passage key covers about 78 % of a closed door's drawn bar: dungeon seeds
    1, 9001, 77 and 2026, and crypt seeds 9001 and 2026. Two of those doors are secret, so their
    dashed outline is mostly hidden (`close-dungeon-9001-P10.png`, `close-dungeon-77-P12.png`,
    `close-*.json`).
  - **Why it does not block:** the doors stay tappable and the two ends of each bar still show.
    Select hides passage keys, so every door is fully visible there.
  - **When the door is selected and opened:** it swings clear of the key. Its selection ring
    shows beside the plate (`close-dungeon-9001-selected-door.png`).
  - **Suggestion:** give doors a cost in the search, and try the second square of a passage before
    the square at its end.
- **R3-2: a passage key can still sit partly under a pin.** All three candidates of a short passage
  can be taken. In crypt 1, P1 is 45 % under its trap note, and the pin covers the "P", so the dashed
  plate reads "1" (`close-crypt-1-P1.png`). Another candidate square would help: one step in from
  each end, or the cell beside the passage.
- **R3-3:** keys now move when the DM drags a token into a room's corner. That is consistent with
  the rule, but it can surprise. It is worth one line in `design-system.md`, which says "top-left
  corner" while the code now picks the first free corner.
- **Still open, as accepted follow-ups:** P3-8 (key size at the fitted zoom), P3-9 (header measure
  on wide screens) and P3-11 (art notes). The options window at 150 % on phones (158px in ES) is
  usable, but stays tight.

### Tested (round 3)

- **Delivery spec:** `RYT_CAPTURE=1 npx playwright test tests/e2e/tabletop.spec.ts
  --project=identity-desktop --project=identity-tablet --project=identity-mobile
  --output=test-results/ui-review-063/r3run1`. Result: 15 passed. This run rebuilt `dist-identity`
  from this source. I did not set `RYT_EVIDENCE`.
- **Throwaway specs** under the gitignored `test-results/ui-review-063/spec/`, served from that
  `dist-identity`: the round 2 specs reused with 7 seeds, plus `r3.spec.ts` and `r3b.spec.ts`.
  - The round 2 specs: 15 passed.
  - `r3.spec.ts` (close-ups at DSF 2 of the keys near doors and pins: dungeon 9001 and 77 in Fog,
    crypt 1 in Fog, crypt 7 and tavern 4242 in Select): 5 passed.
  - `r3b.spec.ts` (selecting and opening the door under P10): 1 passed.
  - I deleted the specs from the repository afterwards. Copies are in the evidence folder below.
- **Screenshots inspected:** the refreshed `docs/evidence/RYT-055/generator-tablet.png`, which shows
  no gap under the header at 820 px, plus every capture named above.

### Limitations (round 3)

- **Same as before:** Chromium emulation only, no screen reader, no 200 % text, only the Default
  class theme, and no hosted backend.
- **Not run myself:** `npm run check`. The coordinator reports it passing (295 tests, build).
- **Not re-run:** the table-TV and wide-screen checks from round 1. Nothing in rounds 2 and 3
  touches the painter or the full-width rule.

### Evidence (round 3)

- Review folder:
  `C:\Users\dmont\AppData\Local\Temp\claude\84e3d83304c88c7a\0c99e808-b9b4-4a01-b66f-295a20858619\scratchpad\uiux-ryt063\r3\`
  - `shots/`: `p21-*`, `close-*`, `selected-door-9001.json`, `p22-p23.json`, `p3-*`, `reg-desktop.json`.
  - `run1/`: the delivery spec captures.
  - `*.spec.ts`, `playwright.config.ts`: copies of the deleted specs.
  - `../r3-run1.log`, `../r3-run2.log`: the run logs.

This PASS applies only to fingerprint
`2cdf9f3c86d28068e27554515a913c2885fdd2a9591a6dd1ab17c4c8adc6715b`.
