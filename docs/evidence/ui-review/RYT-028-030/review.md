# ui-ux review: RYT-028, RYT-029, RYT-030

- Reviewer: `ui-ux` (independent, role `.codex/agents/ui-ux.toml`)
- Date: 2026-11-03
- Source snapshot: `main` at `36ec84c` (clean, apart from an untracked root `CLAUDE.md`)
- Verdict: **CHANGES_REQUIRED**

## Method

I ran the browser checks myself. A temporary Playwright config served the identity build
(`VITE_DATA_MODE=supabase` with the routed RPC fixtures from `tests/e2e/fixtures`) on port 4574,
and I deleted the config, specs and `dist-uireview` afterwards. Projects: 390x844 touch,
820x1180 touch and 1440x1000. The runs covered `es`/`en` x `dark`/`light`, 150% root font size,
reduced motion, axe (wcag2a/2aa/21aa), a scan for targets under 44px, keyboard/Escape/focus
return, request logging for polling, and `clientWidth` measurements across DM modules.
Sixty-six scenarios passed as scripted, plus the focused re-checks below. I inspected the
screenshots by eye. The coordinator reported that the full e2e suite on `36ec84c` passed 249/249.
I did not re-run it.

## Findings

### F1 - Blocker - RYT-028: the DM's Player preview cannot equip or unequip (acceptance #2 fails)

- Paths: `src/features/inventory/ui/inventory-page.tsx:109`, `src/features/characters/ui/sheet/character-sheet.tsx:76`.
  Root cause: `src/features/campaigns/campaign-context.ts:9`.
- Viewports: all (390, 820, 1440). Seen in `es` dark.
- Repro: sign in as the DM. On Party, link Arin to the Player via "Vincular jugador". Turn on
  "Vista jugador" and open Inventario, then Equipo.
- Observed: all 11 doll sockets render `disabled` ("Torso: Armadura de cuero" included). The
  item card has no actions and the portrait has no edit control. Compare the DM view, where
  the sockets and "Añadir objeto" are active. Screenshots: `t-es-dark-preview-equipment.png`
  and `t-es-dark-dm-equipment.png`.
- Cause: during preview, `useCampaign()` rewrites `role` to `'player'`, so `dm` is false.
  `character.user_id === userId` compares against the DM's own id, not `previewUserId`, so
  `canEdit` is always false while previewing. Removing the `!playerPreview` guard made no
  difference. The sheet has the same problem.
- Impact: the acceptance criterion is not met. No e2e test covers it; the existing tests only
  check the Player's own session.
- Expected: in preview, the DM keeps edit rights on the previewed Player's character, using
  the real role from context or `ownerId`/`previewUserId`. Add an e2e test: DM preview, open a
  socket, unequip, and focus returns to the socket.

### F2 - Major - RYT-030: the shop picker dropdown overflows the viewport on phones

- Path: `src/app/styles.css:2853` (`.shop-picker-dropdown { min-width: min(320px, calc(100vw - 32px)) }`),
  together with `position="bottom-start"` and `width="target"` in `src/features/shops/ui/storefront.tsx:537`.
- Viewport: 390px, all themes and languages.
- Repro: as the Player, open Tiendas and tap the shop name.
- Observed: the dropdown spans x = -17 to 303 px. Its left edge and the option seals are clipped
  off-screen and it no longer lines up with the card (`m-en-light-picker-open.png`). It fits at
  820px and 1440px.
- Impact: the modern-widget picker looks broken on the main target device, and the first
  option's seal is clipped.

### F3 - Medium - RYT-030: the shop name wraps even when there is room for it

- Paths: `src/app/styles.css:2797-2808` (`.shop-title-row`, `.shop-title`) and `2832`
  (`.shop-picker-trigger { max-width: 100% }`).
- Viewports: 820px and 1440px (and 390px), both themes.
- Observed: in a 665px row, the title shrinks to 235px. "Mercado del puerto" and "El Yunque de
  Ámbar" break onto two lines, the chevron floats in empty space, and the badges still sit
  beside it (`t-en-light-storefront.png`, `t-es-dark-tooltip.png`). The requirement was "badge
  beside the name when it fits, otherwise below". Instead, the name is wrapped to make room for
  the badge.
- Expected: keep the name on one line while it fits, and drop the badges to the next row first.

### F4 - Medium - RYT-030: the discount badge is truncated at 150% text on phones

- Path: the modifier `Badge` in `src/features/shops/ui/storefront.tsx:616-619`.
- Viewport: 390px, 150% text, `es` dark.
- Observed: the badge reads "20 % de descuento p..." (`m-es-dark-150-storefront.png`), so the
  price modifier is cut off.
- Expected: the badge wraps (for example `white-space: normal` / auto height on the label) or
  the text is shortened.

### F5 - Low - RYT-030: the mode tooltip uses Mantine's default colours, not theme tokens

- Path: `src/features/shops/ui/storefront.tsx:482` (`Tooltip` with no color or classNames).
- Observed: in dark theme the tooltip is a light grey `rgb(233,236,239)` box with black text on
  the warm-hearth palette. In light theme it is near-black `rgb(33,37,41)`
  (`t-es-dark-tooltip.png`, `m-es-light-orders.png`). Contrast passes, but it does not match
  `docs/design-system.md` ("Use semantic theme tokens").

### F6 - Low (observation, not blocking) - the counter-offer card repeats the same total

- Path: `src/features/shops/ui/orders.tsx` (counter variant).
- Observed: on a phone, a counter-offer shows "18 po" three times: the line total, the
  "Contraoferta" compare box and the "Pagarás" flow row. It also stacks two pills: the kind
  label and "Te toca responder" (`m-es-light-orders.png`). Merging the compare box and the
  flow row would shorten the card, in line with the user's "don't abuse pills" preference.

## Verified OK

- RYT-028: there is no equipped list or help text under the paper doll. Unequip happens only
  in the slot drawer. Escape closes the drawer and focus returns to the socket (rechecked 3x
  per viewport). The satchel and its empty state have no storeroom button. The sheet has no
  "Ver y cambiar equipo" link; its links are now Back and Edit sheet only. `scrollbar-gutter:
  stable` applies, and `clientWidth`/`main` width stay identical across members, the
  modules/items panels, party, inventory, shops and the sheet at 1440, 820 and 390, with and
  without overflow.
- RYT-029: `#/campaign/:id` takes the DM to `/members` (DM Command Center) and the Player to
  `/party`, in all four language/theme combinations. Camp is gone from the top and bottom
  navigation. `/camp` shows a localized "Página no encontrada" / "Page not found" page.
  Axe is clean.
- RYT-030: the purchase (gold stripe), sale (blue) and counter-offer (hatched violet, struck
  "Pedía") cards are distinct and do not rely on colour alone; each has a kind label and icon.
  The ledger has a `RefreshControl` with a stamp and polls `list_shop_orders` about every 5s
  while the ledger tab is shown. Polling stops when the tab is left. "Eliminar" uses a trash
  icon button. The admin intro is gone. The picker is a select-only Combobox: Enter opens it,
  Arrow+Enter switches shop, and focus returns to the trigger. The mode badge is focusable with
  an accessible description, and the tooltip opens on focus. The badge sits beside the name at
  820/1440 and wraps below it at 390. Axe is clean on the storefront, orders, admin and ledger
  in all four combinations, and there is no horizontal overflow at 150%.
- Targets under 44px: only the two Mantine slider thumbs (32px) in the DM shop panel. These
  predate this delivery and are accepted as slider handles.

## Limitations / not tested

- Hosted Supabase was not tested (only routed fixtures). Real iOS/Android touch and the
  tooltip tap toggle on a real device were not tested. Screen readers were not tested.
- The live counter-offer round trip by polling between two real sessions was not tested.
- RYT-029 database removal (migration, RLS) is outside this UI review.
- The fullPage captures on phones show the fixed bottom bar over the content. This is a
  capture artifact and not a defect.

## Evidence

`docs/evidence/ui-review/RYT-028-030/*.png`. Naming: `{m=390|t=820}-{lang}-{theme}-{screen}.png`.
