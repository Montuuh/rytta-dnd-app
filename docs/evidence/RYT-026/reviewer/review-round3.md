# RYT-026 independent UI/UX review — round 3

Verdict: **CHANGES_REQUIRED**

Source fingerprint: `dc3676071f00febe7fbf9ebfc5307fef3637368d3d5ad38d97e5a2323d35f55d`.

Build reviewed: `vite build --base=/rytta-dnd-app/` in Supabase fixture mode
(`VITE_DATA_MODE=supabase`, `https://rytta-test.supabase.co`, test publishable key),
served by `vite preview` on a private port (4194). An earlier attempt that hit an unrelated
server already listening on 4184, with a mis-based build, was discarded and re-run.

## Fixed from round 2 (browser-tested at 390, 820 and 1440 px, Spanish/dark)

- **Partial bulk-add focus.** Select two items, focus "Añadir 2 objetos", press Enter;
  first `save_listing` succeeds, second returns 503. Focus stays on the same button, now
  labelled "Añadir 1 objeto" (active element is the BUTTON, not BODY). Only the pending
  item (Armadura de cuero) remains `aria-pressed=true`.
- **Retry idempotency.** Retry sends three requests total; requests 2 and 3 share the same
  `request_id`; the drawer closes on success.
- **Double-fire guard.** While busy (first request held 1.2 s), pressing Enter and Space
  again on the `aria-disabled` button sent no extra request (`requestsDuringBusy: 1`).
- **Duplicate toast.** After the partial failure there are zero `.save-pill` or
  Mantine notification elements; the error appears only inline in the drawer.
- **axe.** Zero WCAG 2 A/AA / 2.1 AA violations in the partial-error state at all three
  widths (390 measured with 150% root font size).
- **Round-1 unequip focus.** Re-confirmed at 390/820/1440: on 503, focus stays on
  "Quitar Armadura de cuero"; on retry, focus moves to "Torso: vacío" and AC shows 13.

## Findings

- **P2 — Inline error hidden beneath the sticky dock at 390px / 150% text.**
  `src/features/shops/ui/stock-list.tsx:532-537` with `.pick-dock` (`src/app/styles.css:2980`,
  `position: sticky; bottom: 0`). After the partial failure, the alert renders at
  y 641–788 while the dock covers y 677–843 (111 px overlap); the hit-test at the alert
  centre lands on the dock. Only a red strip with clipped text is visible
  (`round3-390-150-partial-error-viewport.png`). `scrollIntoViewIfNeeded` does not move it;
  the user must discover a manual scroll of the drawer to read the reason
  (`round3-390-150-partial-error-wheel.png`). Screen readers get the `role=alert`
  announcement, but sighted low-vision users (exactly the 150% case) do not see why only
  one item remains. Not reproduced at 390/100% or 820/150% (no overlap). Suggested fix:
  render the error inside the dock above the button, or scroll the alert above the dock
  on failure (e.g. `scroll-margin-bottom` equal to the dock height plus `scrollIntoView`).
- **P2 — Busy state is visually indistinguishable from idle.**
  `src/features/shops/ui/stock-list.tsx:538-545`. During the request the button keeps
  opacity 1, the full accent background `rgb(237,161,69)` and `cursor: pointer`. The
  `<Loader size={16} />` is present (16×16, visible) but uses the default loader colour
  `--loader-color: #eda145`, identical to the button background, so it is invisible
  (`round3-390-100-busy-button.png`, `round3-390-shop-busy.png`). The pick tiles are
  natively disabled during the request but also keep opacity 1. Result: no visible
  system-status feedback for a multi-request operation; the guard prevents duplicates,
  but the control does not "still look disabled". Suggested fix: give the Loader
  `color="currentColor"` (or the on-accent text colour) and add a shared disabled
  appearance for `.mantine-Button-root[aria-disabled='true']` (and `.pick-tile:disabled`).
- **P3 — Same pattern in other new busy buttons (code-inspected only, not browser-tested).**
  `src/features/inventory/ui/definition-editor.tsx:156-159`,
  `src/pages/campaign-items-page.tsx:208-210`,
  `src/features/shops/ui/catalogue-shop-picker.tsx:91-93`,
  `src/features/inventory/ui/forge.tsx:382-384` (and pre-existing
  `src/features/characters/ui/party.tsx:746-748`) use the same default-variant Button with
  an uncoloured `<Loader size={16} />` and no aria-disabled styling, so they very likely
  share the invisible-spinner issue. Their click/submit handlers are correctly guarded
  against re-entry (code-inspected).

## Evidence

- Scripts: `recheck-round3.mjs` (extended this round with busy-state, double-press and
  toast checks; base overridable via `REVIEW_BASE`), `probe-round3.mjs`,
  `probe-round3-scroll.mjs`. Run with `npx tsx`.
- Results: `round3-results.json`, `round3-probe.json`.
- Screenshots: `round3-{390,820,1440}-unequip-error.png`, `-unequip-success.png`,
  `-shop-busy.png`, `-shop-partial-error.png`; `round3-390-100-*`, `round3-390-150-*`,
  `round3-820-150-*` (busy button, partial error viewport/scrolled, wheel-scrolled).
- Visually inspected: `round3-390-shop-partial-error.png` (full page),
  `round3-390-shop-busy.png`, `round3-390-100-busy-button.png`,
  `round3-390-150-partial-error-viewport.png`, `round3-390-150-partial-error-scrolled.png`.

## Untested / limitations

- Light theme and English for the drawer error/busy states; 1440 at 150%.
- Real touch gestures (contexts use `hasTouch`, but interactions are keyboard/mouse).
- Screen-reader output (only `role=alert`/`aria-busy` attributes verified).
- Other busy buttons listed under P3 were not exercised in the browser.
- HTTP fixtures only; no hosted Supabase. Scope and fixture limitations from
  `review-round1.md` still apply.
