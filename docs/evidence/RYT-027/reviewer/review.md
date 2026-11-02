# RYT-027 UI/UX review

- Ticket: RYT-027 (DM Command Center storeroom, item manager UX, shop item editing and Party redesign)
- Reviewer: `ui-ux` (independent; role `.codex/agents/ui-ux.toml`)
- Source commit: `70f8fe8` (branch `claude/ecstatic-clarke-dz03w7`)
- Reviewed: 2026-11-02

Verdict: CHANGES_REQUIRED

## Summary

Most of the delivery works well. Nav order, `?panel=` deep links, the `/items` redirect, removal of the
revelations tab, the dense storeroom list and grid, the remembered view, category counts, the shop
"Editar objeto" flow, the satchel list view, create-for-character and equal Party width at 1440px all
work in a real browser. Axe found no AA violations on any captured state, and no page overflows
horizontally at 390, 820 or 1440px, or at 150% text.

One blocking issue remains. Every overlay opened from a ⋯ menu loses keyboard focus when it closes.
That covers every phone list row and every grid tile at all sizes. It breaks the repo rule "Focus
trapping, Escape and return focus for overlays" and WCAG 2.4.3. A few smaller issues follow.

## Findings

### F1 — Major (blocking): focus is lost after closing an overlay opened from a ⋯ menu
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

### F2 — Minor: the clear-search button is 36×36px and clearing drops focus
- Path: `src/pages/item-store.tsx:197-204` (`size={36}`).
- Where: all viewports when search has text. Seen at 1440px, es, dark.
- Reproduction: type `zzz` in "Buscar objetos" and activate "Limpiar búsqueda". The button measures
  36×36. After it is pressed, it unmounts and focus moves to `BODY`.
- Impact: this is below the repo's 44px minimum, and keyboard users lose their place.
- Fix: use `size={44}` (or a 44px hit area) and refocus the search input after clearing.

### F3 — Minor: the active Command Center tab is off-screen on phones
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

### F4 — Minor: wrong success message after giving an existing item (es grammar too)
- Path: `src/pages/item-store.tsx:402` uses `store.createdFor`.
- Where: the give drawer at any size. Seen at 390px, es.
- Reproduction: give "Poción de curación" to Arin. The status reads "Poción de curación creado y
  entregado a Arin." The item was not created, and "creado" does not agree with the feminine noun.
- Fix: add a `store.given` key ("Entregado: {{name}} → {{names}}" / "{{name}} given to {{names}}") and
  use phrasing without gender.

### F5 — Minor: partial failures in the give drawer are not named
- Path: `src/pages/item-store.tsx:530-532, 651-655`.
- Where: the give drawer at 1440px, es (fixture `grant_item` 503 on the first call).
- Reproduction: a failed grant shows only the generic "No se pudo completar la operación…". Characters
  already given are marked only by `opacity: .6` (`styles.css:3303`) and `aria-disabled`, with no text
  and no icon. The retry did succeed, with idempotent keys, and focus returned to the icon button.
- Impact: with several characters selected, the DM cannot tell who received the item. The rule "never
  convey status by color alone" applies here.
- Fix: list the failed names, as the create flow does with `store.givePartial`, and add a check icon
  or "Entregado" label to the chips already given.

### F6 — Minor: create-for-character shows no target at the top of the form
- Path: `src/features/inventory/ui/definition-editor.tsx` and `forge.tsx` (title stays "Forjar objeto").
- Where: 390px, es, from Party ⋯ "Nuevo objeto para Arin".
- Reproduction: the drawer opens as a generic "Forjar objeto". The preselected "Dar a: Arin" chip
  appears only after scrolling past image, template, name, category, icons, rarity, weight and value.
  After Escape, the URL loses `create` correctly, but focus lands on `BODY`.
- Fix: when `initialGive` is set, title the drawer "Nuevo objeto para Arin" (`store.createFor`). On
  close, focus the "Nuevo objeto" button or the storeroom heading.

### F7 — Nit / polish
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

## Acceptance criteria check

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

## Tested scenarios

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

## Limitations

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
