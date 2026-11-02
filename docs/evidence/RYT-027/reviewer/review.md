# RYT-027 UI/UX review

- Ticket: RYT-027 (DM Command Center storeroom, item manager UX, shop item editing and Party redesign)
- Reviewer: `ui-ux` (independent; role `.codex/agents/ui-ux.toml`)
- Source commits: round 1 `70f8fe8`; round 2 `79c32c5` (branch `claude/ecstatic-clarke-dz03w7`)
- Reviewed: 2026-11-02

Verdict: PASS

The verdict line applies to the current source, `79c32c5` (round 2). Round 1 on `70f8fe8` was
CHANGES_REQUIRED and is kept below as history.

## Round 1 (70f8fe8): CHANGES_REQUIRED

### Summary

Most of the delivery works well. Nav order, `?panel=` deep links, the `/items` redirect, removal of the
revelations tab, the dense storeroom list and grid, the remembered view, category counts, the shop
"Editar objeto" flow, the satchel list view, create-for-character and equal Party width at 1440px all
work in a real browser. Axe found no AA violations on any captured state, and no page overflows
horizontally at 390, 820 or 1440px, or at 150% text.

One blocking issue remains. Every overlay opened from a ⋯ menu loses keyboard focus when it closes.
That covers every phone list row and every grid tile at all sizes. It breaks the repo rule "Focus
trapping, Escape and return focus for overlays" and WCAG 2.4.3. A few smaller issues follow.

### Findings

#### F1 — Major (blocking): focus is lost after closing an overlay opened from a ⋯ menu
- Paths: `src/pages/item-store.tsx:506` (GiveItem `opener = document.activeElement`),
  `src/features/inventory/ui/definition-editor.tsx:79`, `src/features/shops/ui/catalogue-shop-picker.tsx:25`;
  the menu is in `src/pages/item-store.tsx:454-479`.
- Where: the list view at 390px (all phones) and the grid view at 390, 820 and 1440px. Seen in es, dark.
- Reproduction: open the storeroom in grid view at 1440px. Choose ⋯ "Acciones para Escudo", then "Dar a
  personajes", "Editar" or "Añadir a tienda", then press Escape. `document.activeElement` is `BODY` in
  all three cases. The same happens at 390px in list view with Give and Escape. On desktop, the list
  view's direct icon button and the row's Edit button do get focus back.
- Root cause: each overlay saves `document.activeElement` when it mounts. At that moment the focused
  element is the Mantine menu item, which unmounts as soon as the menu closes. `returnFocus={false}`
  turns off Mantine's own restore.
- Impact: keyboard and switch users on tablets, and screen-reader users, are sent back to the top of
  the document after every give, edit or shop action from the main phone and grid path.
- Fix: pass the ⋯ trigger (a ref on `Menu.Target`'s ActionIcon) as the opener, as Party's
  `CharacterMenu` already does with `trigger.current`. Or save the row's trigger in `ItemStore` state
  and focus it on close. Add an e2e assertion for grid view and for the phone menu.

#### F2 — Minor: the clear-search button is 36×36px and clearing drops focus
- Path: `src/pages/item-store.tsx:197-204` (`size={36}`).
- Where: all viewports when search has text. Seen at 1440px, es, dark.
- Reproduction: type `zzz` in "Buscar objetos" and activate "Limpiar búsqueda". The button measures
  36×36. After it is pressed, it unmounts and focus moves to `BODY`.
- Impact: this is below the repo's 44px minimum, and keyboard users lose their place.
- Fix: use `size={44}` (or a 44px hit area) and refocus the search input after clearing.

#### F3 — Minor: the active Command Center tab is off-screen on phones
- Paths: `src/features/campaigns/ui/members.tsx` (Tabs.List, about line 186) and `src/app/styles.css:2157`.
- Where: 390px, es and en.
- Reproduction: open `members?panel=items`, or use Party ⋯ "Nuevo objeto para Arin". The tab list
  scrolls to 640px inside a 358px box with `scrollLeft=0`. The selected "Almacén de objetos" tab ends at
  x=527, past the edge at x=374, so only its icon shows (screenshot `store-m-viewport.png`). At 150% text
  only "Miembros | Módulos ac…" is visible.
- Impact: on a deep link the user cannot see which panel is active, and the storeroom tab looks
  unlabeled.
- Fix: on mount and whenever `activePanel` changes, call `scrollIntoView({ inline: 'nearest' })` on the
  selected tab, and/or add an edge fade so users can tell the strip scrolls.

#### F4 — Minor: wrong success message after giving an existing item (es grammar too)
- Path: `src/pages/item-store.tsx:402` uses `store.createdFor`.
- Where: the give drawer at any size. Seen at 390px, es.
- Reproduction: give "Poción de curación" to Arin. The status reads "Poción de curación creado y
  entregado a Arin." The item was not created, and "creado" does not agree with the feminine noun.
- Fix: add a `store.given` key ("Entregado: {{name}} → {{names}}" / "{{name}} given to {{names}}") and
  use phrasing without gender.

#### F5 — Minor: partial failures in the give drawer are not named
- Path: `src/pages/item-store.tsx:530-532, 651-655`.
- Where: the give drawer at 1440px, es (fixture `grant_item` 503 on the first call).
- Reproduction: a failed grant shows only the generic "No se pudo completar la operación…". Characters
  already given are marked only by `opacity: .6` (`styles.css:3303`) and `aria-disabled`, with no text
  and no icon. The retry did succeed, with idempotent keys, and focus returned to the icon button.
- Impact: with several characters selected, the DM cannot tell who received the item. The rule "never
  convey status by color alone" applies here.
- Fix: list the failed names, as the create flow does with `store.givePartial`, and add a check icon
  or "Entregado" label to the chips already given.

#### F6 — Minor: create-for-character shows no target at the top of the form
- Path: `src/features/inventory/ui/definition-editor.tsx` and `forge.tsx` (title stays "Forjar objeto").
- Where: 390px, es, from Party ⋯ "Nuevo objeto para Arin".
- Reproduction: the drawer opens as a generic "Forjar objeto". The preselected "Dar a: Arin" chip
  appears only after scrolling past image, template, name, category, icons, rarity, weight and value.
  After Escape, the URL loses `create` correctly, but focus lands on `BODY`.
- Fix: when `initialGive` is set, title the drawer "Nuevo objeto para Arin" (`store.createFor`). On
  close, focus the "Nuevo objeto" button or the storeroom heading.

#### F7 — Nit / polish
- On phones the list rows hide value and origin (`item-store.tsx:328`). Prices are visible only in
  the grid. Consider showing the value on the right before the ⋯ menu.
- Rows measure 64–66px, not the 56px in ADR 018 and design-system.md. The `min-height` is 56, but the
  content grows the row. Density is still good; update the doc or tighten the padding.
- At 390px with 150% text, list names are cut to "Armadura de c…" and "Poción de cura…". Allow two
  lines for the name at large text.
- Party DM card at ≥820px: the vitals column leaves a large empty area under "Ver ficha". At 1440px,
  "Raciones de comida" sits alone in its row. The gold value "25✎" has no gap before the pencil.
- These i18n keys are unused: `party.vitals`, `party.hpShort`, `party.acShort`, `party.levelShort`,
  `party.noSheet`, `party.openSheet`, `party.count_*` (`src/shared/i18n/store-*.ts`).
- Existing issue, not from RYT-027: on Shops at 390px, the "Nueva tienda" control measured 39×70.

### Acceptance criteria check

1. The Command Center is first (desktop nav "Centro de mando DM", phone bottom bar "Mando DM"). It has
   four tabs kept in `?panel=` and survives a reload. `/items` redirects to `members?panel=items`.
   There is no revelations tab, and an unknown panel falls back to Members. **Met.**
2. Rows, tiles, search, sort, chips with counts, the remembered view and icon/menu actions with 44px
   targets are present. **Partly met:** F1 (focus) and F2 (the 36px clear button).
3. Create-for-character from the storeroom and from Party works: Arin is preselected, one stack is
   granted and the notice names Arin. Give retry is idempotent. **Met with minor issues:** F5 and F6.
4. Shop "Editar objeto" opens the shared editor at 390, 820 and 1440px. The save updated the row and the
   status, and focus returned to "Edit item: Greater potion". **Met.**
5. The satchel list view works (64px rows, quantity, carried weight). **Met.**
6. Party shows the portrait, class and level, HP/AC chips and compact resources. DM and Player
   `main` are both 1360px at 1440px, with 1304px cards. **Met.**

### Tested scenarios

Real browser checks used Chromium (Playwright, `/opt/pw-browsers/chromium`) against a production
build with base `/rytta-dnd-app/`, served by `vite preview` on port 4191, with the identity and shops
fixtures (`sheet: complete`, modules party/inventory/shops). Scripted assertions and measurements:
- Storeroom list and grid at 390, 820 and 1440px: row heights, tile sizes, the grid choice surviving a
  reload, row accessible names ("Editar: …", "Dar … a personajes", "Añadir … a una tienda", "Acciones
  para …") and view radios named "Lista" / "Cuadrícula".
- The phone ⋯ menu: Enter opens it with focus on the first item, ArrowDown moves, and Escape returns
  focus to the trigger.
- Give drawer: one chip (52px, aria-pressed), the stepper plus +5 and +10 giving 16, the Tab focus
  trap, Escape, success, a 503 partial failure, retry and focus.
- Party ⋯: items, "Nuevo objeto para Arin", URL `?create=`, the preselected chip, the forged item
  granted, `create` removed with replace, and Back returning to Party.
- Tabs: deep link, reload, ArrowRight on phone (horizontal), ArrowDown at 1440px (vertical), unknown
  panel fallback.
- Shops: expand the row, the "Editar objeto: Poción de curación" label, editor open, Escape restoring
  focus, and an en/light save.
- Inventory as Player: grid/list switch.
- A Player at `?panel=items` gets no storeroom and no tabs.
- Every target under 44px, horizontal overflow and axe (wcag2a/2aa/21aa/22aa) on about 70 states:
  - 3 viewports, es dark, for storeroom, Party DM/Player, Shops and Inventory;
  - en-light, es-light and en-dark at 390 and 1440px for storeroom and Party;
  - 150% text at 390 and 820px for storeroom list and grid, Party, Shops and Members;
  - overlays: give drawer, editor, menu, sort.
- Results: 0 axe violations, 0 overflow, and only the targets listed in F2 and F7 below 44px.

Screenshots inspected by eye (kept in scratch only, not committed): storeroom list and grid at 390 and
1440px, storeroom en-light at 1440px, 150% storeroom at 390px, Party DM at 390/820/1440px, Party Player
at 390/1440px, the give drawer at 390px, create-for at 390px (top and the give-to section), the shop
row and editor at 390px en-light, and the satchel list at 390px.

Read-only code inspection: `item-store.tsx`, `members.tsx`, `party.tsx`, `definition-editor.tsx`,
`forge.tsx`, `satchel.tsx`, `admin-panel.tsx`, `stock-list.tsx`, `router.tsx`, `layout.tsx`, the store
i18n catalogs and the storeroom CSS.

### Limitations

- Fixture data only, with one character (Arin) and six items. The roster with many chips and long
  catalogues (scalability beyond about 6 rows) was judged from the CSS, not rendered.
- Player preview Party was not verified: my preview script did not reach a populated card.
- Reduced motion was not exercised separately. Mobile is Chromium emulation, not iOS Safari or
  Android, and no screen reader was used.
- The loading and error states of the shop editor (`ShopItemEditor` renders null while the catalogue
  loads) and of the storeroom were not triggered.
- Hosted Supabase was not tested. I did not run `npm run check` or the repo e2e suite; that is the
  implementer's evidence.
- This approval and these findings apply only to source commit `70f8fe8`.

## Round 2 (79c32c5)

Round 2 was a focused re-review of the fixes for F1–F7, listed under "Round 1" in
`docs/evidence/RYT-027/validation.md`. I rebuilt the mocked-live bundle from `79c32c5`
(`VITE_DATA_MODE=supabase`, base `/rytta-dnd-app/`), served it with `vite preview` on port 4191 and
tested it in real Chromium. Round 2 result: **PASS**. The blocking F1 is resolved, and so are F2–F6.
F7 is only partly resolved, and one new nit was found. Both are non-blocking.

### Per-finding status

- **F1: resolved.**
  - Covered: 390px list, 390px grid and 1440px grid, each with normal motion and with
    `prefers-reduced-motion: reduce`. Each case was opened from ⋯ "Acciones para Escudo".
  - Escape: after Give, Edit and Add to shop, focus returns to `BUTTON Acciones para Escudo` in every
    case.
  - Completing the action: giving to Arin, saving the edit and adding the item to a shop all return
    focus to the same ⋯ button.
  - Keyboard only: Enter opens the menu with focus on "Editar". ArrowDown, then Enter, opens Give with
    focus on the drawer's Close button.
  - Desktop list icon buttons: they still return focus to themselves ("Dar Escudo a personajes" after
    a retry).
  - Observation, not a defect: the action now starts only after the menu's exit transition. A script
    that presses Enter, ArrowDown and Enter within the same instant does not open the dialog. With
    realistic keyboard timing it opens.
- **F2: resolved.** "Limpiar búsqueda" is 44×44px at 390 and 1440px. Clicking it, or reaching it with
  Tab and pressing Enter, clears the value and puts focus in "Buscar objetos".
- **F3: resolved.** On a 390px `?panel=items` load the tab rail scrolls itself (`scrollLeft` 153). The
  selected "Almacén de objetos" tab spans x=178–374 inside the rail's 16–374, so it is fully visible.
  Switching to Auditoría also keeps the selected tab in view (x=198–374).
  - Caveat: when I injected 150% text after the page had loaded, the rail did not scroll again. The
    effect runs only when the panel changes. This was a test artifact; a page loaded at 150% runs the
    same mount logic.
- **F4: resolved.**
  - es: "Entregado a Arin: Escudo." and, with two characters, "Entregado a Arin, Bryn Valtera de las
    Mareas: Escudo."
  - en: "Given to Arin: Escudo."
  - The wording no longer implies the item was created and avoids gender agreement. The
    create-for-character notice is "Nuevo objeto en el almacén y entregado a Arin: Perla." It is
    neutral, though a little long.
- **F5: resolved.** Setup: a second roster entry, "Bryn Valtera de las Mareas", was routed into the
  roster, and `grant_item` failed once for Bryn. Checked at 390 and 1440px:
  - The alert reads "No se pudo entregar a Bryn Valtera de las Mareas. Puedes reintentarlo."
  - Arin's chip shows a green check plus the hidden text "entregado". Its accessible text is
    "Arin entregado", and it is `aria-disabled`, so a forced click does not toggle it.
  - Focus stays on "Reintentar". Retrying grants only to Bryn, and the notice names both characters.
- **F6: resolved.** Opened from Party ⋯ "Nuevo objeto para Arin" at 390 and 1440px:
  - The drawer title and accessible name are "Nuevo objeto para Arin" (en: "New item for Arin").
  - "Dar a" is the first block, with Arin pressed and Bryn not.
  - On Escape, the URL drops `create` and focus goes to "Nuevo objeto". Forging the item grants it
    only to Arin, and focus then goes to "Nuevo objeto".
  - The plain "Nuevo objeto" button keeps the "Forjar objeto" title and returns focus to itself.
- **F7: partly resolved (Minor, non-blocking).**
  - Done: names now wrap to two lines. At 150% text a very long name is still clamped at two lines,
    which is acceptable.
  - Done: the gold value has its gap, the unused keys are gone and the documented row height is
    updated.
  - Still open: the phone price. See R2-1.

### New or remaining findings

#### R2-1: Minor, the phone price is cut off by the meta ellipsis (remainder of F7)
- Paths: `src/pages/item-store.tsx:353` and `src/app/styles.css:3209` (`.store-row-meta` uses
  `white-space: nowrap; text-overflow: ellipsis`).
- Where: 390px, es, dark. Also likely in en, which was not captured separately.
- Reproduction: at 100% text, open the storeroom list at 390px.
  - "Escudos · Común · 6 lb · Sin pre…" and "Consumibles · Poco común · 0,5…" end in an ellipsis, so
    the 50 po price of Poción de curación is hidden. Only short rows such as "Armas · Común · 3 lb ·
    15 po" show the price.
  - At 150% text, all seven meta lines are clipped and no price is visible.
- Impact: the claimed fix works only for short meta lines. The grid and the edit drawer still show
  the price, so this does not block.
- Fix: show the value as its own right-aligned element before the ⋯ button, with
  `flex-shrink: 0`. Or put the value first in the meta line, or drop weight from the phone meta.

#### R2-2: Nit, a `?create=` link opened inside the storeroom does not open the editor
- Path: `src/pages/item-store.tsx:80`. The editor state comes from `?create=` only in the `useState`
  initializer.
- Reproduction: while already on `members?panel=items`, navigate to
  `members?panel=items&create=<characterId>`. No dialog opens; a reload opens it.
- Impact: the Party menu path is unaffected, because it remounts the page. Only a manual URL change
  or an in-app link while already in the storeroom is affected.
- Fix: run an effect when the `create` parameter changes.

#### Existing issue, unchanged
On Shops at 390px, "Nueva tienda" is 39px tall. This predates RYT-027 and is out of scope, as the
validation notes say.

### Axe and overflow on the touched states
Rules run: wcag2a, wcag2aa, wcag21aa and wcag22aa. Every state below had 0 violations and 0
horizontal overflow:
- storeroom list at 390px (es dark, en light) and at 1440px;
- search with a value at 390px, and no results at 1440px;
- the shop picker opened from the ⋯ menu (390px list, 390px grid, 1440px grid, both motion settings);
- the give drawer with two characters, its partial-failure state and its done state, at 390 and
  1440px;
- the give done state at 390px in en light;
- create-for "Nuevo objeto para Arin" at 390 and 1440px, and at 390px en light;
- storeroom at 150% text at 390px.

### Round 2 tested scenarios
- **Real browser checks** (Playwright scripts with assertions and measurements): everything listed
  per finding above, plus:
  - reduced motion for F1;
  - the keyboard-only menu path;
  - focus after each action is completed;
  - the shop picker add, through its "Tienda" select and "Añadir a tienda";
  - the same-document `?create=` navigation.
- **Screenshots inspected by eye** (scratch only, not committed):
  - the F3 tab rail at 390px;
  - the shop picker at 390px;
  - the give drawer failure state at 390px;
  - "Nuevo objeto para Arin" at 390px;
  - the storeroom at 150% text at 390px.
- **Code inspection:** the `79c32c5` diff of `item-store.tsx`, `members.tsx`, `forge.tsx`,
  `definition-editor.tsx`, `styles.css` and the store i18n catalogs.

### Round 2 limitations
- Bryn is a second roster entry routed into the roster for the drawer tests, not real fixture
  data. Grants for Bryn were handled by the fixture's `grant_item`.
- Not re-tested in round 2: 820px; Party, Shops "Editar objeto" and the satchel (none changed since
  round 1); a complete en/light matrix (spot-checked only).
- Still not covered: real iOS or Android, a screen reader, and hosted Supabase. I did not run
  `npm run check` or the repo e2e suite; that is the implementer's evidence.
- This approval applies only to source commit `79c32c5`.
