# RYT-004 independent ui-ux review

- Reviewer role: `ui-ux` (`.codex/agents/ui-ux.toml`), independent subagent; implementation code read-only.
- Reviewed at: 2026-10-31
- Source fingerprint (`node scripts/check-ui-review.mjs --fingerprint`, same at start and end of review):
  `d0b1e158f581ec65d531fe529057f9c21fbef435d4a8774bf03fda5d4952caed`
- HEAD while reviewing: `fb11181` / `19ad414` (the second commit is docs-only; the fingerprint did not change)

## Verdict

**CHANGES_REQUIRED**

The visual direction works. The satchel tiles, wax seals, Balanza, paper doll, ledger and forge
look distinctive and coherent in both themes. axe reports no violations in any state tested,
every control measured is at least 44px, and Escape returns focus correctly from the card, the
socket picker and the forge. Four issues block a PASS: one blocker and three majors in core
flows. The undo fuse covers the item card's controls at 150% text. Focus falls to `<body>` after
common actions. Action errors are hidden behind the open drawer. The hold seal gives no
instruction or path for touch screen readers.

## Findings

### Blocker

**B1. The undo fuse covers the item card's controls at 150% text.**
- Paths: `src/app/styles.css:1541-1543` (`.undo-fuse { position: fixed; z-index: 300 }`, above
  Mantine's drawer z-index 200); `src/features/inventory/ui/inventory-page.tsx:441-453` (the fuse
  renders while the card is open).
- Viewport/theme/language: 390x844 touch, 150% text, DM, es light (the bug is in the CSS, so the
  theme does not matter).
- Reproduction: DM opens "Poción de curación" and taps "Dar 1 más". The fuse appears at the
  bottom, about 170px tall, because the message wraps into 5 lines. Even with the drawer
  scrolled to the bottom, `elementFromPoint` on "Cantidad", "Dar 1 más" and "Editar objeto"
  hits the fuse.
- Impact: for up to 10 minutes, pointer users cannot reach those controls unless they first
  dismiss the fuse. Keyboard focus can still move to them, but they are fully hidden behind the
  fuse. This fails WCAG 2.2 AA 2.4.11 Focus Not Obscured (Minimum). The fuse also sits outside
  the drawer's focus trap, so keyboard users cannot reach Undo while the card is open. At 100%
  text the hit test showed no overlap.
- Evidence: `08-dm-card-fuse-390-es-light-150.png`.
- Suggested direction: while a drawer is open, show the fuse inside the card, or reserve its
  height as bottom padding in the drawer. Keep it reachable inside the focus trap.

### Major

**M1. Focus falls to `<body>` after actions that remove the control that opened them.**
- Paths: `inventory-page.tsx:64-65` (`restoreFocus` silently gives up when the opener is
  disconnected), `:155-161` (equip from the card), `:392-395` (discarding the last unit closes
  the card); `paper-doll.tsx:117-120` with `:150` and `:230-233`. The picker returns focus to
  its socket right away, but the socket is disabled while `pending`, so `focus()` fails, and
  nothing tries again when the action succeeds.
- Viewport/theme/language: 390 es dark, Player (browser-verified).
- Reproduction: (a) Espada larga card → Equipar; (b) Anillo de la marea card → Descartar 1;
  (c) Equipo → "Mano secundaria: vacío" → Escudo. In all three, `document.activeElement` is
  `body` afterwards.
- Impact: keyboard and screen-reader users lose their place on every equip, and whenever they
  discard the last unit.
- Suggested direction: after the action succeeds, focus the socket that was filled, the next
  tile, or the grid or heading.

**M2. Action errors are hidden behind the open drawer.**
- Paths: `inventory-page.tsx:125-129` (`run` writes errors only to `notice`) and `:259-261`
  (`.inventory-notice` sits in the page, outside the dialog).
- Viewport/theme/language: 390 and 820, es dark (browser-verified with the fixture's
  `staleItem`).
- Reproduction: open the potion card, make the stack stale, then press Usar or Descartar 1. The
  text "Este objeto cambió en otro dispositivo…" is written under the overlay. At 390 the
  drawer fully covers it (the hit test returns the dialog). At 820 it is dimmed and cut off. The
  card stays open with no alert inside it.
- Impact: sighted users see nothing happen after a failed use or discard (stale, conflict,
  forbidden, insufficient, or unavailable). An `aria-live` region outside an `aria-modal` dialog
  may not be announced (not tested with a real screen reader).
- Evidence: `07-stale-card-820-es-dark.png`.
- Suggested direction: show the error inside the card (an `Alert` with `role="alert"`), as the
  forge already does.

**M3. The hold seal gives no instruction to assistive technology and has no reliable touch
screen-reader path.**
- Paths: `hold-seal.tsx:254` (`aria-describedby={undefined}`), `:273-275` (the "Mantén para
  usar" hint is `aria-hidden`), `:266-268` (immediate activation depends on
  `event.detail === 0`).
- Browser-verified: on desktop Chromium, Enter and Space each use the item once, immediately. A
  quick touch tap does nothing, with no feedback and no message. A held pointer press uses the
  item after about 600ms, and the ring fills while held (187° at 300ms).
- Code-inspected, not verified on a device: VoiceOver and TalkBack double-tap usually generate
  pointer events and a click with `detail >= 1`. On phones, screen-reader users would then get
  the silent tap behaviour and must already know to double-tap and hold. Because the hint is
  hidden from assistive technology, nothing tells them.
- Impact: this falls short of the delivery's "full keyboard/screen-reader parity" requirement
  on the main device class (phones and tablets). Sighted users who just tap also get no
  feedback.
- Suggested direction: expose the hint through `aria-describedby`. On a short tap, give a
  visible nudge (for example a pulse on the hint) and announce it politely. Accept activation
  that does not come from a real press (no preceding `pointerdown`, or a `pointerType` that is
  not mouse, touch or pen), or offer an equivalent confirm path. Verify on iOS VoiceOver and
  Android TalkBack.

**M4. Forge icon names expose raw English keys in both languages.**
- Paths: `forge.tsx:180`; `inventory-es.ts:131` and `inventory-en.ts:131`
  (`'Icono {{icon}}'` / `'Icon {{icon}}'`).
- Browser-verified at 820 es dark, DM: the 44 icon choices are announced as "Icono package",
  "Icono bow-arrow", "Icono wand-sparkles" and so on.
- Impact: Spanish and English are incomplete for screen-reader users. The icon picker is one of
  the custom widgets.
- Suggested direction: add a translated name for each icon key.

### Minor

- **m1. Rarity pips are too small to read at a dim table.** `styles.css:1343-1344`: the pips are
  8px. Rarity is not shown by colour alone (the tile name includes the pip count and rarity
  text, and the card shows the rarity as text), but a glance mostly relies on the coloured ring.
  Make the pips larger or add a short text badge for rare and above.
- **m2. Tile names are cut off at 820px with 150% text.** They clamp to "Poción de..."
  (`05-satchel-820-en-light-150.png`). The full name is only in the card and the accessible
  name.
- **m3. An empty band appears above the content.** The empty `.inventory-notice` (`styles.css:1165`,
  plus the Stack gap) leaves a blank band of about 50-80px between the view switch and the
  content (`01`, `05`).
- **m4. The view switch looks off-palette in light mode.** It renders as Mantine's default cool
  grey rather than warm parchment tokens (`05`).
- **m5. The Player hidden-module state has no heading.** `inventory-page.tsx:68-73` renders no
  `h1` (verified: 0 headings in `main`). In addition, the character sheet's attack section tells
  that Player "Equipa una desde la mochila", which they cannot open while the module is hidden
  (verified).
- **m6. Copy issues.**
  - `inventory-es.ts:83` reads "Usar un Poción de curación" (wrong gender agreement for
    feminine items).
  - The template hint (`:126`) mentions "coste", which Players cannot set.
  - `tileLabel` announces a bare number ("Poción de curación, 3, Poco común"); "×3" or
    "3 unidades" would be clearer.
- **m7. A hold cannot be cancelled by sliding off.** The pointer is captured, so dragging away
  still uses the item (verified). Undo covers WCAG 2.5.2, but slide-off-to-cancel is the
  expected gesture.
- **m8. The card has two `h2` headings.** The drawer title "Objeto" and the item name are both
  `h2`; the generic title adds little.
- **m9. Other actors are shown as "El DM" (code-inspected).** `inventory.ledger.someone`
  (`inventory-es.ts:112`) labels every actor who is not the viewer as "El DM", because Players do
  not load members.
- **m10. The forge can show an old error (code-inspected).** `inventory-page.tsx:433` passes
  `action.isError` from the shared mutation. An earlier failed card action would show as an
  error the next time the forge opens.

## Tested scenarios (browser, Chromium `/opt/pw-browsers/chromium`, mocked Supabase fixture, scratch build on port 4199)

- **390 phone, touch, es dark, Player.**
  - Satchel: screenshot, axe, 44px scan, no horizontal overflow, tab order. The meter value
    text is "22,5 de 210 lb · Sin carga".
  - Card opened from the keyboard: focus starts on Close, the tab cycle stays in the dialog,
    axe and 44px checks pass.
  - Seal: a tap does nothing; a held mouse press uses the item, with a mid-hold capture.
  - Fuse over the card: the pointer can hit it, keyboard Tab cannot reach it.
  - Escape returns focus to the tile.
  - Fuse over the satchel does not cover the Add tile.
  - Discarding the last unit loses focus (M1).
- **390 es dark, Player: equipment.**
  - Equip from the card loses focus (M1).
  - Paper doll: screenshot, axe, 44px checks.
  - Socket picker: focus opens on Close; Escape returns focus to the socket; equipping through
    the picker loses focus (M1).
  - The filled-socket picker offers only "Quitar".
  - Ledger: screenshot, axe, 44px checks.
- **820 tablet, en light, 150% text, Player.** Satchel, card, paper doll and ledger: no
  overflow, no axe violations, every target at least 44px. English completeness was checked
  from the `main` and dialog text; item names come from campaign data and are Spanish by
  design.
- **820 es dark, DM.**
  - Hidden-for-Players note shown.
  - The card shows Valor, "Dar 1 más" and "Editar objeto".
  - Storehouse: axe and 44px checks pass.
  - Forge opened from the keyboard: focus goes to Nombre; the groups are labelled by their
    legends; axe and 44px checks pass; submit is disabled while empty; Escape returns focus to
    the forge tile; the edit title is correct.
- **390, 150% text, DM, es light and dark.** The fuse covers card controls at 150% but not at
  100% (B1).
- **States.**
  - Stale action at 390 and 820: the error is hidden (M2).
  - Query error: shows "No se pudo cargar…" with Reintentar.
  - DM with no items: empty satchel message, default paper doll (AC 13), empty ledger message.
  - Player with the module hidden: message shown, no heading (m5).
  - Character sheet attack section, with the module hidden and enabled.
- **Reduced motion at 1440.** Balance token and fuse-line transitions are off. The hold ring
  still advances, which is functional feedback.
- **Keyboard.** Space on the seal uses the item once, immediately (390 en dark).
- **axe** (wcag2a, 2aa, 21aa, 22aa) found no violations on the satchel, card, paper doll,
  picker, ledger, storehouse and forge, in es dark and en light.

## Evidence

All screenshots are in `docs/evidence/RYT-004/reviewer/`:
- `01-satchel-390-es-dark.png`
- `02-card-used-fuse-390-es-dark.png`
- `03-doll-390-es-dark.png`
- `04-ledger-390-es-dark.png`
- `05-satchel-820-en-light-150.png`
- `06-forge-820-es-dark.png`
- `07-stale-card-820-es-dark.png`
- `08-dm-card-fuse-390-es-light-150.png`

## Limitations and untested

- **Player POV read-only was not browser-tested.** In DM mode the fixture assigns no character
  to the preview Player, so the screen showed "Tu DM todavía no te ha asignado un personaje".
  Read-only behaviour was checked in code only: actions hidden, sockets disabled, ledger undo
  disabled, Add tile and portrait editing hidden, fuse hidden.
- **The DM roster chips were not rendered.** The fixture has a single character.
- **No real screen reader or real device was used.** VoiceOver and TalkBack were not tested, so
  M3 is partly inferred from code. iOS Safari was not tested.
- **Partly tested:** the portrait upload and its error, the slot-occupied redirect, and SRD
  template selection (that one is covered by the repository's own e2e test, not repeated here).
- **Not checked at 1440:** the card or the forge.
- **No hosted Supabase.** All data came from the mocked HTTP fixture.

---

## Re-review 1

- Reviewed at: 2026-10-31, HEAD `5342501`
- Source fingerprint (`node scripts/check-ui-review.mjs --fingerprint`, checked at start and end):
  `43114a4394c6c690c4fc214f4abb74a9f7caf26c4774138ef64af39064fb6c70`
- Method: fresh scratch build on port 4199 with the mocked Supabase fixture and Chromium; diff
  `fb11181..5342501` inspected. The findings above are kept as originally written.

### Verdict

**CHANGES_REQUIRED**

B1, M2, M3 and M4 are fixed. M1 is only partly fixed: focus still falls to `<body>` when the
item card closes because the last unit was used. Using the last potion is a primary table flow,
and it is the same defect as M1. The fix is small and narrow.

### Status of the original findings

- **B1: resolved (browser-verified).**
  - Setup: 390px, 150% text, DM, es light, after "Dar 1 más".
  - No `.undo-fuse` is rendered while the card is open.
  - An in-card `.card-undo` strip with `role="status"` appears inside the focus trap.
  - Hit tests on Deshacer, Cantidad, Descartar 1, Dar 1 más and Editar objeto all reach the
    control itself; axe and 44px checks pass.
  - Undo from the strip restores ×3 and removes the strip.
  - Closing the card shows the page fuse and returns focus to the tile.
  - Evidence: `rr1-01-card-undo-390-es-light-150.png`.
- **M1: partly resolved.** Browser-verified at 390 es dark, Player.
  - Fixed:
    - Equip from the card (single unit): focus goes to `h1` "Inventario".
    - Discard the last unit: focus goes to `h1`.
    - Equip through the picker: focus goes to "Mano secundaria: Escudo".
    - Unequip through the picker: focus goes to "Mano secundaria: vacío".
    - Sockets are no longer `disabled`.
  - **Still open (major):** using the last unit closes the card and drops focus to `body`.
    - This happens through keyboard Enter on the seal, "Usar ahora" or a hold.
    - Reproduction: Player opens the potion card and uses it three times. The dialog unmounts
      and `document.activeElement` is `body`; the fuse appears.
    - Path: `inventory-page.tsx:413-421`. The `use` action never calls `restoreFocus(true)`
      when `quantity` reaches 0; only the discard path (`:430-435`) does.
    - Suggested fix: call `restoreFocus(true)` on success when `openStack.quantity === 1`.
      Alternatively, restore focus generically whenever the open stack disappears.
- **M2: resolved (browser-verified).**
  - Setup: 390 es dark, with the fixture's `staleItem`.
  - The stale message renders as `role="alert"` inside the card and is visible; axe passes.
  - After closing the card, no leftover page alert remains.
  - Opening the forge afterwards shows no error.
  - Evidence: `rr1-02-stale-in-card-390-es-dark.png`.
- **M3: resolved for keyboard and pointer (browser-verified). Real screen readers were not
  tested.**
  - `aria-describedby` now points to the visible "Mantén para usar".
  - A quick touch tap reveals "Usar ahora" (44px, polite live region) and keeps focus on the
    seal; activating it uses the item.
  - Keyboard Enter uses the item immediately.
  - Sliding off cancels the hold.
  - A full 800ms hold uses the item.
  - Evidence: `rr1-03-use-now-390-es-dark.png`.
  - Residual risk: a synthetic `click` with `detail: 1` and no pointer events does nothing and
    reveals nothing. An assistive technology that dispatches only a click (some TalkBack and
    Switch Access paths) would still get a silent no-op. The fix would be to treat a click that
    had no preceding `pointerdown` as an immediate confirm, then verify on a device.
- **M4: resolved (browser-verified).**
  - es: "Icono Paquete", "Icono Espada", "Icono Espadas cruzadas", …
  - en: "Icon Package", "Icon Bow", …
  - No raw keys remain among the 44 icons.

### Status of the minor findings

- **m1, m2 and m6: resolved.**
  - m1: pips measure 17.3px at 150% (0.72rem).
  - m2: no clipped tile names at 820/150% (`rr1-04-satchel-820-en-light-150.png`).
  - m6: the copy now reads "Usar 1 × …" and "cantidad 3".
- **m3: partly resolved.** The reserved height is gone. Two Stack gaps around the now-empty
  `.inventory-notice` still leave a band of about 48px at 820/150% (`rr1-04`). Render the notice
  only when it has text.
- **m4: resolved.** The light-mode view switch now uses warm tokens.
- **m5: resolved.** The hidden-module screen has an `h1` "Inventario", and the empty attacks text
  reads "Ningún arma equipada." / "No weapon equipped."
- **m7: resolved.** Sliding off the seal cancels the hold.
- **m8: resolved (code-inspected).** The card name is now an `h3`.
- **m9: accepted** with the coordinator's rationale.
- **m10: resolved.** The forge resets the shared mutation state on open.

### New minor finding

- **n1. Focus falls to `body` inside the open card after in-card actions.** This happens after
  the seal, "Dar 1 más", the in-card Deshacer and "Usar ahora".
  - Cause: these controls become `disabled` while pending (`item-card.tsx:124,141,151,176,185`),
    and "Usar ahora" unmounts.
  - In Chromium the next Tab still lands inside the dialog, so the trap holds. A screen-reader
    virtual cursor may still lose its place.
  - Suggested direction: use `aria-disabled` with a guarded click, as the sockets now do, and
    send focus back to the seal after "Usar ahora".

### Tested in this pass

- **390 touch:**
  - DM card in es light at 150%: in-card undo, hit tests, axe, 44px checks, undo and close.
  - Player in es dark: focus after equipping from the card, after discarding the last unit,
    after equipping and unequipping through the picker, and after using the last unit.
  - Stale error inside the card, then the forge afterwards.
  - Hold seal: tap → "Usar ahora", keyboard, hold, slide-off, synthetic click.
  - Keyboard Enter on the in-card controls, with the Tab that follows.
- **820, en light, 150%, DM:** satchel (axe passes, no overflow, no clipped names), forge icon
  names and DM template hint, empty attacks text.
- **820, es dark:** forge icon names.
- **820, Player with the module hidden:** `h1` present.

Evidence added:
- `rr1-01-card-undo-390-es-light-150.png`
- `rr1-02-stale-in-card-390-es-dark.png`
- `rr1-03-use-now-390-es-dark.png`
- `rr1-04-satchel-820-en-light-150.png`

### Limitations

- Same as the first review: no real screen reader or device, no iOS Safari, and Player POV
  read-only is not browser-testable with this fixture.
- Not repeated in this pass: the 1440 and reduced-motion checks.
- m8 was checked in the diff only.
