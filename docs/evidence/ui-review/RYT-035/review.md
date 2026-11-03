# RYT-035 independent UI/UX review

- Reviewer: `ui-ux` (role `.codex/agents/ui-ux.toml`), independent of the implementation.
- Date: 2026-11-03.
- Reviewed commits: `dd34abb` (initial review), then `c9e651c` (re-review, see the end of
  this file).
- Source fingerprints (`node scripts/check-ui-review.mjs --fingerprint`): `dd34abb`
  `8abebfa0cd1847156e79e38e1b0b8915ef45025402127395a0c6ccec890247d4`; `c9e651c`
  `ee12b28ee283d10eaf3b78bbbccec8bddd9afa5cc6655c11bff1a7c737a1b050`.
- Preview: `http://127.0.0.1:4180/rytta-dnd-app/` (Supabase-mode build), every network call
  served by the committed Playwright HTTP fixtures (`identityFixture` with
  `{ party: true, sheet: 'complete', inventory: true, modules: ['party','inventory','shops'] }`,
  `{ player: true, ... }` for the Player, plus `shopsFixture`).
- Acceptance criteria: `docs/backlog/items.json` `RYT-035`.

## Initial verdict summary (`dd34abb`)

The delivery fixes most of what it set out to fix and looks consistent at 100% text on
phone, tablet and laptop. Two acceptance criteria still fail in the browser at 150% text on a
390px phone, though: the DM header and the bottom bar wrap, and the DM Command Center page
head fills the whole first screen. The validation doc says 150% was covered. There is also a
mid-word break in the DM shop title at 150%, and AC still looks different on the Player's own
card and on teammate cards. Details are under Findings.

## Method

### Browser testing (Chromium `/opt/pw-browsers/chromium`, Playwright 4 projects)

Profiles: laptop 1366×768, tablet 820×1180 (touch), tablet landscape 1180×820 (touch),
Pixel 7 at 390×844 (mobile, touch).

1. Capture pass: 128 tests, all passed. Each one ran in all four profiles.
   - DM routes: hub, campaign landing, Command Center (members, modules, items, audit), Party,
     sheet, creation wizard, inventory, shops admin, ledger, settings.
   - Player routes: hub, landing, Party, own sheet, peer sheet (forbidden state), inventory,
     equipment, shops buy, sell, orders, settings.
   - Each run took a full-page and a first-screen screenshot, ran axe (WCAG 2.1 A/AA), and
     measured horizontal overflow, controls under 44px, text under 12px, h1 count and console
     errors.
2. Variant pass, in all four profiles, for DM and Player:
   - light scheme on Party, sheet, inventory and shops
   - English with the Wizard theme on Party, sheet and shops
   - 150% root font size (the same method as the repo e2e suite) on Party, sheet, inventory
     and shops
   - overlays: invite, new item, Party ⋯ menu, Player-view picker, Player preview, item
     detail sheet, cart dock, damage dialog
3. Focused probes (mobile, tablet, laptop):
   - Resource steppers: three quick + on Arin's water, then + on Bea's water. I checked that
     Bea's button never disabled, the final values (Arin 3→6, Bea 9→10) and the RPC order (one
     `set_character_resources` per step, queued per character).
   - Escape and focus return: the gold editor, ⋯ menu, Create character dialog, damage dialog
     and New item drawer all return focus to their trigger. The invite dialog was checked in
     the variant pass. The live-share `Switch` toggles with Space.
   - Settings: opening it from the Profile menu shows a `Volver` button, and that button
     returns to Party.
   - Module switches: planned modules are disabled. A planned key stored on the campaign
     (`quests`) can still be switched off. Player navigation lists only Grupo, Inventario and
     Tiendas. I also opened `/quests` directly as a Player.
   - Header and bottom-bar height at 150% in ES/EN for DM and Player, on Center, Party, Ledger,
     Hub and Settings.
   - Phone keyboard: arrow keys move between DM Command Center tabs, and Tab runs through the
     module switches.
4. I looked at the actual PNG screenshots, not only the numbers. The supporting captures are
   in this folder.

Automated results: no axe violations on any captured screen or variant. No horizontal page
overflow. Exactly one h1 on every screen. No visible control under 44px; the only hits were
1×1 visually hidden file inputs. No text under 12px. The only console errors are fixture
Realtime WebSocket tunnel failures (environmental). The offscreen controls on phones are the
scrolling chip, tab and shop-picker rows, which is intended.

### Code inspection (not browser-verified)

- `src/shared/ui/page-head.tsx`, the RYT-035 CSS block in `src/app/styles.css` (header,
  bottom nav, page head, sliders, drawers).
- `party.tsx`, plus the `useResourceAction` call sites, `LiveShareToggle`, the teammate card,
  `shop-controls.tsx`, `price-modifiers.tsx`, `cart-drawer.tsx`, `module-page.tsx` and
  `router.tsx`.
- Reduced motion: I checked the CSS only (`prefers-reduced-motion` blocks exist; RYT-035 adds
  no new animation). I did not emulate it in the browser.

## Acceptance check

| Criterion                                                                   | Result                                                                                                                                                                          |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shops implemented; only implemented modules enabled/reachable by Players    | Pass in navigation and switches. Minor gap: a planned route can still be opened by URL (F8)                                                                                   |
| DM price modifiers name the character                                       | Pass ("Arin", "20 % de descuento", sample 50 → 40 po)                                                                                                                           |
| Steppers of one character never block another; immediate update            | Pass (browser probe)                                                                                                                                                            |
| Phone page heads keep content above the fold; header/bottom bar never wrap at 390px or 150% | **Fail at 150%** (F1, F2)                                                                                                                                       |
| Destructive/secondary actions consistent; exhaustion and AC read the same everywhere | Destructive actions and exhaustion: pass. **AC: fail** (F4)                                                                                                            |
| Settings shows no developer text and offers a way back                      | Pass                                                                                                                                                                            |
| No axe violations, overflow or targets under 44px at 390/820/1366           | Pass                                                                                                                                                                            |

## Findings

### F1 (Blocking): the phone header and bottom bar wrap at 150% text

- Where: `src/app/styles.css`
  - `.topbar` uses `flex-wrap: wrap` (line 135).
  - `.brand-bar` uses `flex: 1 1 9rem` (line 145), so it needs 216px at 150%.
  - `.bottom-nav-label` has a 2-line clamp (lines 1884-1893).
  - The `max-width: 36em` phone rule (lines 4442-4465) does not shrink enough.
- Viewport: Pixel 7, 390px, 150% root font size. Dark scheme; ES and EN.
- Reproduce: open any DM campaign route, for example `#/campaign/…/members`, and add
  `html{font-size:150%}`.
- What happens:
  - The header is 123px tall. The brand sits on row 1 and the `Jugador`/`Player` switch and
    Profile button drop to row 2. At 100% the header is about 72px.
  - The bottom bar item "Mando DM"/"DM Command" wraps to two lines (label 41px against 21px
    for the others).
  - On the hub, the Spanish tagline "TU COMPAÑERO DE MESA" wraps to two lines (header 100px,
    against 72px in English).
- Impact: this fails the acceptance criterion "header and bottom bar never wrap at 390px or
  150% text". The header and the bar take about 200px of an 844px screen. The 36em rule is
  meant to keep the header on one row.
- Evidence: `phone-150-dm-center-header-wrap.png`, `phone-150-en-ledger-nav-wrap.png`.

### F2 (Blocking): the DM Command Center page head fills the first screen at 150% on a phone

- Where:
  - `src/shared/ui/page-head.tsx`
  - In `src/app/styles.css`, the `.page-head-actions` phone rule (lines 4426-4441) puts the
    refresh control on its own full-width row.
  - `src/features/campaigns/ui/members.tsx`: the 2×2 tab grid.
- Viewport: 390px, 150%, ES. The same happens in EN.
- Reproduce: open `#/campaign/…/members` at 150%.
- What happens: everything on the first screen is head:
  - the h1 on two lines
  - the lede on two lines
  - a refresh row on its own, with about 80px of space under it
  - the 2×2 tabs, with "Almacén de objetos" on three lines

  The Members content starts below the fold, where only the "Miembros" heading peeks above the
  bottom bar. At 100% the content starts at about y=240, which is fine.
- Impact: fails "Phone page heads leave the main content above the fold" for text-zoom users.
  A shorter phone head would fix it: put refresh beside the h1, or put the tabs before the
  lede. So would smaller tab labels.
- Evidence: `phone-150-dm-center-header-wrap.png`.

### F3 (Major): the DM shop title breaks inside words at 150% on a phone

- Where: `src/features/shops/ui/shop-controls.tsx` lines 91-101. The title `div` has no
  `flex: 1`. The shared `.user-copy { overflow-wrap: anywhere }` (`styles.css` 344-350) lets
  it shrink to a sliver.
- Viewport: 390px, 150%, dark/ES.
- Reproduce: open `#/campaign/…/shops` and look at the Mercado del puerto card.
- What happens: the h2 renders as "Mercad / o del / puerto". The description is squeezed into
  about 40% of the card, and there is a large empty gap between the title column and the
  pencil and trash icons. At 100% the same narrow column wraps the description early
  ("Puestos de pescadores y / buhoneros.").
- Impact: the shop name is hard to read, and the card looks broken at text zoom.
- Evidence: `phone-150-shop-title-break.png`.

### F4 (Major): AC does not read the same everywhere

- Where: `src/features/characters/ui/party.tsx`
  - The own card and the DM cards use a `vital-chip` "CA 14" (lines 805-808).
  - The teammate card uses a 44px shield icon with a bare "16" (lines 431-439).
  - The sheet uses a "Clase de Armadura" tile, and the equipment view uses another bare
    shield.
- Viewport: every viewport; it is easiest to see on the 390px Player Party in dark/ES.
- Reproduce: as a Player, open `#/campaign/…/party`. Compare "CA 14" on "Tu personaje" with
  the shield "16" on Bea's teammate card.
- Impact: this is an explicit acceptance criterion. The teammate shield has no visible "CA"
  label, and only `aria-label` names it. On the same screen, HP also reads two ways: "PG
  30/38 +5" and "♡ 9/24 +3 temporales".
- Evidence: `phone-player-party-ac.png`.

### F5 (Minor): slider mark labels collide with the content that follows

- Where: `src/app/styles.css` 3083-3095. `.touch-slider` is declared twice
  (`padding-block: 10px`, then `padding-bottom: 18px`). Mark labels get `margin-top: 14px`,
  which the bottom padding does not fully clear.
- Viewport: 390px dark and light; it also happens on tablet.
- What happens: the per-character modifier marks (-50…+50) sit about 6px above the page
  footer "Para quienes comparten tu mesa.". The resale marks (0…100) touch their helper text.
  In light mode, the marks on the unfilled track are almost invisible.
- Evidence: `phone-price-slider-footer.png`.

### F6 (Minor): the load meter labels cross the card border at 150%

- Where: the balance legend in `src/features/inventory/ui/balance.tsx`.
- Viewport: 390px, 150%, DM and Player inventory.
- What happens: the "70 / 140 / 210" labels sit on the bottom border of the Carga card.
- Evidence: `phone-150-load-marks.png`.

### F7 (Minor): the Party card at 820px tablet has a hole beside the vitals

- Where: the Party card grid in the RYT-035 CSS block of `styles.css` (`.character-card`
  two-column layout).
- Viewport: 820×1180, dark/ES (DM).
- What happens: the left vitals box (HP, AC, Ver ficha) is about 120px tall. The resource
  column beside it is about 330px, which leaves an empty area of about 210px under the
  vitals in every card. This is the kind of grid hole the ticket fixed elsewhere. The laptop
  layout (vitals full width) does not have it.
- Evidence: `tablet-party-vitals-hole.png`.

### F8 (Minor): planned-module placeholders are still reachable by URL and use developer copy

- Where: `src/app/router.tsx` lines 77/81 (`*` → `ModulePage`) and
  `src/pages/module-page.tsx`.
- Reproduce: as a Player, open `#/campaign/…/quests`. The `quests` key is stored on the
  campaign but does not appear in navigation.
- What happens: the "Misiones · Módulo previsto · RYT-006" page renders. It says "Esta base
  define la navegación y el módulo…", which is the same kind of developer text the ticket
  removed from Settings. It also does not use `PageHead`.
- Impact: the page is honest that the module is planned, but it contradicts ADR 023 ("A
  planned module cannot be previewed by Players").

### F9 (Minor): smaller consistency and copy issues

- `shops-es.ts:183` (and `admin.modifier.*`): "0 %" wraps between "0" and "%" at 390px.
  Use a non-breaking space.
- `shop-controls.tsx:126-133`: the shop open `Switch size="lg"` label is larger than every
  other field label, and the switch floats centred on a four-line block.
- `cart-drawer.tsx:60`: the phone cart is a fixed `90%` bottom sheet, so a single item
  leaves half the sheet empty. Other phone sheets now fit their content.
- Gold editor: the dialog is titled "Oro de Arin", but its confirm button says "Guardar
  recursos".
- Sheet stat tiles at 390px: five tiles in three columns leave a hole. "Clase de Armadura"
  and "Percepción pasiva" wrap, which pushes their values lower than "+2" and "30 pies".
- `PageHead` is not used on inventory, the sheet or the DM shops page. DM shops has no lede,
  and its refresh sits under the tabs. That contradicts the new design-system rule "Every
  page starts with `PageHead`".
- The disabled planned-module switches have no `aria-describedby` that explains why they are
  disabled. The "Previsto" badge and lock icon are visual only.

## Verified as fixed (browser)

- Shops shows as implemented, and planned switches are locked.
- The DM modifier copy names the character.
- Steppers are independent and optimistic.
- Live sharing is a labelled switch.
- Exhaustion uses one dot meter for Player and teammates, and six 44px pips on one row for
  the DM.
- Red subtle and outline actions are legible in dark and light (axe clean).
- Phone bottom sheets hug their content (item detail).
- The save pill stays below dialogs.
- Settings shows no setup text and has a working Back button.
- The hub cards are equal height, and Decline is red.
- "Guardar y salir" is a real button.
- "Sin penalización" replaces "Sin carga".
- The ledger cards and purse line fit the 390px and 1366px layouts.
- At 100% text the phone header stays on one row, using the short "Jugador" label and an
  ellipsised campaign name.

## Untested

- Real Supabase, Realtime and RLS: fixtures only, and the fixture WebSocket fails to tunnel.
- iOS Safari and real touch devices.
- Phone landscape.
- The trade window flow.
- The More drawer, which is unreachable with three implemented modules.
- The stale-revision alert path of `useResourceAction`; the fixture had no conflict.
- Loading and error states other than the forbidden sheet.
- An empty campaign.
- Reduced motion: code inspection only.
- Screen-reader output: accessible names were read through the DOM, not through AT.
- The wizard was tested on step 1 only.
- Light mode for the DM Command Center, ledger and hub (axe ran in dark mode only for
  those).
- Every class theme except Default and Wizard.

## Initial verdict (`dd34abb`)

The initial verdict was changes required. The re-review below supersedes it.

## Re-review of `c9e651c`

- Commit: `c9e651c` (`fix(ui): RYT-035 address ui-ux review F1-F9`). Diff reviewed with
  `git diff dd34abb c9e651c -- src tests`.
- Source fingerprint: `ee12b28ee283d10eaf3b78bbbccec8bddd9afa5cc6655c11bff1a7c737a1b050`.
  I recomputed it locally and it matches. The working tree has uncommitted
  `docs/design-system.md` and an untracked `e2e.local.config.ts` that are not mine. Neither
  is a fingerprinted UI source.
- The preview on port 4180 serves this build. I checked the served bundle for the new copy
  ("Guardar oro", the planned-module reason, the new planned-page text) and the new CSS
  classes (`is-wide-only`, `teammate-ac`). Ports 4173/4174 were not used.

### Browser testing in the re-review

- I ran the full capture pass again against the fixed build: 104 screens, DM and Player, in
  all four profiles (1366, 820, 1180 and 390 Pixel 7).
- I ran the variant pass again: 32 runs covering light, English with the Wizard theme, 150%
  text and the overlays. The first attempt timed out under load from the concurrent e2e run;
  I reran it with a longer timeout and 2 workers, and it passed.
- I ran the probes again:
  - Steppers: Arin's water went 3→6 while Bea's button never disabled, and Bea's water went
    9→10.
  - Escape returns focus to the trigger on the gold editor, ⋯ menu, Create character,
    damage, New item and invite overlays.
  - The live-share switch toggles with Space.
  - The Settings Back button works.
  - Player navigation with `quests` stored still lists only Grupo, Inventario and Tiendas.
  - Header and bottom-bar heights at 150%, in ES/EN, for DM and Player.
- Accessible-name check (mobile):
  - The bottom-bar link shows "DM", and its accessible name is "Centro de mando DM". That
    satisfies label-in-name.
  - The refresh button is described by its stamp ("Actualizado ahora mismo").
  - Disabled planned switches are described by "Previsto · aún no se puede mostrar a los
    jugadores".
- Automated results: no axe violations on any screen or variant. No horizontal overflow. No
  visible control under 44px. No text under 12px. One h1 per screen. Console errors are
  limited to the same fixture WebSocket tunnel failures.
- I looked at the screenshots again myself. The supporting captures are the files in this
  folder whose names start with `rereview-`.

### Status of the earlier findings

| Finding | Status | Evidence |
| ------- | ------ | -------- |
| F1 header and bottom bar wrap at 150% (Blocking) | **Resolved** | At 390px and 150%, the DM header is 63px (Player 61px) on one row in ES and EN. Every bottom-bar label is one line (21px). The hub tagline ellipsises, and the hub header is 72px in both languages. `rereview-phone-150-dm-center.png`, `rereview-phone-150-en-ledger.png` |
| F2 DM Command Center head fills the first screen (Blocking) | **Resolved** | At 150%, the h1 and refresh button share the first row and the lede is hidden on phones. The tabs, the Members heading, Invite and the first member card are above the fold. At 100% the members list starts at about 160px |
| F3 shop title breaks inside words (Major) | **Resolved** | At 150% it reads "Mercado del / puerto" with whole words, and the icons wrap below. At 100% the title and icons share one row and the description uses the full width. `rereview-phone-150-shop-title.png` |
| F4 AC reads differently (Major) | **Resolved** | The teammate card now shows the same "CA 16" chip as the own card and the DM cards, and keeps the name "Clase de armadura 16". The sheet tile still spells out "Clase de Armadura", which suits a stat block. `rereview-teammate-ac-and-sliders.png` |
| F5 slider marks collide (Minor) | **Resolved** | About 30px of space now separates the marks from the footer or help text. The marks use the muted token and are readable in light mode |
| F6 load meter labels on the border (Minor) | **Resolved** | At 150% the "70/140/210" labels sit inside the Carga card |
| F7 tablet Party hole (Minor) | **Resolved** | At 820px the card body is one column (vitals, gold, a water/rations pair, then exhaustion), so the empty area is gone. The laptop layout is unchanged. `rereview-tablet-party.png` |
| F8 planned pages by URL with developer copy (Minor) | **Resolved (accepted)** | The page now says "Este módulo aún no está disponible. Aparecerá en el menú cuando tu mesa pueda usarlo." with no ticket id. A direct URL still reaches it, but the copy is honest and player-facing, and navigation never links it |
| F9 small consistency items (Minor) | **Resolved, one accepted** | "0 %" no longer wraps. The phone cart sheet fits its content. The gold editor button reads "Guardar oro". The phone sheet stats use 2 columns with aligned values, and the last tile spans both (`rereview-phone-sheet-stats.png`). The shop-open switch is md with a body-size label. Planned switches have a reason in `aria-describedby`. Leaving `PageHead` off inventory and the sheet (portrait heads) is accepted |

### Remaining advisory notes (non-blocking)

- **N1 (Minor), the refresh stamp is hidden on phones.** `src/app/styles.css`: the
  `.page-head .refresh-stamp` phone rule in the RYT-035 round 2 block visually hides the stamp.
  - Effect: at 390px, Party, the Command Center and the hub no longer show "Actualizado …",
    while the sheet and the ledger tab, whose refresh controls sit outside `PageHead`, still
    do. The stamp stays available to assistive technology.
  - Why it matters: `docs/design-system.md` describes `RefreshControl` as an icon button with
    a *visible* relative timestamp. Either record the phone exception there or show the
    stamp in a short form.
- **N2 (Minor), the campaign name truncates hard in the DM header at 150%.** At 390px and
  150%, the DM header shows "The S…" next to the "Jugador" switch. This is the accepted cost
  of keeping the header on one row; the campaign name is visible on the hub and at 100% text.
  A tooltip or the full name in the Profile menu would help.

### Untested in the re-review

These are the same gaps as the initial review:

- Real Supabase and Realtime.
- iOS Safari and phone landscape.
- The trade window flow, the More drawer and the stale-revision alert.
- Loading and error states other than the forbidden sheet.
- Reduced motion in the browser: code only; no new animation was added.
- A real screen reader.
- Wizard steps after step 1.
- Light mode for the Command Center, ledger and hub.
- Class themes other than Default and Wizard.
- The cart Escape check: the probe's shop-picker step targets a button, but the picker is a
  combobox, so the probe timed out. The cart sheet itself rendered and closed correctly.

## Verdict

PASS
