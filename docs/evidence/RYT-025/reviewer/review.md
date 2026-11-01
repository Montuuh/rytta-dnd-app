# RYT-025 independent UI/UX review

- Ticket: `RYT-025` (Design critique: bottom navigation, folded planned modules and table widgets)
- Reviewer: `ui-ux` (role `.codex/agents/ui-ux.toml`, independent subagent; implementation read-only)
- Source reviewed: round 1 `3872bd3fe300c8b0cfa2b2b4da0c81345a504db6`; round 2 `71e3b89f9dbb54e3dd68da898a00a1078ec5fca6`; round 3 `5cd1e1bd675df5e8b80b1b47b30ccffe8a9f54b4` (branch `claude/ecstatic-clarke-dz03w7`)
- Date: 2026-11-01

Verdict: PASS

The verdict above applies to round 3 (`5cd1e1b`). Rounds 1 and 2 (both CHANGES_REQUIRED) are kept below as history.

Most of the delivery works well. Phones reach campaign content at once. Planned modules are
folded away, the DM tabs show one panel at a time, the HP pad works and axe was clean on all
screens I checked. One blocking keyboard/focus defect remains in the new widgets, and the
More drawer does not behave as the bottom sheet that ADR 015 describes.

## Findings

### 1. Blocker: keyboard focus is lost after toggling the new widgets or leaving Player view

- Paths: `src/features/characters/ui/party.tsx:323` (stepper `disabled={disabled}`),
  `src/features/characters/ui/party.tsx:387` (exhaustion pip `disabled={pending}`),
  `src/features/campaigns/ui/members.tsx:438` (module `Switch disabled={action.isPending}`),
  `src/features/campaigns/ui/members.tsx:533` (revelation `Switch`),
  `src/app/layout.tsx:270-274` and `:506` (`exitPreview` unmounts the focused banner button).
- Viewport/theme/language: 390px and 1440px, dark, es (independent of theme/language).
- Reproduction (real Chromium, mocked-live build):
  1. Party (DM): focus `Aumentar Oro · Arin` and press Space or Enter. Within 50ms
     `document.activeElement` is `BODY`. Pressing Enter again does nothing (gold stayed 27).
  2. Same for `Agotamiento nivel 2 · Arin`. Focus moves to `BODY`.
  3. DM Command Center, Active modules: focus the `Tiendas` switch and press Space. The switch
     toggles, then focus moves to `BODY`. At 1440px the revelation switch `Visible para el grupo` behaves the same way.
  4. Turn on `Vista jugador`, then activate `Volver a vista DM` with the keyboard on
     `/members` or `/party`. The banner unmounts and focus moves to `BODY`. The next Tab
     lands on the first page control, not on the switch.
- Impact: keyboard and switch-access users lose their place after every action and must tab
  in again from the top of the page. Repeated +1 by keyboard is impossible without
  re-navigating. This fails the AGENTS/design-system rule on keyboard/focus support (WCAG 2.4.3).
  It affects the controls that acceptance criteria 4 and 5 introduce. The disabled-while-pending
  pattern existed for the old steppers too, but this delivery extends it to every new switch and pip.
- Suggested fix: keep focus on the control while the RPC runs. Use `aria-disabled` or
  `data-pending` with a guard in the handler instead of the native `disabled` attribute, or
  restore focus to the same element in `onSettled`. In `exitPreview`, move focus to
  `previewSwitch.current` (or `main`) before the banner unmounts.

### 2. Major: the More drawer opens as a full-screen panel, not a bottom sheet

- Paths: `src/app/layout.tsx:158-168` (`Drawer position="bottom" size="auto"`),
  `src/app/styles.css:1947-1951`.
- Viewport: 390x844, dark, es. Reproduction: as DM, open Active modules, enable `Tiendas` and
  `Misiones` (6 destinations), then tap `Más`. The measured `.mantine-Drawer-content` box is
  `{x:0,y:0,w:390,h:844}` (computed `flex: 0 0 100%`). Two 52px links sit at the top of an
  empty full-height panel, and the close button is at the top edge. The rounded top corners never show.
  Evidence: `scratchpad/review/int/more-drawer-settled-m.png`.
- Impact: this contradicts ADR 015 ("`More` bottom drawer"). It hides the bottom bar and the
  page context. The close button is the hardest target to reach one-handed. It feels like a
  route change, not a quick picker.
- Suggested fix: give the bottom drawer content height (`size="auto"` does not shrink in
  this Mantine version as configured). For example, set `.more-drawer .mantine-Drawer-content { flex: 0 0 auto; max-height: 70dvh }`
  or a fixed size, then verify the sheet sits flush above the safe area.

### 3. Minor: a 768px tablet (iPad mini portrait) gets the phone bottom bar

- Paths: `src/app/styles.css:697`, `:1995` (`max-width: 48em`) vs `:868` (`min-width: 48em`).
- Measured: at 767 and 768px the top nav is hidden and the bottom bar shows. At 769px the top row shows.
  ADR 015 defines phones as `< 48em`, and at exactly 768px both media ranges match.
  Evidence: `int/nav-6-768.png`. Consider `max-width: 47.99em` for the phone rules.

### 4. Minor: navigating from the More drawer leaves focus on the More button

- Path: `src/app/layout.tsx:126` and `:166`. When the route changes, `close()` runs and
  `onExitTransitionEnd` focuses `moreButton` after the route-change effect has focused `main`.
- Measured: after choosing `Tiendas`, `activeElement` is `Abrir más secciones`. Escape-close
  correctly returns focus to the trigger. Navigation should focus content, as the design-system
  interaction rules require.
  Fix: only restore focus to the trigger when the drawer closes without navigating.

### 5. Minor: bottom bar labels truncate at 150% text

- Path: `src/app/styles.css:1941-1946`. At 390px with 150% root text, labels read `Campa...`
  and `Mando ...` (`shots/party-m-dark-es-z150.png`). Accessible names stay complete and there
  is no horizontal overflow. Consider allowing two lines or a smaller minimum label size.

### 6. Minor: the Coming soon copy contradicts the DM switch list

- Paths: `src/shared/i18n/design-es.ts:20`, `src/shared/i18n/design-en.ts:18`. The copy says
  modules "aún no están disponibles. Cuando lleguen podrás activarlos", but DMs can already
  enable them from Active modules, which creates a reachable placeholder page (ADR 015
  Consequences). Reword to say they are in preparation and can be shown as a preview page.

### 7. Minor: the tablet nav row has no overflow cue

- At 820px with 6 destinations, the row scrolls horizontally (scrollWidth 857 > 820) and the
  last pill is cut off (`Misione`) with no edge fade, unlike the inventory rail
  (`int/nav-6-t.png`). This is acceptable per ADR, but a fade would match the inventory pattern.

## Tested scenarios

### Real browser checks (Chromium 390x844, 820x1180, 1440x1000; mocked-live production build at `/rytta-dnd-app/` with the `tests/e2e/fixtures/identity.ts` HTTP fixture)

- 58 route captures: hub, campaign (DM), party (DM), members, sheet, inventory, wizard, settings,
  Player campaign and Player party. Each was captured at 390/820/1440 in dark es, at 390 in
  light es and dark en, at 1440 in light en, and at 390 with 150% root text.
  For every capture: horizontal overflow = 0 and no unclipped element wider than the viewport.
  No visible interactive element was under 44px (the only hit was a 1x1 visually hidden input).
  No main-content text was under 12px. There were no page or console errors.
- Axe (wcag2a/2aa/21aa): 0 violations on all 51 non-zoomed captures. It was also clean with the Profile menu open, the HP
  dialog (dark es and light en), the DM Modules and Audit tabs, the Player preview banner, the
  More drawer and the opened Coming soon accordion.
- Profile menu (390): Enter opens it with focus on the first item, and ArrowDown moves
  through the items. The theme and language items toggle without closing the menu, and focus stays inside it. Escape returns
  focus to the Profile button. App setup opens the dialog, and Escape returns focus to Profile. All items are 44px.
- Party card `Más acciones`: a 44x44 trigger, Enter then ArrowDown focuses `Ver ficha`, items are 44px and Escape
  returns focus to the trigger. Stepper: click +1 (25→26), 700ms hold +5 (26→31), Enter +1.
  Exhaustion pip 3 sets 3/6 with `aria-pressed=true`.
- HP dialog: Enter on `Daño` opens it with focus in the amount input. The keypad buttons are 52px and the chips 44px. Typing 7 previews
  "Quedará en 28/38 PG" (temp HP absorbed first). Tab cycles inside the dialog, and Escape and
  Apply return focus to `Daño`. Hit-die pip spend: "Quedan 4 de 5 d8". The `Cegado` chip toggles
  with Space. Sheet tabs respond to arrow keys.
- DM tabs: ArrowRight cycles all four tabs with exactly one tabpanel at a time. At 1440,
  `aria-orientation=vertical` and ArrowDown work. Tabs are 44px, module rows 56-57px, the switch
  track 59x30 inside a 56px row, and the segmented filter 44px. The `Recursos` filter leaves 1 timeline item.
- Player view switch: 144x44 label. Space with one Player enters the preview directly, keeps focus on the
  switch and shows the sticky banner (still at y=66 after scrolling). Navigation drops to
  Campamento and Grupo. The exit button is 44px. Turning the switch off removes the banner and keeps focus.
- More drawer: reached by enabling 2 planned modules (bottom bar Campamento, Mando DM, Grupo,
  Inventario, Más). Enter opens it with focus on close, links are 52px, Escape returns focus to `Más`,
  and the `Más` item shows the active state on a folded route.
- Breakpoints: top nav at 769+, bottom bar at ≤768. Three-column summary at 1200px.
- Reduced motion (`emulateMedia reduce`): transitions and animations on sheet buttons and the Modal
  computed to 0.01ms.

### Screenshot inspection (by me, from the captures above)

- 390 campaign: the first screen shows the title, description, badge and module cards. The bottom bar does not
  cover the end of the content when scrolled to the bottom. The light and dark palettes are readable, and the visibility
  badges use the same icon+text shape. Spanish reads `Jugador`. The plural badge reads "1 módulo activo".
- Party, sheet (HP ring with temp segment), wizard class grid (2 columns at 390), inventory
  satchel and rail fade, DM audit timeline (1440), Coming soon expanded (820) and the EN members
  page: all text is translated and there are no clipped controls apart from findings 5 and 7.

Evidence files (scratch, not committed):
`/tmp/claude-0/-home-user-rytta-dnd-app/77331370-f6e6-5e1e-9571-bcb8422725b4/scratchpad/review/shots/*.png|json`
and `.../scratchpad/review/int/*.png`, with logs in `int/log*.txt`.

## Untested states and limitations

- Real iOS Safari/Android: pull-to-refresh, long press on touch, safe-area insets and VoiceOver/TalkBack were not tested.
  The hold was tested with mouse pointer events in Chromium only.
- Player view picker popover with several Players: the fixture has one Player, so only the
  direct-entry path was exercised.
- Error, offline and stale states of the new widgets, and loading skeletons, were not forced.
  The `twoDms`, `empty` and draft-sheet fixtures were not captured.
- Light theme at 820px and the 150% text check at 820/1440 were not captured.
- Hosted Supabase was not exercised. All data came from the HTTP fixture.
- Approval applies only to source `3872bd3`. Re-review the affected behaviour (findings 1–2,
  plus any of 3–7 that are fixed) after the changes.

## Round 2 (71e3b89)

Focused re-review of the fixes claimed under "Round 1" in `../validation.md`. I rebuilt the
mocked-live bundle from `71e3b89` (`--base=/rytta-dnd-app/`) and served it with `vite preview`
on 127.0.0.1:4190. The checks ran in real Chromium (`/opt/pw-browsers/chromium`) with temporary
Playwright specs, which I deleted afterwards. The data came from the `identity.ts` HTTP fixture.

Round 2 verdict: CHANGES_REQUIRED. Part of finding 1 is still unresolved: the revelation
switch still drops keyboard focus.

### Status of round 1 findings

| # | Round 1 severity | Status | Evidence (390x844 and 1440x1000 unless noted) |
| - | ---------------- | ------ | --------------------------------------------- |
| 1 | Blocker | Partly fixed, still open | Fixed for: the steppers (focus stays on `Aumentar Oro · Arin`/`Reducir Oro · Arin`; `aria-disabled=true` while pending; 3 consecutive Enter presses gave 26→29; a second Space while pending is ignored), the exhaustion pips (focus stays and `aria-pressed=true`; Tab then Enter moves to level 3), the module switches (focus stays on `Tiendas: visible para jugadores`, repeated Space toggles it) and `Volver a vista DM` (focus goes to the `Vista jugador` switch for both keyboard and click, on `/members` and `/party`). **Still failing: the revelation switch.** See R2-1. |
| 2 | Major | Fixed | `.mantine-Drawer-content` is `{x:0,y:624,w:390,h:220}`, a bottom sheet with rounded top corners and the page dimmed behind it (`r2/drawer-m.png`, also light). On open (Enter, Space, click) focus goes to `Cerrar navegación`. Escape returns focus to `Abrir más secciones`. Axe was clean in dark and light. |
| 3 | Minor | Fixed | At 767px the bottom bar shows. At 768, 769, 820 and 1024px the top row shows and the bottom bar is hidden. No horizontal overflow at any width. At 768px `main` still uses the 16px phone padding from the remaining `max-width: 48em` blocks. It is harmless, so I note it without a finding. |
| 4 | Minor | Fixed | Choosing `Tiendas` by keyboard in the drawer navigates and focuses `MAIN`, and the drawer closes. Choosing the already active item closes the drawer and returns focus to `Más`, which is reasonable. |
| 5 | Minor | Fixed | At 150% text (390px, es and en, dark and light) the labels wrap to at most 2 lines with no clipping (`scrollHeight == height`): `Campa-mento`, `Mando DM`, `Inventa-rio`, `DM Command`. The bar grows to 79px and there is no horizontal overflow (`r2/page-150-light.png`, `r2/bottom-150-*.png`). |
| 6 | Minor | Fixed | es: "Estos módulos están en preparación. Puedes mostrarlos a los jugadores desde Módulos activos; hasta que lleguen, verán una página de vista previa." en: "These modules are in preparation. You can show them to Players from Active modules; until they ship, Players see a preview page." The accordion is DM-only (absent for the Player fixture), so the DM-directed copy fits. Axe was clean. |
| 7 | Minor | Fixed | At 768/820px the row fades at its right edge (`r2/bp-768.png`). Scrolled to the end, the last pill `Misiones` is fully legible thanks to the trailing padding (`r2/nav-820-scrolled-end.png`). A keyboard-focused last link sits at x 654–771 in an 820px row, clear of the 40px fade. At 1440px the row does not overflow and the last pill ends well before the fade. |
| — | Card `Más acciones` placeholder change | Verified | Enter opens the menu with focus on `Ver ficha`, and ArrowDown moves to `Editar recursos`. Escape returns focus to `Más acciones para Arin`. Axe was clean while open and immediately after Escape (during the close transition) at 390 and 1440. |

### New and remaining findings

#### R2-1. Blocker (remaining part of finding 1): the revelation switch still loses focus after toggling

- Paths: `src/features/campaigns/api.ts:124-127` (`onSuccess` runs `removeQueries` for every
  `['private', userId, 'campaign', …]` query before invalidating) and
  `src/features/campaigns/ui/members.tsx:488-495` (the list renders only while `revelations.data` is set).
  The `aria-disabled` change at `members.tsx:534` is in place, but it does not help here.
- Viewport/theme/language: 390px and 1440px, dark, es.
- Reproduction: DM Command Center, `Cola de revelaciones` tab. Focus
  `Visible para el grupo: El Yunque de Ámbar` and press Space. At +20ms focus is on the switch
  and both switches show `aria-disabled`. At +100ms the original input node is detached
  (`isConnected=false`) and `document.activeElement` is `BODY`. The switches re-render
  with the new value. A second Space press does nothing, so the switch cannot be toggled back from the keyboard.
- Impact: the same impact as round 1 finding 1, on the DM's quick revelations queue. Keyboard
  users lose their place after each reveal or hide. The list also briefly unmounts (a loading flash).
- Suggested fix: do not remove the revelations query on success. Use `invalidateQueries` only, or
  write the new visibility with `setQueryData`, so the list and its switch stay mounted. As an alternative,
  restore focus to the switch for `item.id` after the refetch. Add the revelation switch to the
  `RYT-025 keyboard focus …` e2e regression.

No other new findings.

### Round 2 tested scenarios

Real browser (Chromium, mocked-live build of `71e3b89`):

- Keyboard focus after steppers (Space, Enter, minus), exhaustion pips, module switches,
  revelation switches and `Volver a vista DM`, at 390x844 and 1440x1000 (dark, es). I recorded `activeElement` at
  20–900ms. Pointer hold of 700ms on + still adds 5 (28→33).
- More drawer at 390x844 with 6 destinations (after enabling Tiendas and Misiones through
  the DM switches): geometry, initial focus for Enter, Space and click, Escape focus, keyboard choice of a
  destination, choosing the active route, light theme.
- Breakpoints 767/768/769/820/1024px: nav visibility, horizontal overflow, edge fade, last link while focused.
- Bottom labels at 150% root text at 390px, es and en, dark and light.
- Coming soon copy, es and en (DM), and the Player view of the campaign home (accordion absent).
- Axe (wcag2a/2aa/21aa): clean on party (390, 1440), the card menu open and closing, the
  modules tab, the revelations tab, the More drawer (dark and light) and Coming soon (es and en).

Screenshot inspection (by me): `r2/drawer-m.png`, `r2/drawer-m-light.png`,
`r2/page-150-light.png`, `r2/bottom-150-es.png`, `r2/bottom-150-en.png`, `r2/bp-767..1024.png`,
`r2/nav-820-scrolled-end.png`, `r2/nav-820-last-focused.png`, `r2/coming-soon-*.png`. Files are under
`/tmp/claude-0/-home-user-rytta-dnd-app/77331370-f6e6-5e1e-9571-bcb8422725b4/scratchpad/review/r2/`
(scratch, not committed). The logs are `r2/log-*.txt`.

### Round 2 limitations

- In one run with three modules enabled, focus read `Abrir más secciones` 1s after opening the
  drawer. A dedicated re-test (Enter, Space, click; 50/300/1000ms) always put focus on
  `Cerrar navegación`. I could not reproduce it again and do not report it as a finding.
- Screen reader announcement of `aria-disabled` pending states was not checked with real AT.
  The pending visual (50% opacity) was not inspected in a screenshot.
- Real iOS Safari/Android, the multi-Player preview picker, error/offline states and hosted
  Supabase remain untested, as in round 1. I did not repeat the full 58-capture sweep. Only the touched screens were re-tested.
- Approval would apply only to the reviewed source snapshot. After the R2-1 fix, re-test the
  revelation switch, and the module switches too, since they share the mutation.

## Round 3 (5cd1e1b)

Focused re-review of the R2-1 fix. `src/features/campaigns/api.ts` now skips `removeQueries`
for the `revelationVisibility` and `modules` actions and only invalidates. Every other action
still removes private campaign data first. I rebuilt the mocked-live bundle from `5cd1e1b`,
served it at 127.0.0.1:4190 under `/rytta-dnd-app/` and tested in real Chromium
(`/opt/pw-browsers/chromium`) with the `identity.ts` HTTP fixture. I deleted the temporary specs afterwards.

Round 3 verdict: PASS. No blocking findings remain and I found no new ones.

### Status

| Finding | Status | Evidence |
| ------- | ------ | -------- |
| R2-1 (remaining part of finding 1) | Fixed | At 390x844 and 1440x1000 (dark, es), I pressed Space twice on `Visible para el grupo: El Yunque de Ámbar`. Both presses toggled it (true→false→true). At every sample (+20/80/200/600ms) `document.activeElement` was the original input node (`isConnected` and identical). `aria-disabled=true` showed only while pending. A MutationObserver saw the switch count stay at 2 the whole time, so the list never unmounted and there was no loading flash. At 390 a busy spinner briefly appeared, and I take it to be the refresh control's own indicator. The visibility badge updated to `Público (Grupo)`. Two Space presses 10ms apart gave a single toggle and focus stayed put. |
| Module switches | Still fixed | `Tiendas: visible para jugadores`: Space twice toggled true→false with focus kept, at 390 and 1440. The navigation updated after each toggle. |
| Findings 2–7 (round 2) | Not regressed (spot check) | The source diff touches only `api.ts`. Party stepper Enter kept focus (25→26). The card `Más acciones` menu: Enter focuses `Ver ficha` and Escape returns focus to the trigger. There were no page errors. |

### Role and membership flows (390x844, dark, es)

- Revelation toggled to public, then the Player view switch: the banner persists across
  navigation to campaign home, and the newly public revelation shows there, so the
  invalidated data reached the preview. `Volver a vista DM` returns focus to the `Vista jugador` switch.
- `Nombrar DM` on Arin: a confirmation dialog, then Arin is listed as DM (this path still removes the private cache).
- `Cambiar a Jugador` on the signed-in DM: after confirming, the page shows the Player members
  view. The `Vista jugador` switch and the DM tabs are gone, and the bottom bar shrinks to
  `Campamento, Grupo`. Role-dependent UI and navigation update correctly after the
  remove-and-refetch path.

### Axe (wcag2a/2aa/21aa)

Clean on the Revelations tab (390, 1440), the Modules tab (390, 1440), Party, campaign home and
the members page after demotion.

### Screenshots inspected

`r3/rev-m.png` (visible focus ring on the toggled switch, badge `Público (Grupo)`),
`r3/rev-d.png`, `r3/modules-m.png`, `r3/modules-d.png`, `r3/after-promote.png`,
`r3/after-demote.png`, `r3/preview-home.png` under
`/tmp/claude-0/-home-user-rytta-dnd-app/77331370-f6e6-5e1e-9571-bcb8422725b4/scratchpad/review/r3/`
(scratch, not committed). The logs are `r3/log-*.txt`.

### Round 3 limitations

- Only the touched behaviour and a spot check were re-tested, not the full round 1 sweep. Light theme
  and English were not repeated in this round. The diff changes no UI strings or styles.
- Invite, revoke, remove member and leave campaign were not exercised. They keep the
  unchanged remove-and-refetch path.
- Real iOS Safari/Android, screen reader output, the multi-Player picker, error/offline states and hosted
  Supabase remain untested, as recorded in rounds 1 and 2.
- This PASS applies only to source `5cd1e1b`. Any later UI source change needs a new review.
