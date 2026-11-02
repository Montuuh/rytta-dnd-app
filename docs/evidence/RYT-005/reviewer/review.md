# RYT-005 Shops: independent ui-ux review

- Reviewer role: `ui-ux` (`.codex/agents/ui-ux.toml`), independent subagent; implementation code read-only.
- Date: 2026-11-02. Source snapshot: working tree on `main` (uncommitted RYT-005 changes), as found at review time.
- Scope: `src/features/shops/**`, RYT-005 block in `src/app/styles.css`, `shops-*.ts` and inventory ledger
  labels, `modules.ts`, `router.tsx`.

## Verdict

**CHANGES_REQUIRED**

The storefront, cart, orders and DM panel are visually consistent with RYT-004 (rarity-framed glyphs,
price tag, gold tokens) and RYT-025 (bottom bar, sentence-case badges, type tokens). Axe passes in dark
and light, Spanish and English, at 390px and 820px, with no horizontal overflow. Concrete issues remain:
focus is lost after some dialogs close, destructive and zero-value actions have no safeguard, and two
explicit UX acceptance items are missing.

## Findings

### Major

1. **Focus goes to `<body>` after the shop editor closes, and after a counter-offer or revert is sent.**
   - Where: `src/features/shops/ui/admin-panel.tsx:171-193` (the `ShopEditor` is mounted conditionally
     and unmounts on close); `src/features/shops/ui/orders.tsx:261-285` (the order card re-renders or
     moves from "Needs your answer" to "History" after the action).
   - Viewports: phone 390 and tablet 820, light, English (browser-tested).
   - How to reproduce: as DM, focus `Edit` on a shop, press Enter, then Escape. `document.activeElement`
     is BODY. Counter-offer, then `Send counter`: focus is BODY. Revert, then confirm: focus is BODY.
     For comparison, the listing editor (Escape returns to `Add item`), the counter modal on Escape,
     the cart drawer and the listing drawer all return focus correctly.
   - Impact: keyboard and screen-reader users lose their place in a long ledger. This breaks the
     design-system rule to trap focus, support Escape and return focus for overlays.
   - Fix: keep the modal mounted with `opened={dialog?.kind==='shop'}`, or restore focus to the trigger
     by hand. After an order action, move focus to the status notice or to the card in its new section.

2. **Archiving a shop or a listing takes one tap, with no confirmation and no way to restore it.**
   - Where: `admin-panel.tsx:360-373` (`Archive` shop) and `admin-panel.tsx:441-455` (archive listing
     icon). The SQL `archive_shop` and `archive_listing` filter archived rows out of `get_shop_admin`,
     and the UI has no restore path.
   - All viewports and themes (browser: clicking `Archive` opened no dialog; code inspection confirms
     the RPC fires immediately).
   - Impact: the button sits next to `Edit` with a 44px target. A mis-tap removes a whole merchant and
     its stock from the DM's view during play. There is no error prevention and no undo.
   - Fix: add a confirmation modal that names the shop and says pending orders are unaffected (or
     explains what happens to them), or offer an undo notice or an archived-shops list.

3. **A Player can sell items for 0 gold in an auto shop.**
   - Where: `src/features/shops/ui/storefront.tsx:501-553` (rows with `buyback = 0` are listed and the
     button only checks `chosen.length`).
   - Phone and tablet, light, English (browser): in Mercado del puerto, Sell tab, set Flecha (pays
     0 gp each) to 5. `You receive 0 gp` appears and `Sell for 0 gp` is **enabled**. Escudo also shows
     "Pays 0 gp each".
   - Impact: in an auto shop the sale completes at once and destroys items for nothing. Only a DM revert
     can recover them.
   - Fix: hide zero-offer rows or mark them "This shop pays nothing for this", and disable the button
     when `total === 0` in auto mode (approval mode can stay open for haggling).

4. **The "you own N" badge does not link to the inventory (UX acceptance gap).**
   - Where: `src/features/shops/ui/listing-card.tsx:59-66` (plain `Badge`) and the listing drawer at
     `listing-card.tsx:140-141` (plain number). The only inventory link appears in the notice after a
     purchase (`storefront.tsx:236-240`).
   - All viewports (browser: 0 links inside `.owned-badge`).
   - Impact: acceptance says the Player sees "you own N" linking to their current inventory. Players
     cannot check what they carry before buying.
   - Fix: make the drawer's "You own" row (and optionally the badge) a semantic link to
     `/campaign/:id/inventory`, with a 44px target.

5. **The cart shows the load after buying, but not before → after (UX acceptance gap).**
   - Where: `src/features/shops/ui/cart-drawer.tsx:168-183`.
   - All viewports (browser: "Load after buying 23.6 of 210 lb · Unencumbered"). Gold correctly shows
     120 → 79.
   - Impact: the acceptance asks for gold **and load** before → after. The Player cannot see whether
     this cart crosses an encumbrance threshold relative to now.
   - Fix: mirror the gold row: current load → new load, with the status when it changes.

6. **The ledger's "Needs your answer (N)" counts counter-offers that are waiting on the Player.**
   - Where: `admin-panel.tsx:562` and `602-606` (`isOpenOrder` includes `countered`) versus the tab
     badge at `admin-panel.tsx:128-136` (`pending_orders` only).
   - Phone and tablet, light/dark (browser): before the counter, the tab badge shows **1** and the
     heading shows **(2)**. After the DM counters, the badge disappears but the heading still says
     "Needs your answer (2)", although both cards say "Waiting for the player to answer."
   - Impact: the DM's "pending first" triage contradicts itself and makes the DM think action is needed.
   - Fix: split into "Needs your answer" (pending) and "Waiting for players" (countered), or rename the
     section "Open orders" so it matches the badge semantics.

### Minor

7. **Order titles say the purchase happened even when it did not.** `orders.tsx:83-86`,
   `shops-es.ts:109-110`, `shops-en.ts:106-107`. Pending, countered, rejected and cancelled requests read
   "Arin compró en… / Arin bought at…". Use status-neutral wording such as "Pedido de Arin en…" /
   "Arin's order at…". On the Player side, consider second person.
8. **No i18next plurals (ADR 015 requires them).** Seen in the browser: "1 unidades" / "1 units"
   (`shops-es.ts:196`, `shops-en.ts:193`) and "1 devueltos" (`shops-es.ts:114`). Found in code with the
   same problem: `cart.openNamed` "1 objetos/items" (`shops-es.ts:74`, `shops-en.ts:71`) and
   `admin.pendingCount` "1 peticiones" (`shops-es.ts:156`, `shops-en.ts:153`).
9. **At 150% text on a phone, the purse-bar cart button clips its label.** `storefront.tsx:170-189`,
   `styles.css:2653`. "Carrito: 1 por 40 po" wraps to three lines and "Carrito:" is cut at the right
   edge (`storefront-150-scrolled.png`). The purse-bar button and the sticky dock also show the same
   CTA at once. On phones, consider an icon plus count in the purse bar and let the dock carry the full
   text.
10. **Order line price hints are cryptic.** `shops-es.ts:112-113`: "oferta, lista 20" and "contraoferta,
    pedía 15" next to a line total. Something like "Ofreces 15 c/u (lista 20)" would be clearer.
11. **The phone shop switcher has no scroll affordance.** `styles.css:2666`. The second shop is cut off
    ("El Yunque de Ámba") with no edge fade. The inventory category rail has one (ADR 015).
12. **Multi-character Players always use their first character.** `api.ts:60` selects
    `characters.data[0]`. `CharacterPicker` (`visuals.tsx:36-52`) is unused. Not tested in a browser
    (the fixture has one character).
13. **The `.mantine-Alert-closeButton` 44px override is global** (`styles.css:2811`) and affects every
    alert in the app, outside the RYT-005 scope. That is probably desirable, but it should be a
    deliberate shared change.

## What works (observed)

- Player: gold is always visible in a sticky purse bar. The per-character discount badge, struck list
  price and "Only for you" exclusives are clear. The listing drawer and cart drawer open from the
  keyboard, close with Escape and return focus to their trigger (purse button, dock button, listing
  button). The purchase lands in the RYT-004 inventory, and the ledger shows "compra".
- Approval flow: offer per unit, note to DM, approval help text, the countered card with Accept/Decline,
  and Cancel request.
- DM: multiple shops, visibility (hidden/party/selected with per-character checkboxes), per-listing
  visibility, per-character modifier, auto vs approval, resale %, open/closed, counter modal with live
  total, revert modal with consequences, ledger filters.
- The Player preview hides the Add buttons and states "Las compras están desactivadas en esta vista".
- Light theme contrast and hierarchy are good. Headings and badges follow the RYT-025 type tokens.

## Tested scenarios

Tested in a browser (Playwright, Chromium, HTTP fixture, no live backend):

- `tests/e2e/shops.spec.ts` on identity-mobile (390), identity-tablet (820) and identity-desktop (1440):
  12/12 passed (axe, 44px targets, no overflow, reduced motion).
- Reviewer probes `docs/evidence/RYT-005/reviewer/reviewer.spec.ts`, phone 390 and tablet 820, all
  8 passed:
  - Player, English + light: storefront, listing drawer (keyboard open, Escape, focus return), cart
    (keyboard, Escape, focus return; dock path), auto-shop sell with a zero offer, orders. Axe clean.
  - Player, Spanish + dark at 150% root font size: storefront, cart, orders, scrolled sticky purse bar.
    Axe clean on the phone.
  - DM, English + light: admin, shop editor (focus on open, Escape → focus lost), listing editor
    (Escape → focus returned), ledger counts, counter modal Escape (returned) and submit (lost), revert
    submit (lost), archive (no confirmation).
  - DM Player-view preview: only the "no character" state could be reached with the fixture.

Inspected only in code or screenshots: approval-mode sell, closed-shop states, sold-out listings,
over-capacity warning, the short-of-gold alert, rejected/cancelled/reverted cards, and the
`hiddenModule` gate (asserted by the e2e but not visually reviewed).

## Evidence

- `docs/evidence/RYT-005/reviewer/run/**` (storefront, cart, orders, sell, admin-shops, shop-editor,
  counter, ledger × 3 viewports)
- `docs/evidence/RYT-005/reviewer/run-reviewer/**` (storefront-en-light, listing-drawer-en-light,
  cart-en-light, sell-zero-en-light, orders-en-light, storefront-150, cart-150, orders-150,
  storefront-150-scrolled, admin-en-light, shop-editor-en-light, ledger-en-light,
  after-archive-en-light, player-preview)
- Reviewer script and config: `docs/evidence/RYT-005/reviewer/reviewer.spec.ts`,
  `docs/evidence/RYT-005/reviewer/playwright.reviewer.config.ts`

## Limitations and untested states

- Fixture only. Hosted Supabase, realtime refresh, concurrent last-item purchases and their retry
  feedback were not exercised in the UI.
- The Player preview with a linked character (the populated read-only storefront) was not reachable with
  the DM fixture.
- Multi-character Players, very long shop or item names, and many shops/listings were not tested.
- 150% text was emulated through the root font size, not OS or browser zoom. Chromium touch emulation
  does not verify iOS Safari.
- One axe color-contrast result (5 nodes, tablet, cart at 150%) came from a run without reduced motion
  and is most likely a drawer-transition artifact. It did not reproduce on the phone or with reduced
  motion and is not counted as a finding.
- The archive RPC is not implemented in the fixture (it showed an error notice), so the post-archive
  state was not seen. The missing confirmation is confirmed in both the code and the browser.

## Re-review (2026-11-02)

Focused re-review of the coordinator's fixes for findings 1-13, on the current working tree. Same role,
code read-only. The preview was rebuilt from current source by the Playwright webServer.

### Verdict

**PASS**

All six major findings are resolved and verified in a browser at 390px and 820px. The minors are
resolved too, and two small residual observations remain (below). Neither blocks the delivery.

### Verification per finding

| # | Status | Browser evidence (phone 390 and tablet 820) |
|---|--------|---------------------------------------------|
| 1 Focus | Resolved | Shop editor Escape → `Edit`. Archive-listing confirm Escape → its trigger. Confirmed archive → `H1 Shops`. Counter and revert, with 700 ms of injected RPC latency, settle on `H1 Shops` instead of BODY. The cart drawer and listing drawer still return focus to their trigger. |
| 2 Archive | Resolved | `Archive <shop>?` and `Remove <item> from the shop?` modals explain the consequences, with `Cancel` autofocused and Escape working. Confirming removes the shop (3 → 2) and announces "Shop … archived." Axe is clean. |
| 3 Zero sell | Resolved | In the auto shop, rows that pay 0 are excluded and named ("No compra: Escudo, Flecha."). The sell button is disabled with nothing chosen. |
| 4 Inventory link | Resolved | "Tienes 4 en el inventario" is a link to `#/campaign/:id/inventory`, 44px tall. The drawer has "Ver en el inventario" (44px). |
| 5 Load before → after | Resolved | "23 lb → 23,5 de 210 lb · Sin carga". |
| 6 Ledger | Resolved | Tab badge 1 = "Needs your answer (1)", plus a separate "Waiting for the player (1)". After a counter: "Waiting for the player (2)", and the needs-answer section disappears together with the badge. |
| 7 Titles | Resolved | "Pedido de Arin en… / Arin ordered at…" for open orders; "compró / bought" only once settled. |
| 8 Plurals | Resolved in code | `_one`/`_other` keys are present. In the browser, "Queda 1" (singular) appears. |
| 9 150% purse bar | Resolved | The purse-bar cart button is hidden while the dock shows. At 150% the dock label wraps without clipping (measured `scrollWidth <= clientWidth`). |
| 10 Price hints | Resolved | "Precio 20 po c/u, oferta 15 po c/u" / "Pedía 15 po c/u, contraoferta 18 po c/u". |
| 11 Switcher fade | Resolved in code and screenshot | No regression observed. |
| 12 Character picker | Resolved by product rule | One character per Player per campaign (ADR 004). The unused picker was removed. |
| 13 Alert override | Resolved in code | Scoped to `.storefront` / `.shop-admin` (see the `.mantine-Alert-closeButton` selectors in `styles.css`). |

Additional checks: the original `tests/e2e/shops.spec.ts` passed 12/12 on identity-mobile, tablet and
desktop against the current source, with output in `run-rereview-spec/`. The re-review probes in
`reviewer-rereview.spec.ts` passed 6/6 on phone and tablet. Axe found no violations and there was no
horizontal overflow on the cart, sell tab, archive confirm, ledger and storefront at 150%. No page
errors.

### Residual observations (minor, non-blocking)

- R1. After a counter-offer or revert, focus settles on the page `H1` rather than near the affected
  order (`orders.tsx` setDialog falls back once the opener and card re-render). Focus is no longer lost,
  but on a long ledger the DM is sent to the top. Consider focusing the status notice or the moved card.
- R2. The cart row label still reads "Carga tras comprar / Load after buying" while it now shows
  before → after (`cart-drawer.tsx`, `cart.loadChange`). A label such as "Carga" would match "Tu oro".

### Limitations of the re-review

- Fixture only. The HTTP fixture throws when it lists orders of an archived shop
  (`tests/e2e/fixtures/shops.ts:323`), so the probe archived the shop without orders. How the ledger
  shows orders of an archived shop against real SQL was not seen in the UI.
- Not re-tested: the Player preview with a linked character, iOS Safari, and real OS text zoom.
- The approval-mode sell with zero-offer rows was inspected only in code (the same exclusion path).

### Re-review evidence

- `docs/evidence/RYT-005/reviewer/run-rereview/**` (cart, listing-drawer, sell, orders,
  storefront-150, storefront-150-scrolled, archive-listing-confirm, archive-shop-confirm,
  after-archive, ledger, ledger-after)
- `docs/evidence/RYT-005/reviewer/run-rereview-spec/**` (original spec screenshots, current source)
- `docs/evidence/RYT-005/reviewer/reviewer-rereview.spec.ts`

## DM redesign review (2026-11-02)

Scope: the DM-side redesign (`admin-panel.tsx`, `shop-controls.tsx`, `stock-list.tsx`,
`price-modifiers.tsx`, `ledger.tsx`, DM parts of `orders.tsx`, `editors.tsx`, the "RYT-005 DM panel"
styles and the new strings). The storefront is unchanged and was not re-reviewed. Code was read-only.
The build and preview were isolated (scratchpad outDir, port 4184), because ports 4173/4174 were in
use by another run.

### Verdict

**CHANGES_REQUIRED**

The direction is right and mostly well executed:
- Shop settings are switches, segmented controls, chips and sliders instead of a form.
- Stock rows expand in place, with steppers and price shortcuts.
- The item picker is a multi-select icon grid.
- The ledger has segmented views with counts and an inline counter-offer with "Su oferta / Mitad /
  Lista" chips.
- Revert uses the RYT-004 hold seal.
- Axe is clean in every captured state (ES dark, EN light, 150%, 390/820).

Creating a shop by name only, adding several items, changing a listing's price/stock/visibility and
countering are clearly easier than before. But auto-save can silently drop or misreport changes, its
feedback is often off-screen, focus drops to the body when the inline order panels open, and the phone
layout overflows at 150% text.

### Findings

#### Major

D1. **Auto-save drops changes silently, and the resale slider can show a value that was never saved.**
- Where: `shop-controls.tsx:86-93` (`save` ignores calls while `busy`) and `shop-controls.tsx:227-233`
  (`dragging` is only cleared when it equals the server value).
- Browser, phone and tablet, with 1.2 s of injected latency on `save_shop`/`set_shop_modifier`:
  - Tapping "Oculta" and then "Con aprobación del DM" within 150 ms sends **one** `save_shop`. Mode
    stays "Compra directa", with no message about the ignored tap. The only notice says
    "Mercado del puerto: Oculta."
  - Focusing "Compra objetos al" and pressing ArrowRight 3 times sends resale **55**. The UI keeps
    showing **65** ("Paga el 65 %", `aria-valuenow=65`) after everything settles.
  - The modifier slider jumps back without a message (two presses → one save, −25).
- Impact: the DM believes a money rule is live when it is not. Mantine's Slider fires `onChangeEnd` on
  every arrow key, so keyboard users hit this even with modest latency.
- Fix:
  - Coalesce or queue the latest change instead of ignoring it, for example by saving the newest draft
    when the in-flight request settles, or by debouncing keyboard slider commits.
  - Always reconcile `dragging` with the server value after a save resolves or is skipped.
  - Show a per-control saving/saved state.

D2. **Auto-save feedback is usually off-screen.**
- Where: `admin-panel.tsx:110-121`. The single notice sits under the H1.
- Browser: after saving the "Precio para Arin" slider on a phone, the notice is **685 px above the
  viewport** (tablet: 59 px above). During a save, nothing near the control indicates it (0
  loading/busy markers).
- Impact: this is the user's explicit question. Sighted DMs editing the lower controls get no
  confirmation (screen readers do get the polite live region). Combined with D1, the DM cannot tell
  whether a change stuck.
- Fix: inline "Guardando… / Guardado" or a check next to each auto-saving group (open switch,
  visibility, mode, resale, each modifier row), or a toast anchored above the bottom bar. Keep the
  live region.

D3. **Focus drops to the body when the counter or revert panel opens.**
- Where: `orders.tsx:250` and `orders.tsx:336`. The action row containing the focused
  "Contraofertar" / "Revertir" button unmounts once `panel` is set.
- Browser, phone and tablet: `document.activeElement` is BODY after opening either panel. Escape does
  not close the inline panel.
- Impact: keyboard and screen-reader users lose their place right at the most consequential actions.
- Fix: focus the first control in the panel on open (the first price chip, or the seal for revert).
  Return focus to the trigger on Cancel. Optionally close the panel on Escape.

D4. **The DM panel overflows horizontally on a 390 px phone at 150% text.**
- Where: `styles.css:2835`. `.admin-shops { grid-template-columns: 1fr }` is `minmax(auto, 1fr)`, so
  the column grows to its children's min-content width. The listing "Quién ve este objeto"
  SegmentedControl in the stock editor does not wrap labels; the `.shop-controls` wrap rule does not
  reach `.stock-row-editor`.
- Browser (EN light, 150%): `scrollWidth` is **515** on 390, with the culprits `nav.admin-shop-list`
  and `section.admin-shop-detail` (right = 484). `stock-en-light-150.png` shows the visibility
  segments cut off.
- Fix: use `minmax(0, 1fr)`, wrap or stack the stock-editor segmented options below 48em, and add a
  150% overflow assertion for the DM panel.

#### Minor

D5. **Adding an item without a DM value lists it at 0 gp.** `admin-panel.tsx:258`
  (`price: item.value_gp ?? 0`, visibility `shop`). The tile says "Sin valor" (Armadura de cuero,
  Escudo in the fixture), but the new listing is free and visible to the party. Add such items hidden,
  or ask for a price.

D6. **Slider thumbs are 28 px (42 px at 150%), and the sliders have no `aria-valuetext`.**
  `shop-controls.tsx:226-236`, `price-modifiers.tsx:51-67`. The track is tappable, so this is not
  blocking. But screen readers announce "50" / "-20" instead of "Paga el 50 %" / "20 % de descuento".
  Add value text and consider a ≥ 36 px thumb.

D7. **Collapsing an expanded stock row silently discards unsaved edits.** `stock-list.tsx:157-161`.
  The price edited 50 → 62, then collapsing and reopening the row shows 50. Add a hint, or keep the
  draft until Discard.

D8. **Reject on a pending request takes one tap, with no confirmation or undo.** `orders.tsx`, pending
  action row. Consider an inline confirm or an undo notice.

D9. **The stepper hold makes one +10 jump and does not repeat.** `stock-list.tsx:62-69`, shared
  `useLongPress`. Browser: a 1.5 s hold takes 50 → 60. This matches ADR 015 and the hint is honest.
  Noted only because the user asked about the hold; the % shortcuts cover large prices.

### What works (observed)

- **Create:** name + hidden/party only. The new shop becomes selected.
- **Open switch:** keeps focus (delivery e2e).
- **Access:** character chips are 44 px.
- **Stock row:** expands with `aria-expanded`/`aria-controls`.
  - Price stepper: −/+ are 44 px, and Enter and Space work.
  - Shortcuts: "Valor: 50 po", −10%, +10%, +25%.
  - Ilimitadas/Limitadas with a units stepper.
  - Per-item visibility with chips.
  - Save returns focus to the row.
- **Picker:** at 390 px it is a bottom drawer with 173×126 tiles, `aria-pressed`, search, category
  chips and a sticky "Añadir N objetos" dock. Escape returns focus to "Añadir objeto".
- **Ledger:** "Por responder (1) / Esperando al jugador (1) / Historial (1)", defaulting to what needs
  the DM.
- **Counter panel:** price chips plus input, with a live "Contraofertar 30 po" button.
- **Revert panel:** an 88 px seal with "Mantén pulsado el sello. Con teclado, pulsa Intro.". A quick tap
  does not revert.
- **English and light theme** are complete and consistent with the RYT-025 tokens.

### Tested scenarios (browser, isolated build, phone 390 and tablet 820)

- `reviewer-dm.spec.ts`:
  - ES dark with reduced motion: admin, slider semantics, modifier-save feedback position, stepper
    hold and keyboard, unsaved-edit collapse, picker (tiles, axe, Escape focus), ledger views, counter
    panel (focus, Escape), revert panel (focus, seal size, quick tap).
  - Latency run (1.2 s): two quick segmented changes, three resale arrow presses, two modifier arrow
    presses, with request-body capture.
  - EN light at 150%: admin, stock editor, counter, revert.
- `reviewer-dm-overflow.spec.ts`: the 150% overflow culprit search (phone).
- Not re-run by me: the delivery `tests/e2e/shops.spec.ts`. Ports 4173/4174 were held by a concurrent
  run and that config does not reuse servers. The coordinator reports 12/12.

### Limitations

- Fixture only, with no hosted Supabase. Latency was simulated with route delays.
- Not checked: iOS Safari, real OS zoom, long names, more than one character (the ledger character
  chips and multi-character access wrapping appear only then).
- Rename and create dialogs at 150% were inspected only in code. Animation timing without reduced
  motion was not compared.

### Evidence

- `docs/evidence/RYT-005/reviewer/run-dm/**` (admin, modifier-saved-viewport, stock-editor, picker,
  ledger, counter-panel, revert-panel, revert-after-tap, during-save, after-latency,
  admin-en-light-150, stock-en-light-150, ledger-counter-en-light-150, revert-en-light-150)
- `docs/evidence/RYT-005/reviewer/run-dm-overflow/`
- `reviewer-dm.spec.ts`, `reviewer-dm-overflow.spec.ts`, `playwright.dm.config.ts` (same folder)

## DM redesign re-review (2026-11-02)

This is a focused re-review of fixes D1-D8 on the current working tree. Code was read-only. I used an
isolated build and preview (scratchpad outDir, port 4184), with the probes in
`reviewer-dm-rereview.spec.ts` run at phone 390 and tablet 820. All 8 tests passed (findings are
logged, not asserted).

### Verdict

**CHANGES_REQUIRED**

D1-D7 are resolved and verified in a browser. The new D8 reject confirmation brings in one keyboard
focus loss (the same class as D3) and one axe contrast failure. Both are small fixes, but they are
concrete regressions on a consequential action.

### Verification of D1-D9

| # | Status | Browser evidence |
|---|--------|------------------|
| D1 Auto-save | Resolved | With 1.2 s of latency, I tapped "Oculta" then "Con aprobación del DM" within 150 ms. Two saves were sent (`hidden/auto`, then `hidden/approval`) and both segments stayed active after the save settled. Three resale ArrowRight presses sent **one** save of **65**; the slider stayed at 65 / "Paga el 65 %" and kept focus. For the modifier, two presses, then one more during the in-flight save, sent −30 and then −35; the slider shows −35 throughout. When `save_shop` returns a forced 500, the segment reverts to the server value ("Compra directa"). |
| D2 Feedback | Resolved | The pill "Guardando…" (spinner) and then "Cambios en Mercado del puerto guardados." / "Precios de Arin guardados." is always in the viewport (phone y≈714-720, above the bottom bar; tablet at the bottom). It auto-hides after about 5 s. Errors use `role="alert"` with "No se pudo completar…". The card says changes save themselves. |
| D3 Focus | Resolved | Opening counter puts focus in `group "Contraoferta"`, and Escape closes it and returns focus to `Contraofertar`. Revert works the same way (`group "Revertir pedido"`, Escape back to `Revertir`). After a counter or revert settles, the card article has focus. Minor: right after sending a counter, focus is on BODY until the response arrives (about the RPC latency), and then it moves to the card. |
| D4 150% overflow | Resolved | EN light at 150%, phone and tablet: overflow is 0 on the admin, the stock editor, the picker and the counter panel. Segment labels wrap ("Like the shop / Hidden / Some characters"). |
| D5 No-value items | Resolved | Escudo is added as "Hidden · 0 gp". The pill says "1 item added. With no DM value, 1 is hidden: price it and show it." The picker help explains this. |
| D6 Sliders | Resolved | `aria-valuetext` is "Paga el 65 %" / "Pays 50%" / "20% discount for you". The thumb hit box measures 48 px. |
| D7 Unsaved edits | Resolved | A collapsed dirty row shows "Unsaved", and reopening resumes 51 gp. |
| D8 Reject confirm | Partly (see R1, R2) | "Sí, rechazar / No" now appears inline instead of rejecting immediately. |
| D9 | Accepted | Single +10 hold jump, per ADR 015. |

Axe is clean on the admin, stock editor, picker and counter panel at 150% EN light, and on all latency
and ledger states except the R2 state below.

### Findings

#### Major

R1. **Focus drops to the body in the reject confirmation, and Escape does not cancel it.**
- Where: `orders.tsx:288-290`. `data-autofocus` only works inside Mantine Modal/FocusTrap, and the
  focused "Rechazar" button unmounts when `confirmReject` flips.
- Browser, phone and tablet: focus "Rechazar" and press Enter. `document.activeElement` is BODY.
  Escape leaves "Sí, rechazar" visible, and focus is still BODY. Clicking "No" also leaves focus on
  BODY.
- Impact: keyboard and screen-reader users lose their place at the exact moment they must confirm or
  back out. This is the same rule D3 fixed for counter and revert.
- Fix: focus "No" (the safer default) or "Sí, rechazar" with a ref after the flip, return focus to
  "Rechazar" on No/Escape, and handle Escape on the group.

R2. **"Sí, rechazar" fails contrast in dark mode.**
- Where: `orders.tsx:290` (`<Button color="red">`). Its computed text is white
  `rgb(255,255,255)` on `rgb(255,168,168)`, about 1.8:1.
- Axe: `color-contrast` on `button[data-autofocus] .mantine-Button-label`, phone and tablet, ES dark
  (`reject-confirm.png`).
- Fix: use the danger token pattern used elsewhere, for example `variant="light" color="red"` like
  "Revertir", or a filled danger colour with dark text. Then re-run axe on this state. It is not in
  the delivery e2e audit list.

#### Minor

R3. **On a phone, the saving pill covers the bottom of the page while it is visible.** During a modifier
  save it overlays the slider being used (`pill-modifier.png`), and at 150% it is 108 px tall. It
  auto-hides and can be closed, so this does not block. Reserving bottom padding while the pill shows
  would avoid covering the active control.

R4. **Focus is briefly on BODY between sending a counter-offer and the response.** See D3 above.
  Focusing the card (or keeping focus on the panel's group) right away would remove the gap.

### Tested scenarios (browser)

- Latency (1.2 s): rapid segmented changes, a resale arrow burst, a modifier queue during an in-flight
  save, pill visibility and auto-hide.
- Forced 500 on `save_shop`: revert to the server value and the alert pill.
- Ledger with 700 ms latency: counter open/Escape, reject confirm (focus, Escape, No), counter via
  "Mitad" with focus after it settles, revert open/Escape, seal via keyboard and focus after it settles.
- EN light at 150%: admin, slider value text and thumbs, stock editor, unsaved badge, picker help,
  adding a no-value item, counter panel. Axe and overflow on each.

Not re-run by me: `tests/e2e/shops.spec.ts`, because ports 4173/4174 were held by the coordinator's
run. The coordinator reports 15/15.

### Limitations

- Fixture only. Latency and errors were simulated with route handlers.
- Not covered: more than one character, iOS Safari, and real OS zoom.

Final check on the current source: after the coordinator's lint fix in `price-modifiers.tsx`
(10:30), I rebuilt and re-ran all 8 probes with output in `run-dm-rereview-final/`. The results are
identical: D1 modifier queue −30 → −35, R1 focus on BODY, R2 contrast failure.

### Evidence

- `docs/evidence/RYT-005/reviewer/run-dm-rereview-final/**` (final run on the current source)
- `docs/evidence/RYT-005/reviewer/run-dm-rereview/**` (pill-saving, pill-modifier, pill-error,
  reject-confirm, after-counter, revert-panel, admin-150, stock-150, picker-150, after-add-150,
  counter-150)
- `docs/evidence/RYT-005/reviewer/run-dm-rereview-axe/` (axe on the reject-confirm state)
- `docs/evidence/RYT-005/reviewer/reviewer-dm-rereview.spec.ts`, `playwright.dm.config.ts`

## DM redesign re-review 2 (2026-11-02)

This is a focused re-check of R1-R4 on the current source. I rebuilt an isolated preview (port 4184)
for each run, using phone 390 and tablet 820 with ES dark, plus EN light at 150% for the pill. Code was
read-only.

### Verdict

**PASS**

R1-R4 are resolved in the browser. No blocking findings remain from any DM redesign round.

### Verification

| # | Status | Browser evidence |
|---|--------|------------------|
| R1 Reject focus | Resolved | Enter on "Rechazar" puts focus on `No`. Escape closes the confirmation and returns focus to `Rechazar`. Clicking `No` returns focus to `Rechazar`. After a counter or revert settles, the card article has focus. |
| R2 Contrast | Resolved | "Sí, rechazar" computes `rgb(255,245,245)` on `rgb(101,21,21)` (light red, the same style as Revertir). Axe on the confirm state: 0 violations on phone and tablet. |
| R3 Pill size | Resolved | 44 px tall during saves on phone and tablet. At 150% EN light, the longest message ("1 item added. With no DM value, 1 is hidden…") is one line, 76 px tall; it was 108 px before. The full text stays in the live region. |
| R4 Counter focus | Resolved | Focus is on the card article immediately and 120 ms after "Contraofertar N po" with 700 ms of RPC latency, and stays there after the response. In the earlier full-probe run, one synchronous read right after the click returned BODY, but the dedicated re-run (`run-dm-rereview2-focus/`) showed the article at every check. I treat it as a measurement-timing artifact, not a defect. |

### Remaining notes (non-blocking)

- When it is visible, the pill still overlaps the bottom of the page above the phone bottom bar. It is
  now 44 px, auto-hides after about 5 s and can be closed, so I do not count it as a finding.
- The single-line ellipsis can visually truncate long confirmations on phones (for example, the
  no-value item message). Screen readers get the full text. Consider showing the full text on
  tap/expand if DMs miss the hint.

### Tests and limits

- Re-run on the current source: `reviewer-dm-rereview.spec.ts` (8/8, `run-dm-rereview2/`) and the
  focused D3 re-run (2/2, `run-dm-rereview2-focus/`).
- Not run by me: `tests/e2e/shops.spec.ts` (coordinator: 15/15 twice) and `npm run check`
  (coordinator: passes).
- Fixture only. Not covered: iOS Safari, real OS zoom, and more than one character.

### Evidence

- `docs/evidence/RYT-005/reviewer/run-dm-rereview2/**`
- `docs/evidence/RYT-005/reviewer/run-dm-rereview2-focus/**`
- `docs/evidence/RYT-005/reviewer/reviewer-dm-rereview.spec.ts` (adds the No-button and in-flight focus
  probes)

## CI fix check (2026-11-02)

This checks the CI fix `.touch-slider { padding-inline: 18px; }` (`src/app/styles.css:2870-2874`) on the
current uncommitted tree (branch `ryt-005-shops`). I used an isolated build (port 4184) at 390 and
820 px with 150% text and injected `* { font-family: Verdana, "DejaVu Sans", sans-serif }` to mimic
Linux metrics, in ES dark and EN light. Probe: `reviewer-dm-ci.spec.ts`, 4/4.

### Verdict

**PASS**

### Evidence

- **Overflow:** `scrollWidth − innerWidth` is 0 in all four runs (phone/tablet × dark/light).
- **End-mark labels:**
  - Phone resale: labels span 50-352 inside the card (16-374).
  - Phone discount: labels span 18-375. That is at the content edge (1 px past the section, still
    inside the 16 px page gutter of the 390 viewport).
  - Tablet: resale 314-782, discount 282-805, inside the 820 viewport.
- **Alignment:** both tracks are inset by the same 18 px from their headings (resale: heading 47 →
  track 65; discount: heading 16 → track 34). The first/last mark labels are centred under the track
  ends, and the result reads as intentional alignment with the card content (`controls-*.png`,
  `modifiers-*.png`).
- **Hit area and labels:**
  - Thumbs measure 48×48 with a 60 px `::before` hit area.
  - `aria-label` is "Compra objetos al" / "Precio para Arin" ("Buys items at" / "Price for Arin").
  - `aria-valuetext` is "Paga el 50 %" / "20 % de descuento para ti". ArrowRight updates it
    ("15 % de descuento para ti").
- **Axe:** 0 violations in all four runs.

### Notes (non-blocking, not caused by this change)

- With the injected Verdana at 150% on a 390 px phone, the segmented labels and the long shop title
  wrap mid-word ("Hidd/en", "Som/e char/acter/s", "Merca/do"). This comes from the existing wrap rules
  under an extreme font stress. System fonts at 150% wrap at word boundaries, as earlier rounds showed.
  Consider `overflow-wrap: break-word` with `hyphens: auto` on `.wrap-segments` if this shows up on
  real Linux or Android devices.
- The `characters.spec.ts` change is test-only and was not reviewed as UI.

### Limits

- Font metrics were simulated with Verdana/DejaVu on Windows Chromium, not a Linux CI runner.
- I did not run the CI suite or `tests/e2e/shops.spec.ts` myself.

### Evidence paths

- `docs/evidence/RYT-005/reviewer/run-ci-fix/**`
- `docs/evidence/RYT-005/reviewer/reviewer-dm-ci.spec.ts`
