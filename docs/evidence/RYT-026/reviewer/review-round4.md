# RYT-026 independent UI/UX review — round 4

Verdict: **PASS**

Source fingerprint: `d1b7c6574fd53a0cad8b2c7d209d1bb474ccb054dc6cc7be6f7e9109431ac63e`.

Build reviewed: `vite build --base=/rytta-dnd-app/` (run with `MSYS_NO_PATHCONV=1`; the
emitted `index.html` was checked to reference `/rytta-dnd-app/assets/index--qcrqiJZ.js`) in
Supabase fixture mode (`VITE_DATA_MODE=supabase`, `https://rytta-test.supabase.co`, test
publishable key), served by `vite preview` on a private port (4195). The server is stopped.

## Round-3 findings: resolved (browser-tested, Spanish/dark)

- **P2 inline error hidden under sticky dock — fixed.** The alert now renders inside
  `.pick-dock` (`src/features/shops/ui/stock-list.tsx:532-538`). At 390/100, 390/150,
  820/100, 820/150 and 1440/100 the alert lies fully inside the viewport and the hit-test
  at its centre lands on the alert itself; it can be read without scrolling
  (`round4-390-150-partial-error-viewport.png`, inspected).
- **P2 busy state indistinguishable — fixed.** `src/app/styles.css:386-395` and `:2992`.
  While the add request is in flight the focused button has opacity 0.6, cursor
  `not-allowed`, and the Loader uses `--loader-color: currentColor` (rendered
  `rgb(24,16,9)` on the orange fill): the spinner is visible
  (`round4-390-100-busy-button.png`, `round4-390-150-busy.png`, inspected). All pick tiles
  are natively disabled with opacity 0.6 during the request. Label contrast on the
  dimmed button remains legible in the screenshots.
- **P3 same pattern in other busy buttons — fixed where spot-checked.** At 390 px the
  "Dar a personajes" drawer (`src/pages/campaign-items-page.tsx`) and the "Añadir a tienda"
  picker (`src/features/shops/ui/catalogue-shop-picker.tsx`), with the RPC held 2.5 s,
  both show opacity 0.6, cursor `not-allowed` and a visible `currentColor` spinner
  (`round4-390-give-busy-button.png` inspected, `round4-390-catalogue-shop-busy-button.png`).
  `definition-editor.tsx`, `forge.tsx` and `party.tsx` busy states were not exercised in
  the browser; they use the same Button + Loader markup and therefore the same global
  rules (code-inspected).

## Regression checks (browser-tested at 390, 820, 1440)

- Partial bulk-add: focus stays on the button ("Añadir 1 objeto") after the 503; only the
  pending item stays selected; retry reuses the failed request's `request_id` (3 requests
  total) and closes the drawer.
- Enter + Space pressed while busy produced no extra request (`requestsDuringBusy: 1`).
- No `.save-pill` or notification toast after the partial failure.
- axe WCAG 2 A/AA + 2.1 AA: zero violations in the partial-error state at all five
  width/scale combinations.
- Round-1 unequip: on 503 focus stays on "Quitar Armadura de cuero"; retry moves focus to
  "Torso: vacío" with AC 13.
- After failure the retry button is back to opacity 1 and `aria-disabled=false`.

## Observations (non-blocking)

- **P3 — Dock height at 390px / 150% text.** With the alert, the sticky dock is 328 px,
  42% of the 776 px drawer (24% at 390/100, 18% at 820/150). The first tile row stays
  fully visible above it and the rest of the grid scrolls beneath; acceptable for an
  error state, but trimming the help text while an error is shown would recover space.
- **P3 — Copy: first attempt reads "Reintentar".** `src/pages/campaign-items-page.tsx:227`
  and `src/features/shops/ui/catalogue-shop-picker.tsx:112` switch the label to
  `common.retry` as soon as the first attempt starts, so the busy button reads
  "Reintentar" before anything has failed (`round4-390-give-busy-button.png`). Consider
  switching to retry only after an error.
- The busy cursor resolves to `not-allowed` rather than `progress` because the
  aria-disabled rule is more specific than the aria-busy rule; harmless on touch.

## Evidence

- Scripts: `recheck-round4.mjs` (round-3 checks with round4- outputs),
  `probe-round4.mjs` (busy styles, tile opacity, alert/dock geometry, axe at 390/100,
  390/150, 820/100, 820/150, 1440/100; P3 spot-checks). Run with `npx tsx` and
  `REVIEW_BASE=http://127.0.0.1:4195/rytta-dnd-app/`.
- Results: `round4-results.json`, `round4-probe.json`.
- Screenshots: `round4-*` (unequip error/success, shop busy/partial-error at each width,
  `*-busy-button.png`, `*-busy.png`, `*-partial-error-viewport.png`,
  `round4-390-give-busy-button.png`, `round4-390-catalogue-shop-busy-button.png`).
- Visually inspected: `round4-390-150-partial-error-viewport.png`,
  `round4-390-150-busy.png`, `round4-390-100-busy-button.png`,
  `round4-390-give-busy-button.png`.

## Untested / limitations

- Light theme and English for these states; 1440 at 150%.
- Busy states of definition editor, forge and party gold controls in the browser.
- Real touch gestures and screen-reader output (attributes only).
- HTTP fixtures only, no hosted Supabase. Scope limits of `review-round1.md` still apply.
- This PASS applies only to the fingerprint above.
