# ui-ux review: RYT-055–062 tabletop

- Tickets: RYT-055–062 "Tabletop" (ADR `docs/decisions/032-tabletop.md`, analysis
  `docs/tabletop-design.md`, design flow and Impeccable fixes in `docs/evidence/RYT-055/design-flow.md`
  section 3, checks in `docs/evidence/RYT-055/validation.md`)
- Reviewer: `ui-ux` (role `.codex/agents/ui-ux.toml`, applied by an independent agent)
- Date: 2026-11-05
- Reviewed source fingerprint: `6090be7ea949f18d85d31c5f0c6257b1bd2175ae4144ef1c875ec26384e47d35`.
  I checked it with `node scripts/check-ui-review.mjs --fingerprint` before and after the review, and
  it did not change.
- Base: `main` at 8a862ac plus the uncommitted RYT-055–062 working tree

## Verdict: CHANGES_REQUIRED

The direction holds up in the browser:

- The board is the hero of the page.
- The kit is a real radio group of engraved keys, with arrows, Home, End and wrap.
- Instruments use the project's tiles, dials and switches instead of pills.
- The DM fog hatch keeps the map readable.
- The table screen has no chrome.
- Light and dark themes, Spanish and English, axe, reduced motion and most 44px targets pass.

Eight concrete issues remain. One of them blocks the delivery:

- **Blocking (P1):** compound writes drop the editor runner's callbacks. Opening a generated door
  with a failing write gives no error and no announcement, and the room still gets revealed.
- **Keyboard:** the board makes every item a Tab stop. That puts Undo, Retry, the panel tabs and the
  inspector 44–53 Tabs away.
- **Layout:** the Area strip breaks on phones, and on the compact tablet at 150% text the panel tabs
  cover the tool kit.
- **Dialogs and table screen:** the generator preview is blank when the dialog opens, focus is lost
  after the creation dialogs close, the SVG focus ring fails contrast on the default map look, and
  long story cards are clipped on the table screen with no warning.

## Findings

### P1-1: two writes in a row drop the first one's success and failure handling (door with rooms)

- Paths: `src/features/tabletop/ui/editor.tsx:256-276` (`run` passes per-call `onSuccess`/`onError`
  to `action.mutate`), `:583-611` (`activate`: `put` for the door, then one `run` per joined room in
  the same tick), `src/features/tabletop/api.ts:109-142` (one shared `useMutation`). In TanStack Query,
  the callbacks passed to `mutate()` fire only for the latest call. The door put's callbacks are
  dropped as soon as the fog write starts.
- Viewports, themes, languages: 390, 820 and 1440px; dark; Spanish. The cause does not depend on the
  viewport, theme or language.
- Reproduction: generate a dungeon (seed 4242, 47 × 26). Every door joins rooms (18 of 18). Focus a
  closed door and press Enter, or tap it.
  - Success: the door opens and the room is revealed, but the polite live region stays empty. A door
    without rooms in the blank scene announces "Puerta abierta." (`r8b2-*.json`).
  - Failure (`put_tabletop_items` fails once): the door rolls back to "Puerta cerrada", but no
    `role="alert"` banner appears (0 alerts). The fog write still succeeds (2 fog operations), so the
    room is revealed on the table while the door reads closed (`r8b-*.json`, `r8b-door-fail-*.png`).
- Code inspection, not browser-tested:
  - Offline, both writes fail, and only the fog write's `onError` builds the banner. "Reintentar"
    then replays only the fog reveal, never the door.
  - The same loss affects any write that follows another before it settles. Examples are an Undo
    notice after a Delete, and nudges with the arrow keys held down.
- Impact: this breaks the RYT-055 acceptance criterion "a failed write shows over the board with Try
  again". It also reopens the Impeccable P1 "failed writes were silent", which `design-flow.md`
  reports as fixed. The case is the most common board action on generated maps. A failure leaves
  players seeing a revealed room behind a closed door, and screen reader users never hear that the
  door opened.
- Fix direction:
  - Make each attempt observe its own result. For example, use `mutateAsync` in `run` with
    try/catch, a fresh mutation per action, or the mutation-level callbacks keyed by variables.
  - Send the door state and its room reveals as one action, either one RPC or a sequential chain
    where a failed door skips the reveal.
  - Have Retry replay the whole compound action.
  - Add an e2e case: fail the door write on a generated door and assert the banner, the unchanged fog
    and the announcement.

### P2-2: every board item is a Tab stop, ahead of Undo, Retry, the panel tabs and the inspector

- Paths: `src/features/tabletop/ui/board.tsx:282-283`, `:384-385`, `:460-461` and `:598-599`
  (`tabIndex={0}` on area seals, props, doors and pins), `:718-731` (token buttons), `:451-454`
  (door names carry no position). In `editor.tsx`, the viewport is at `:1211-1254`, then the banners
  (`:1255-1290`), the zoom keys (`:1291-1316`), the portrait kit row (`:1321-1323`) and the dock
  (`:1325-1354`). `:612-614` (Enter selects without moving focus or announcing).
- Viewports: 390, 820 and 1440px; dark; Spanish.
- Measurements, keyboard only, generated dungeon (`r1-*.json`):
  - There are 44 tabbable items inside the map: 18 doors, all named "Puerta cerrada", and 26 props.
  - From the editor title, the zoom keys are at Tab 48–49. The first panel tab is at Tab 52.
  - On the 820px tablet, the tool kit row is also behind all 44 items.
  - Enter on a door opens the inspector beside the board, but focus stays on the door. Reaching the
    inspector takes 52 (desktop) or 53 (tablet) Tabs.
  - After Delete, focus correctly returns to the board, but "Deshacer" is 44 Tabs away at every
    width (`r1-undo-*.png`).
  - Even in the six-item blank scene, Enter on a token leaves the live region empty. "Mover a una
    casilla" is 18–19 Tabs away (`r8e-*.json`).
- Impact: the board cursor already reaches every square, and Enter acts there. The per-item Tab stops
  add a long, unlabelled run of identical names that a keyboard or screen reader user has to cross
  for every recovery action (Undo, Retry), for the inspector, and on tablets for the tools. Screen
  reader users get no confirmation that the inspector opened.
- Fix direction:
  - Make the board one Tab stop: roving `tabIndex=-1` on items, which stay reachable through the
    cursor (whose announcement already names the item) or through arrows between items.
  - Alternatively, place the banners, zoom keys and dock before the items in DOM order.
  - On Enter, move focus to the inspector heading (`tabIndex=-1`) or announce "Selección: Centinela".
  - Add the room or square to item names ("Puerta cerrada, sala 4").

### P2-3: the Area option strip breaks the phone layout and hides its own action

- Paths: `src/features/tabletop/ui/tabletop.css:1753-1773` (phone strip: `nowrap`, the hint is
  `flex: 1 1 auto; min-width: 0`), `:244-255` (`.tt-strip` is not positioned, so the visually hidden
  tile legends, `position: absolute`, escape its scroller), `editor.tsx:929-995` (area strip content).
- Phone, 390px, at 100% text in both ES dark and EN light (`r8c-mobile.json`, `r10-mobile.json`):
  - The page gains horizontal scroll as soon as Area is chosen: `scrollWidth` 901 at 390, and the
    page can be scrolled 400px into an empty void (`r10-area-scrolled-right-mobile.png`). The likely
    cause is the escaped hidden legends.
  - Before the first tap, the strip is 274px tall. The hint is squeezed to 0px wide and 260px tall at
    x≈1,874 inside a 1,909px row, so the strip is an empty box. The board drops to 282px, from about
    465px (`r1-area-strip-mobile.png`).
  - After the tap, the caught count and "Dejar en el mapa" / "Borrar" sit at x≈1,874–2,018 in the
    scrolling row. They are out of view with no cue, and only the shape tiles show
    (`r2-area-preview-light-en-mobile.png`, `r8c-area-after-tap-mobile.png`).
  - At 150% text, page overflow grows to 880px.
- Wider screens:
  - At 100%, the strip is 274–297px tall on 820 and 1440px: three rows of tiles above the board.
  - At 150%, "Dejar en el mapa" is clipped inside the strip and needs an inner scroll (desktop
    scrollHeight 596 against 414 visible; tablet 479 against 344).
  - With the inspector open on the 820px tablet, the strip is clipped at 192px even at 100%, which
    hides Radiant, Force, the caught count and the action
    (`r2-area-preview-light-en-tablet.png`).
- Impact: the "one scrolling row so the board keeps its height" claim fails for the tool that needs
  it most. On a phone, the main action of the Area tool cannot be seen. The e2e reaches it only
  because Playwright scrolls to it, and its overflow audit runs only with Select.
- Fix direction:
  - Add `position: relative` (or `contain: paint`) to `.tt-strip`.
  - Keep the caught count and Keep/Clear outside the scrolling part: pinned at the strip's end, or
    in a small bar over the board once a preview exists.
  - Give the phone hint `flex: none` and a max width, or drop it once tiles are shown.
  - Collapse the damage tiles behind one "Daño: Fuego" control (a menu or sheet) so the strip stays
    one row on tablets and desktop.
  - Run the overflow audit with Area and Fog active.

### P2-4: at 150% text on the compact tablet, the panel tabs cover the tool kit

- Paths: `tabletop.css:118-149` (`.is-compact` grid rows `minmax(0, 1fr) auto`, sheet
  `max-height: 38dvh`), `:342-347` (board `min-height: 12rem`, 288px at 150%), `:111-117`.
- Viewport: 820px, html font-size 150%, a token selected (inspector open), dark Spanish.
- Measured (`r11-tablet.json`): the kit row spans 582–674px and the tabs row 590–662px.
  `elementFromPoint` on the Select key returns a `tt-tab`. The kit keys cannot be tapped
  (`r3-inspector-150-tablet.png`).
- Impact: with large text, the DM cannot switch tools by touch while anything is selected. That is
  the normal state after tapping a token.
- Fix direction: let the stage keep its content height (do not let `minmax(0, 1fr)` squeeze it below
  board + kit). Alternatively, cap the sheet in `em`, or collapse the sheet when the board would go
  under its minimum. Re-check at 820px at 100% and 150% with the inspector and the Area strip.

### P2-5: the generator preview is blank when the dialog opens

- Path: `src/features/tabletop/ui/generator-dialog.tsx:77-88`. The paint effect returns when
  `preview.current` is still null at mount. It runs again only when `map` or `opened` changes.
- Viewports: 390, 820 and 1440px, dark Spanish.
- Reproduction: Nueva escena → Generar un mapa, then wait 2s.
- Observed: the canvas stays 300 × 150 and transparent. Only the SVG doors and props float over an
  empty frame (`r8a-generator-open-*.png`). Choosing any option, such as Cripta, paints it (1128 ×
  624, `r8a-*.json`).
- Impact: the live preview is the hero of the generator. Its first impression is a broken map. The
  delivery spec hides this because it types a seed before capturing.
- Fix direction: paint from a callback ref or a layout effect that depends on the canvas element, or
  re-run when the Modal content mounts. Assert painted pixels in the e2e before changing options.

### P2-6: focus is lost after closing the Blank, Upload or Generate dialog

- Paths: `src/features/tabletop/ui/library.tsx:121-161`. The choice card calls `setFlow(key)`. The
  "Nueva escena" modal unmounts its card, and the next dialog's `onClose` only calls `setFlow(null)`.
- Viewports: 390, 820 and 1440px; light and dark.
- Reproduction: focus "Nueva escena", press Enter, Enter on "Cuadrícula en blanco", then Escape. The
  same happens after Escape in the generator.
- Observed: `document.activeElement` is `BODY` at every width (`r8d-*.json`, `r3-*.json`). Closing
  the first chooser with Escape correctly returns focus to "Nueva escena".
- Code inspection: Cancel uses the same `onClose`. Upload shares the path.
- Impact: keyboard and screen reader users are sent to the top of the document after backing out of
  scene creation.
- Fix direction: keep a ref to "Nueva escena" and focus it when a flow closes without creating.
  Alternatively, pass `returnFocus` or an `onExitTransitionEnd` that targets it.

### P2-7: the focus ring on map items fails contrast on the default Ink map

- Paths: `tabletop.css:491-503` (doors, props, pins and area seals get a gold stroke on their hit
  shape and no halo), `:418-426` (cursor). Compare `:571-576`: tokens get a dark 6px halo and pass.
- Viewports: 390, 820 and 1440px, dark theme (the default), generated Ink-on-parchment dungeon (the
  generator's default look).
- Observed at device scale 2 (`r9-door-ring-*.png`, `r1-door-focus-*.png`, `r1-cursor-zoom-*.png`):
  the ring is a faint amber outline. `--app-focus` #F6C478 against the floor #F2E6CC is about 1.3:1,
  and against the ground #E6D7B8 about 1.1:1. WCAG 1.4.11 asks 3:1 for focus indicators. The token
  ring with its halo is clear (`r9-token-ring-*.png`). In the light theme, the focus colour #844112
  passes.
- Impact: in the default theme and look, keyboard users can barely see which door or prop has focus.
  This undercuts the "focus rings stay visible at fit zoom" fix.
- Fix direction: give the SVG focus outline the token treatment, a dark halo stroke under the gold
  one (`paint-order` or a second stroke), and apply the same to the board cursor.

### P2-8: long story cards are clipped on the table screen with no warning

- Path: `tabletop.css:1660-1676` (`.tt-story-plate { max-height: 86vh; overflow: hidden }`, with type
  sized from the square).
- Viewports: 1440 × 1000 window; 820 and 390 for reference; light English.
- Reproduction: show a card with nine short paragraphs (about 1,300 characters; the editor allows
  4,000).
- Observed: only the title and three paragraphs show (scrollHeight 2,160 against 860 visible). There
  is no fade, "continues" mark or warning in the Story panel (`r4-long-card-light-en-*.png`).
- Impact: players at the table silently miss two thirds of the card the DM chose to show.
- Fix direction: scale the type down to fit, down to a readable floor, or page the card. In the
  editor, warn when a card is longer than the table can show at the current calibration.

### P3-9: desktop editor runs below the fold

- Path: `tabletop.css:10-20` (`--tt-chrome: 9.5rem`).
- Observed at 1440 × 1000: the editor bottom is at 1,016px, the page scrolls 52px, and the "Encajar
  el mapa" key ends at 1,008px (`r8c-desktop.json`, `r2-editor-light-en-desktop.png`). The board
  captures the wheel, so the DM must scroll from outside the board to see its bottom.

### P3-10: phone tray

- Paths: `kit.tsx:73`, `:87-119`; `tabletop.css:224-228`.
- A tool chosen from "Más" (Nota, Evento, Objeto, Señalar) leaves the radiogroup with no checked
  radio. The "More" button keeps its name "Más herramientas" while it shows "Nota" (`r2-*.json`).
- At 150% text, "Elegir", "Medir", "Niebla" and "Puerta" overflow their keys and run together
  (`r3-editor-150-mobile.png`).

### P3-11: two close buttons in the phone inspector sheet

- Paths: `editor.tsx:1356-1372` with `inspector.tsx:60-67`.
- The drawer shows "Cerrar" and "Cerrar la selección" one under the other
  (`r2-inspector-light-en-mobile.png`). Hide the inspector's own close inside the drawer.

### P3-12: table screen status

- Paths: `table-screen.tsx:210-218` and `:183-194`.
- The mute toggle changes both its label and `aria-pressed`. When muted, it reads "Sound on" /
  "Activar sonido", pressed, which sounds like sound is on. Keep a constant "Silenciar" with
  `aria-pressed`, or drop `aria-pressed` and keep the changing label.
- Polling, which is a working state, shows the WifiOff glyph.
- On a phone-sized window the status corner sits over the story text
  (`r4-start-light-en-mobile.png`). This is a minor case for a TV surface.

### P3-13: panel tabs are tabs in name only

- Path: `editor.tsx:1327-1344`, `:1346`.
- `role="tab"` has no arrow-key movement and no `aria-controls` / `aria-labelledby`. The tabpanel has
  no name, and every tab is a separate Tab stop. Clicking the active tab closes the panel.
- Either use the Mantine `Tabs` keyboard model the design system names, or present them as
  disclosure buttons (`aria-expanded`).

### P3-14: copy and small consistency issues

- Door state tiles are lowercase ("cerrada / abierta / con llave", "closed / open / locked"). They
  reuse the in-sentence strings `tabletop-es.ts:132-134` and `tabletop-en.ts:128-130`. A door's
  inspector reads "Puerta" over "Puerta" (`inspector.tsx:45-50`, `r1-door-inspector-*.png`).
- The library summary shows "peanas de 25.4 mm" in Spanish (`library.tsx:58-66`). It needs
  `Intl.NumberFormat`: "25,4 mm".
- The "Otro" tile for diagonal and base cannot be chosen; clicking it does nothing
  (`calibration.tsx:61`, `:119`; `r8d-*.json`). Make it focus the exact field, or drop the tile.
- Density tiles have no check seal while every other tile group in the generator has one
  (`generator-dialog.tsx:271-281`).
- At 150% on phones, the calibration fieldset legend wraps across its border
  (`r3-calibration-150-mobile.png`).
- Code inspection: the Story panel gives every card row a filled "Mostrar en la mesa" button
  (`panels.tsx:388-397`). With several cards, that is several primary buttons in one panel. Use the
  subtle or light variant and keep "Quitar de la mesa" as the only emphasised state.

### P3-15: tool key letters

- Path: `tabletop.css:229-237`.
- The letters are 10px, below the 12px label minimum. In the light theme, #664F3A at 75% opacity is
  about 4.0:1 on the surface. They are the only visible cue for the shortcuts, so they should meet
  4.5:1.

## What works (verified in the browser)

- **Kit:**
  - One radiogroup; arrows move and select with wrap; Home and End work; Escape returns to Elegir
    (all widths).
  - Letters do nothing while focus is in the app header, and work inside the editor. They also work
    when focus is on `<body>`, which is allowed by the code.
  - The phone "Paneles" and "Más" menus open, take arrows, and return focus on Escape.
- **Board cursor:**
  - The square cursor appears with `:focus-visible`, moves with the arrows, and is announced
    ("Casilla 26, 15", and "Casilla x, y: name" on an item).
  - Enter acts with the current tool: ping, measure waypoint, door toggle. A "Mover a una casilla"
    move by cursor passes in the delivery spec.
- **Recovery for single writes:**
  - A failed token nudge shows the `role="alert"` banner with "Try again" (4 Tabs from the token) and
    recovers on retry.
  - Delete offers Undo and focus returns to the board.
- **Themes and languages:** dark ES and light EN on the editor, inspector, area preview, library,
  calibration, table screen and Player view. No untranslated interface text was seen in English.
  The table screen stays dark in the light theme by design.
- **Axe** (wcag2a/aa, 21aa): zero violations on the editor without the map in EN light (3 widths),
  the inspector dock, the table screen with a story card (EN light, 3 widths) and the Player view.
  The delivery spec also covers the library, calibration, generator, audio and editor in ES dark.
- **Reduced motion:** the ping animation is `none` and key transitions are near 0s with `reduce`.
  Without it they are `tt-ping` and 120ms.
- **Table screen:** the start dialog autofocuses "Start" with a visible ring, and Enter starts the
  screen. The status corner, the ruler, the uncalibrated state ("Sin configurar: el mapa llena la
  pantalla") and "nothing on the table" all render. The calibrated token is about 69px at 32″ 1080p
  (spec).
- **Player view:** opaque fog, the private measure ("20 pies"), and the story sheet, which opens with
  focus on Close and closes with Escape. Covered in dark ES (3 widths) and light EN.
- **Layout and widgets:**
  - Room numerals, DM hatch and door seals read on the dungeon.
  - The compact tablet keeps the board full width, with the kit row and tabs under it, at 100% text.
  - The phone hides the bottom bar and footer.
  - No pills or chips in the kit, strip or inspector; shapes, damage, colours and sizes are the
    bestiary tiles and size scale.
- **Spec run:** the delivery spec passes 15 of 15 at 390, 820 and 1440px.

## Scenarios tested

Browser-tested (Chromium, Playwright, the repo's identity, combat and tabletop fixtures against the
`dist-identity` build of this source):

1. `RYT_CAPTURE=1 npx playwright test tests/e2e/tabletop.spec.ts --project=identity-mobile
   --project=identity-tablet --project=identity-desktop --workers=6
   --output=test-results/ui-review-tabletop/run1`. Result: 15 passed. I did not set `RYT_EVIDENCE`,
   so `docs/evidence/RYT-055/*.png` were not rewritten.
2. Throwaway review specs and a config under the gitignored `test-results/ui-review-tabletop/`. They
   ran at 390 × 844 (touch), 820 × 1180 (touch) and 1440 × 1000. I deleted them after the review.
   They covered:
   - the generated dungeon: Tab walk, cursor, door and prop focus, Enter on a door, Delete and Undo,
     letter scope, Fog and Area strips;
   - the blank scene in EN light: editor, inspector (phone drawer), failure banner and retry, Area
     preview, the "Más" menu, axe;
   - 150% text: editor, Area, measure, inspector, library, chooser, generator, calibration;
   - the table screen: start, Escape, long card, status focus, ruler, mute, axe, uncalibrated,
     nothing on the table;
   - the Player view: dark ES, light EN, story sheet, measure;
   - library focus return, plate menu, the "Otro" tile;
   - motion with and without reduced motion;
   - generator preview pixels on open;
   - a generated door with rooms, success and failed write, with a control door;
   - the phone Area strip geometry and page overflow at 100% and 150%; the desktop fold;
   - token Enter;
   - focus rings at device scale 2;
   - the compact tablet overlap at 150%;
   - kit arrows and phone menu Escape.

Screenshot inspection: every capture listed under Evidence, and the spec's own `generator`, `editor`,
`measure`, `table`, `audio` and `event` captures at all three widths.

Code inspection: `editor.tsx`, `board.tsx`, `kit.tsx`, `tools.ts`, `inspector.tsx`, `panels.tsx`,
`library.tsx`, `calibration.tsx`, `generator-dialog.tsx`, `table-screen.tsx`, `overlays.tsx`,
`pages.tsx`, `viewport.ts`, `tabletop.css`, `api.ts`, both tabletop catalogs, the router and
module-catalog diffs, and the delivery spec and its fixture.

## Untested states and limitations

- Chromium emulation only. iOS Safari, Firefox, real touch devices (including real pinch and
  two-finger pan), a TV lying on the table, Chromecast, VoiceOver, TalkBack and NVDA were not tested.
  I checked announcements by reading the live region, not with a screen reader.
- No hosted Supabase, Realtime or Storage. The fixtures stand in for the RPCs, the signed URLs and
  the live row. I did not test offline mode in the browser; the offline Retry behaviour in P1-1
  comes from code inspection.
- Not exercised: map upload and grid alignment, audio upload, track playback, audible output, the
  Scene panel nudges, scene deletion, the cone, line and cube rotation keys, fog brush and box by
  pointer, the active-turn ring (no active combatant was linked), defeated tokens, and Player
  previews from a DM account.
- Only 150% root font size was tested, not 200% or browser zoom. Only the Default class theme was
  tested.
- I did not run `npm run check` or the full e2e suite.

## Evidence

The role allows only this report in the repository, so screenshots and logs are in the review
session's temporary scratchpad:
`C:\Users\dmont\AppData\Local\Temp\claude\84e3d83304c88c7a\0c99e808-b9b4-4a01-b66f-295a20858619\scratchpad\uiux-ryt055\`

- `run1/…` and `ui-review-run1.log`: the delivery spec run and its captures.
- P1-1: `shots/r8b-*.json`, `shots/r8b2-*.json`, `shots/r8b-door-fail-*.png`.
- P2-2: `shots/r1-*.json` (the full Tab walk), `shots/r1-undo-*.png`,
  `shots/r1-door-inspector-*.png`, `shots/r8e-*.json`.
- P2-3: `shots/r1-area-strip-*.png`, `shots/r2-area-*.png`, `shots/r8c-*.{png,json}`,
  `shots/r10-*.{png,json}`, `shots/r3-area-150-*.png`.
- P2-4: `shots/r3-inspector-150-tablet.png`, `shots/r11-tablet.json`.
- P2-5: `shots/r8a-*.{png,json}`.
- P2-6: `shots/r8d-*.json`, `shots/r3-*.json`.
- P2-7: `shots/r9-*.png`, `shots/r1-door-focus-*.png`, `shots/r1-cursor-zoom-*.png`.
- P2-8: `shots/r4-long-card-light-en-*.png`, `shots/r4-*.json`.
- Other states: `shots/r2-editor-light-en-*.png`, `r2-inspector-light-en-*.png`,
  `r2-failure-light-en-*.png`, `r2-more-menu-mobile.png`, `r2-note-tool-mobile.png`,
  `r3-*-150-*.png`, `r4-start-light-en-*.png`, `r4-ruler-*.png`, `r4b-*.png`, `r5-*.png`,
  `r5b-*.png`, `r6-*.png`, `r8d-*.png`, `r7-desktop.json`, `r12-*.json`.

## Re-review request

After fixing P1-1 and P2-2 to P2-8, ask for a focused re-review. Fix the P3s if accepted. The
re-review should cover:

- a generated door opened with a failing door write, a failing fog write and offline, plus its
  announcement;
- the keyboard path from the board to Undo, Retry, the inspector and the tablet kit;
- the Area strip at 390, 820 and 1440px at 100% and 150%, before and after a tap, with no page
  overflow;
- the compact tablet with a selection at 150%;
- the generator preview on open;
- focus after cancelling each creation dialog;
- SVG focus rings on the Ink look in dark;
- a long story card on the table.

An e2e overflow audit with Area active and a failed compound write would keep P1-1 and P2-3 from
coming back.

This verdict applies only to fingerprint
`6090be7ea949f18d85d31c5f0c6257b1bd2175ae4144ef1c875ec26384e47d35`.

---

## Re-review (round 2)

- Date: 2026-11-05
- Reviewed source fingerprint: `d46537034606fac910c2330031244d84bdabc9bc941e2d9accd18bf81fe9da39`.
  I checked it with `node scripts/check-ui-review.mjs --fingerprint` before and after this round,
  and it did not change.
- Scope: the fixes for P1-1 to P3-15, the states and paths they touch, and a regression pass of the
  editor, the library dialogs and the table screen.

### Verdict: CHANGES_REQUIRED

The round 1 blocker is fixed, and so are six of the seven P2s.

- **P1 fixed:** a failed door write now shows the alert, reveals nothing, and Reintentar replays the
  whole action.
- **Keyboard:** the board is one Tab stop. Undo and Retry are one Tab away. Enter selects an item,
  moves focus to the inspector and announces it.
- **Layout:** the Area tool no longer breaks the phone layout. The compact tablet no longer
  overlaps at 150% text.
- **Dialogs and focus rings:** the generator paints on open, creation dialogs return focus, and the
  board cursor has a halo.

Two new P2 issues come from the new keyboard model:

- focus drops to the document after Undo or Reintentar;
- the board's screen reader help still describes the old Tab model.

### Round 1 findings

| Finding | Status | Verification |
| --- | --- | --- |
| P1-1 compound writes lose callbacks | Fixed | Browser, 390/820/1440, ES dark, generated dungeon (18 doors with rooms). Cursor on a door, then Enter: "Casilla 42, 11: Puerta cerrada", then "Puerta abierta.", door open, 1 fog op. Door write failed: one `role="alert"` ("Ese cambio no se guardó…" with Reintentar), door closed, fog unchanged (1 → 1). Reintentar (1 Tab from the board): door open, fog 1 → 2, "Puerta abierta." (`r2/shots/a-*.json`, `a-door-failed-*.png`). Code: `editor.tsx:256-279` awaits `mutateAsync` per step; `:606-631` sends door and reveals as one list. |
| P2-2 every item a Tab stop | Fixed (see R2-1, R2-2) | No tabbable element inside `.tt-world`. Tab order from the title: Poner en la mesa, Abrir la pantalla, kit (desktop), board, zoom ×3, kit (tablet, phone), panel keys. The cursor names items ("Casilla 39, 15: Urna"). Enter on a token or prop focuses the inspector `h2` and announces "Seleccionado: Centinela. Escape vuelve al mapa." "Mover a una casilla" is 7 Tabs from the heading (6 on phones); moving by cursor and Enter works. Escape returns focus to the board. On phones the drawer opens with focus on its Cerrar, the announcement is made, and Escape returns to the board. Undo and Retry are 1 Tab from the board (`a-*.json`, `b-*.json`). |
| P2-3 Area strip | Fixed | Page overflow is gone at every width, at 100% and 150% (`scrollWidth ≤ innerWidth`). The phone strip is one 91px row and the board 455px (was 282px). The placebar holds the count, the names, the angle keys and Keep/Clear inside the board and never meets the zoom keys at any width: phone placebar right edge 291px against zoom keys at 297px (`c-*.json`, `c-area-placed-*.png`, `c-area-cone-mobile.png`). Damage is one Select with a swatch; desktop and tablet strips are 143px. |
| P2-4 compact tablet overlap at 150% | Fixed | 820px, 150%, inspector open: kit 582–674, tabs 689–761, and `elementFromPoint` on Elegir hits the key. The page grows 39px (288px with Area) instead of overlapping (`d-tablet.json`, `d-inspector-150-tablet.png`). |
| P2-5 blank generator preview | Fixed | The canvas is 648 × 360 with parchment at the centre about 1.2s after opening, before any change, at all widths (`e-*.json`, `e-generator-open-light-mobile.png`). |
| P2-6 focus lost after creation dialogs | Fixed | Focus returns to "Nueva escena" after Generate Escape and Cancel, Blank Escape and Cancel, and Upload Escape, at all widths (`e-*.json`). |
| P2-7 SVG focus ring contrast | Fixed | At device scale 2, the cursor is a gold square on a dark halo, clear on the Ink parchment at all widths (`h-cursor-halo-*.png`). Map items are no longer keyboard targets, so their ring no longer matters for keyboard use. |
| P2-8 long story card clipped | Mitigated (see R2-4) | A nine-paragraph card (about 1,300 characters) at 1440 × 1000 shrinks to `--tt-story-k` 0.5 (text 20.7px) and fades at the bottom, and 7 of 9 paragraphs show. A short card stays at 1. The Story panel shows the long-card hint over 900 characters (`f-*.json`, `f-long-card-*.png`, `c-story-long-*.png`). |
| P3-9 desktop below the fold | Fixed | The editor ends at 964px of 1000px and the page does not scroll. |
| P3-10 phone tray | Partly fixed (see R2-3) | "Más herramientas (activa: Nota)" now names the active tool. Words wrap, but inside the word. |
| P3-11 two close buttons | Fixed | The phone drawer has one Cerrar. |
| P3-12 table status | Fixed | Mute keeps "Mute" with `aria-pressed` false → true. Polling shows a refresh glyph. Axe is clean. |
| P3-13 fake tabs | Fixed | Disclosure buttons with `aria-expanded` and `aria-controls="tt-sheet"`. The sheet is `role="region"` named after the panel. Axe on the dock is clean. |
| P3-14 copy | Fixed | Door tiles read "Cerrada / Abierta / Con llave" and the title reads "Puerta abierta". The summary reads "peanas de 25,4 mm". "Otro" focuses the exact field. Density has its seal. The calibration legend wraps inside the box at 150%. Story Show uses the default variant (code). |
| P3-15 key letters | Fixed | 12px, opacity 1 (#CBB699 on the dark surface; #664F3A in light). |

### New findings (round 2)

#### R2-1 (P2): focus is lost after Undo or Reintentar

- Paths: `editor.tsx:1313-1317` and `:1331-1335`. Each banner button unmounts its own banner:
  `undo` calls `setNotice(null)` at `:669-672`, and a successful attempt calls `setFailure(null)` at
  `:264`. No focus target is set.
- Viewports: 390, 820 and 1440px; ES dark.
- Reproduction (keyboard): with the board focused, remove a prop from the inspector, press Tab to
  "Deshacer" and press Enter. Or fail a door write, press Tab to "Reintentar" and press Enter.
- Observed: the item comes back, or the door opens. `document.activeElement` is then `BODY` at
  every width (`a-*.json`). The next Tab starts at "Saltar al contenido", and the arrow keys do
  nothing until the DM tabs back through the header to the board.
- Impact: these are the two recovery actions the round 1 fix brought within one Tab of the board.
  Using them by keyboard throws focus out of the editor. This is the same class as the RYT-054 P2-1
  focus loss.
- Fix direction: after Undo or Retry, call `focusBoard()` (keeping the cursor where it was), or keep
  the banner mounted until focus has moved. Add the focus assertion to the e2e Undo and retry cases.

#### R2-2 (P2): the board's screen reader help describes the removed Tab model

- Paths: `src/shared/i18n/tabletop-es.ts:28-29` and `tabletop-en.ts:25-26` (`tabletop.boardHelp`,
  the board's `aria-describedby`). The text says "Tab llega a fichas, objetos, áreas, puertas, notas
  y eventos; con uno enfocado, las flechas lo mueven, Supr lo quita y H lo oculta" / "Tab reaches
  tokens, props… with one focused, arrows move it".
- Observed: Tab no longer reaches any item, and arrows always move the cursor. The help does not
  say how the new model works:
  - Enter on an item selects it and opens the inspector;
  - "Mover a una casilla" is how a token moves;
  - Delete and H act on the selection.
- Impact: in `role="application"` this description is the only keyboard guidance a screen reader
  user gets, and it is wrong in both languages. `docs/design-system.md:310` (tokens "move … by arrow
  keys") has the same drift; that part is docs only.
- Fix direction: rewrite `boardHelp` for the cursor model in ES and EN, and update the design-system
  paragraph.

#### R2-3 (P3): tray words break inside the word

- Path: `tabletop.css:228-234` (`overflow-wrap: anywhere`).
- Observed: English 390px at 100% shows "Measur / e" (`c-area-cone-mobile.png`). Spanish 390px at
  150% shows "Eleg / ir", "Me / dir", "Áre / a", "Nie / bla" and "Pue / rta"
  (`d-area-150-mobile.png`).
- Fix direction: wrap at word boundaries (`overflow-wrap: normal` with `hyphens: auto` and the
  document language), or let the tray drop to icon plus name at large text.

#### R2-4 (P3): long cards still lose their end

- Paths: `overlays.tsx:142-152`, `tabletop.css:1735` (`max-width: 42ch`).
- At 1440 × 1000, a 1,300-character card stops at the 0.5 floor and fades with 2 of 9 paragraphs
  hidden. The text column keeps 42ch, so the right half of the plate stays empty while text is cut
  (`f-long-card-desktop.png`).
- The editor hint promises "the table shrinks the type so all of it shows" / "para que quepa
  entera" (`tabletop.story.longHint`), which is not true for this card. The fade is a real cue now.
- Fix direction: let the column widen as `--tt-story-k` drops, and reword the hint ("may not fit;
  split it").

#### R2-5 (P3): Delete acts on the selection, not on the cursor's square

- Paths: `editor.tsx:633` (a keyboard door toggle leaves the door selected on wide screens) and
  `:849-853`.
- Reproduction (820/1440): put the cursor on a door and press Enter (it opens and the inspector
  shows the door). Move the cursor to the campfire ("Casilla 4, 8: Hoguera") and press Delete.
- Observed: the door is removed ("Se quitó Puerta abierta del mapa.") and the campfire stays. The
  announcement and the one-Tab Undo make this recoverable.
- Fix direction: while the cursor is on another item, make Delete act on that item, or clear the
  selection when the cursor leaves it.

#### R2-6 (P3): smaller layout notes

- Phone at 150%: the Area hint bar takes four lines (156px) over the bottom of a 288px board, and
  taps on it do not reach the map (`d-area-150-mobile.png`). Give it `pointer-events: none`, or
  shorten it after the first view.
- 820px with a panel or the inspector open: the board drops to 192px and the Area placebar covers
  about half of it (`c-area-placed-tablet.png`). It is usable, and closing the sheet restores the
  board.
- Code inspection: any successful write clears an earlier failure banner (`editor.tsx:264`), so a
  failure can disappear before the DM reads it. The door's own state still shows the outcome.

### Regression (round 2 build)

- Delivery spec: `RYT_CAPTURE=1 npx playwright test tests/e2e/tabletop.spec.ts
  --project=identity-mobile --project=identity-tablet --project=identity-desktop --workers=6
  --output=test-results/ui-review-tabletop/run2`. Result: 15 passed. I did not set `RYT_EVIDENCE`.
  This run rebuilt `dist-identity` from this source.
- Throwaway specs under the gitignored `test-results/ui-review-tabletop/`, deleted afterwards: 24
  cases at 390 × 844 (touch), 820 × 1180 (touch) and 1440 × 1000. One phone case failed by design:
  on phones a door tap toggles the door without opening the sheet. They covered:
  - the dungeon keyboard path;
  - token selection, moving by cursor, Escape and Delete scope;
  - EN light editor, dock, inspector, Area hint, placement and cone, and axe;
  - 150% editor, inspector, Area, tray, calibration and generator;
  - generator paint and library focus return;
  - table screen long and short cards, status, mute and axe;
  - door inspector and key letters;
  - the cursor halo at device scale 2.
- Axe (wcag2a/aa, 21aa): zero violations on the editor without the map, the dock with a panel, the
  Area tool with a placement (EN light, 3 widths) and the table screen (EN light, 3 widths).
- Screenshot inspection: every `r2/shots/*.png` and the spec's run2 captures.

### Evidence (round 2)

All in
`C:\Users\dmont\AppData\Local\Temp\claude\84e3d83304c88c7a\0c99e808-b9b4-4a01-b66f-295a20858619\scratchpad\uiux-ryt055\r2\`:
`run2/…`, `run2.log`, and `shots/{a,b,c,d,e,f,g,h}-*.{json,png}`.

### Limitations (round 2)

- The round 1 limitations still apply: Chromium emulation only, no screen readers (announcements were
  read from the live region), no hosted Supabase or offline browser test, 150% text but not 200%,
  and only the Default class theme.
- Not re-run this round: the Player view, the table start overlay at 390px, and the fog and measure
  strips. Their source paths were not part of the fixes, and the delivery spec covers them.
- I did not run `npm run check` or the full e2e suite. The coordinator reports both passing.

### Re-review request

After fixing R2-1 and R2-2, ask for a focused re-check of:

- keyboard Undo and Retry, where focus should stay on the board;
- the board help text in ES and EN.

Fix R2-3 to R2-6 if accepted.

This round 2 verdict applies only to fingerprint
`d46537034606fac910c2330031244d84bdabc9bc941e2d9accd18bf81fe9da39`.

---

## Re-review (round 3)

- Date: 2026-11-05
- Reviewed source fingerprint: `c36ff3f5e44888a26a3e37c5aec142d3a0c29d22c5bcab7bbf06265dcdac0371`.
  I checked it with `node scripts/check-ui-review.mjs --fingerprint` before and after this round,
  and it did not change.
- Scope: R2-1 and R2-2, as asked, plus the R2-3 to R2-6 changes and the paths they touch: the board
  keys, the banners, the run failure state, the tray, the Area hint and the table story plate.

### Verdict: PASS

No P1 or P2 findings remain. Both round 2 P2s are fixed and verified in the browser. The round 2
P3s are fixed, apart from two small leftovers listed below.

| Finding | Status | Verification |
| --- | --- | --- |
| R2-1 focus lost after Undo or Retry | Fixed | Browser, 390/820/1440, ES dark. After each of these actions, focus is on the board (`role="application"`) at every width: Deshacer with Enter, Deshacer with a pointer click, the notice's "Cerrar el aviso" with Enter, Reintentar with Enter (the door opens, "Puerta abierta.", the alert goes), and the failure's close with Enter. Undo and Retry are 1 Tab from the board (`r3/shots/a-*.json`). |
| R2-2 outdated board help | Fixed | `#tt-board-help` (the board's `aria-describedby`) now reads "El mapa es una sola parada de Tab…" in ES and "The map is one Tab stop…" in EN. It describes the cursor and its announcements, Enter with the tool, Select → sheet with Escape back, "Mover a una casilla", Delete and H on the cursor's item or the selection, letters and zoom. This matches the behaviour I observed (`a-*.json`, `b-*.json`). Document language is `es`/`en`. |
| R2-3 tray words cut mid-word | Fixed (see R3-1) | English 390px at 100%: every tray word is on one line ("Measure" whole). Spanish 390px at 150%: "Me-dir" and "Nie-bla" break with a hyphen, and no word overflows its key (`b-mobile.json`, `c-*.json`, `c-area-hint-150-mobile.png`). |
| R2-4 long card loses its end | Fixed (see R3-2) | A nine-paragraph card at 1440 × 1000 and 820 × 1180 shows all nine paragraphs. The column widens with the smaller type (1065px of a 1151px plate), and the editor warning now says the end may fade ("…y, si aun así no cabe, el final se desvanece") (`d-*.json`, `d-long-card-desktop.png`). A 390px window still shows 3 of 9 with the fade, which is expected for a phone-sized table window. |
| R2-5 Delete on the selection | Fixed | 820/1440: a door is selected with Enter, then the cursor moves to "Casilla 4, 8: Hoguera". Delete removes the campfire ("Se quitó Hoguera del mapa.") and the door stays. H on the token under the cursor hides it. On an empty square Delete falls back to the selection, as the help says (`e-*.json`). |
| R2-6 hint blocks taps; later success hides a failure | Fixed | At 150% on 390 and 820px, a tap in the middle of the Area hint bar places the area through it. A failed door write followed by a successful H keeps the alert and its Reintentar (1 alert) at every width (`a-*.json`, `c-*.json`). The compact tablet board with a panel open stays at 192px. I do not consider that blocking: it is a deliberate trade-off, usable, and closing the sheet restores the board. It stays a P3 suggestion: collapse the sheet while a placing tool is active. |

### Remaining notes (P3, non-blocking)

- **R3-1:** the phone tray words are now 0.6875rem (11px), below the 12px label minimum in
  `docs/design-system.md` (`tabletop.css:240-241`). They are legible in the captures. Hyphenation
  already handles large text, so 0.75rem may fit again.
- **R3-2:** the story plate's fade also dims the last paragraph when the whole card fits. At 1440 ×
  1000 all nine paragraphs are inside the plate, but `is-clipped` is still set: scrollHeight is
  larger than clientHeight, likely because of the last paragraph's bottom margin. Comparing against
  the last paragraph's bottom, or dropping its margin, would keep the fade for real overflow
  (`d-long-card-desktop.png`).
- **R3-3:** the H announcement does not name the item ("Ya no se ve en la mesa."). Now that H acts
  on the cursor's item or the selection, naming it ("Centinela ya no se ve en la mesa.") would
  confirm which one changed.
- The round 1 and round 2 P3 notes that were accepted as trade-offs still stand: the compact tablet
  board with an open sheet, and the phone hint bar size at 150%.

### Tested (round 3)

- Delivery spec: `RYT_CAPTURE=1 npx playwright test tests/e2e/tabletop.spec.ts
  --project=identity-mobile --project=identity-tablet --project=identity-desktop --workers=6
  --output=test-results/ui-review-tabletop/run3`. Result: 15 passed. I did not set `RYT_EVIDENCE`.
  This run rebuilt `dist-identity` from this source.
- Throwaway spec and config under the gitignored `test-results/ui-review-tabletop/`, deleted
  afterwards: 13 cases at 390 × 844 (touch), 820 × 1180 (touch) and 1440 × 1000, all passing. They
  covered:
  - focus after Undo (Enter and click), notice and failure dismiss, and Retry;
  - failure persistence after a later success;
  - Delete and H on the cursor's item, with the fallback to the selection;
  - the board help text in ES and EN;
  - tray words at 100% (EN) and 150% (ES);
  - the Area hint tap-through at 150%;
  - long and short story cards on the table and the editor warning.
- Axe (wcag2a/aa, 21aa) on the editor without the map in EN light: zero violations at all widths.
- Screenshot inspection: `r3/shots/*.png` and the run3 captures.
- Evidence:
  `C:\Users\dmont\AppData\Local\Temp\claude\84e3d83304c88c7a\0c99e808-b9b4-4a01-b66f-295a20858619\scratchpad\uiux-ryt055\r3\`
  (`run3/…`, `run3.log`, `shots/{a,b,c,d,e}-*.{json,png}`).

### Limitations (round 3)

- The earlier limitations still apply: Chromium emulation only, no screen reader run (announcements
  and the description were read from the DOM), no hosted Supabase or offline browser test, 150% but
  not 200% text, and only the Default class theme.
- This was a focused round. The Player view, the generator, the library dialogs and the table start
  overlay were not re-run. Their code was not part of the round 3 changes, and the delivery spec
  covers them.
- I did not run `npm run check` or the full e2e suite. The coordinator reports `npm run check`
  passing and `tabletop.spec.ts` at 45/45 with `--repeat-each=3`.

This PASS applies only to fingerprint
`c36ff3f5e44888a26a3e37c5aec142d3a0c29d22c5bcab7bbf06265dcdac0371`.
