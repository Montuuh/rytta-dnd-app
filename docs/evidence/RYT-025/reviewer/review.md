# RYT-025 independent UI/UX review

- Ticket: `RYT-025` (Design critique: bottom navigation, folded planned modules and table widgets)
- Reviewer: `ui-ux` (role `.codex/agents/ui-ux.toml`, independent subagent; implementation read-only)
- Source reviewed: commit `3872bd3fe300c8b0cfa2b2b4da0c81345a504db6` (branch `claude/ecstatic-clarke-dz03w7`)
- Date: 2026-11-01

Verdict: CHANGES_REQUIRED

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
