# RYT-161: screens keep their data after a failed refresh, and an exact recovery message

Date: 2026-11-23 (block N). The owner chose the recommended option for each question on the
block N options page. Behaviour: [docs/offline-shell.md](../../offline-shell.md), "Connection
state".

## What changed

- **Recovery line (P2 A).** `src/app/use-connection.ts`, `src/shared/lib/connection.ts`.
  - New phase `back`: "Conexión recuperada" / "Connection back", with no "up to date".
  - When the 6 s wait ends with something still loading, the line says `back` and turns into
    "Conexión recuperada · datos al día" once everything on screen has loaded (at most 30 s,
    then it goes away).
  - When a query on screen failed while the backend answers, the line says `back` for 3 s; the
    screen says the rest.
  - "Up to date" only when every query on screen refreshed without error.
- **One quiet line per screen (P1 A).** `StaleLine` and `showsData`
  (`src/features/campaigns/ui/stale-line.tsx`, `load-cause.ts`).
  - A refresh that fails for a connection or server reason keeps the data; the screen shows one
    line above it, "No se pudo actualizar. Puede no estar al día." (or "Datos de hace 4 min"
    when the data is 10 s old or more), with Retry.
  - None while the line under the header already explains it (offline, reconnecting, backend
    unreachable). Losing access or the thing itself still replaces the data with its error.
  - Retry keeps focus while it runs ("Reintentando…"); when the line goes, focus moves to the
    main content. A polite region that is always present announces the line.
- **Screens.**
  - Party: no longer hides the DM plates or the Player's teammates; owner names stay.
  - Sheet: no longer replaced by an alert.
  - Inventory: no longer replaced by an alert; the proposal shelf keeps its data.
  - Shops: storefront, orders, the DM panel and the ledger keep their data; the offline card is
    no longer shown above kept data (cause passed); the catalogue editor offers Retry.
  - Glossary: a failed index refresh no longer hides it.
  - Journal: says what was silent.
  - Combat: the Player's no-fight screen and the DM's encounter list (line above the create
    form); the live table keeps its own "updated N s ago" (P4 A).
  - The campaign list and invitations use the same line instead of the red alert.
- **Silent sections (P3 A).** The inventory inside the sheet ("No se cargó el inventario: el
  equipo y la CA pueden faltar."), the glossary's homebrew and the Player's combat history say
  in place that they could not load.
- **Actions (P5 A).** Buying, selling and gold stay enabled; the server validates them.

## Acceptance

| Criterion | Evidence | Result |
| --- | --- | --- |
| Each listed screen keeps its data after a failed refetch and shows one error with Retry, or none when the connection line already says it | `tests/e2e/offline-shell.spec.ts` "RYT-161 … keeps its data": party, sheet, inventory, journal and combat at 390 and 820 px (offline: no line; back online with every data call failing: data visible, exactly one line, no alert, axe, 44 px, Retry by keyboard, focus to the main content). Campaign list and invitations: `identity.spec.ts`. Shops and glossary: code review of the same rule (`showsData`, `StaleLine`); no browser test of their failed refresh | Met (shops and glossary without a browser test) |
| The recovery line says up to date only when every query on screen has refreshed | `connection.test.ts`; "RYT-161 a slow screen after reconnecting": "Conexión recuperada" until the slow call answers, then "datos al día"; "RYT-013 one screen failing on its own" no longer says "datos al día" | Met |
| Browser tests at 390 and 820 px for at least party, inventory and combat | identity-mobile (390) and identity-tablet (820) projects; captures listed below | Met |

## Checks

- `npm run check`: typecheck, lint, contracts, 1231 unit and PGlite tests, build.
- `npm run test:e2e`, full suite before the design fixes: 1581 passed, 7 failed, 178 skipped.
  - Six were `identity.spec.ts` tests that expected the red alert this block replaces; updated
    and passing.
  - One, `legal.spec.ts` "the signed-out landing links to both pages" (tablet), passed alone
    with and without these changes.
- After the design and review fixes: `offline-shell.spec.ts` and the updated identity tests, 29
  of 29 at 390 and 820 px.

## UI review

- Design critique on the rendered line: the age of the data in the line, an always-present
  polite region, "Reintentando…" while busy, a quieter Retry, two-sentence copy, the combat line
  above the create form and a 60ch text cap. All applied.
- Independent UI review, first round: CHANGES_REQUIRED. Background refreshes switched Retry to
  "Reintentando…" and disabled it, so at 390 px the button wrapped and the content below moved
  24 px every 10 to 15 s; the live region re-announced the line each time the age changed.
- Fixed: progress shows only after a press (the warning icon becomes a spinner; the label and
  width never change), and the region announces the line without its age.
- Second round: PASS (party and DM combat at 390 px held 35 s without movement; announcements
  checked in the DOM).
- Minor notes left: the sheet can stack its general line and the inventory line; the glossary's
  "Homebrew 0" tab beside its missing line; at 820 px the page stamp "Actualizado ahora mismo"
  beside "No se pudo actualizar".

## Not tested

- Shops and glossary failed refreshes in the browser (same component and rule as the tested
  screens).
- A real phone dropping its socket in the background on the deployed site.
- WebKit/iOS and screen readers (the live region is checked only as markup).
