# RYT-026 independent UI/UX review — round 1

Verdict: **CHANGES_REQUIRED**

Reviewed source fingerprint at the start of this round:
`35f536b7683352145dc150dc38eaa1291c6a0c6faaf8a06668ffa95067c9dd39`.
The implementation changed while the review ran; a focused re-review is required.

## Blocking finding

- **P2 — Direct unequip loses keyboard focus.** `src/features/inventory/ui/paper-doll.tsx:212`.
  Chromium, 390px, Spanish/dark. Open Equipment, focus `Quitar Armadura de cuero`
  and press Enter. After the successful mutation removes the row, `document.activeElement`
  is `BODY`. The keyboard user loses their location instead of continuing at the now-empty
  body socket. Return focus to the affected socket after success; keep a useful focus
  location and visible feedback on failure. Reproduced by the independent reviewer.
  Evidence: `focus-result.json`, `390-unequip-focus-lost.png`.

## Independent browser coverage

`probe.mjs` ran against a separate built preview at port 4184 using HTTP contract fixtures.
`browser-results.json` records 21 rendered states, each with zero axe A/AA violations,
no horizontal document overflow and no measured button smaller than 44px in either axis.

- 390px Spanish/dark at 100%, English/light at 150%.
- 820px Spanish/dark at 150%, English/light at 100%.
- Reduced motion on all contexts.
- Empty campaign catalogue without characters, image file selection and preview, creating
  exactly one definition without granting any inventory, long-name wrapping, catalogue
  cards, editor Escape and focus restoration, and empty grant destination feedback.
- At 390px: populated grant and shop drawers, their Escape/focus return, gold typing,
  cancellation and saving zero, and gold modal focus return.
- At 820px: Player sheet-to-equipment navigation and direct unequip with AC changing 14→13.

Visually inspected the real captures `390-es-dark-100-catalogue.png`,
`390-en-light-150-editor.png`, `820-es-dark-150-catalogue.png`, `390-gold.png`,
`390-shop-drawer.png` and `820-player-equipment.png`. Hierarchy, contrast and wrapping
are coherent with the existing design system. The editor scrolls at large text without
losing access to actions. The orange image is the test PNG, not representative artwork.

## Boundaries

This review does not establish hosted Auth, Storage uploads or RLS correctness: browser
traffic uses explicit HTTP fixtures. No real Google Player session, physical iOS/Safari,
screen reader, or production deployment was exercised. Database checks belong to the
implementation validation report. The parent is additionally repairing partial multi-item
shop recovery; that change has not yet been reviewed in this round.
