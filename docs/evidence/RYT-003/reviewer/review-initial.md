# RYT-003 independent UI/UX review — initial

Date: 2026-10-28. Reviewer: ui-ux.

Verdict: CHANGES_REQUIRED

Reviewed source digest: `8386b0683af2603471c5e2c934dbc0dd168afeb999b488ede06b571f9d47ae55`.

## Blocking finding

- **P2 — Valid resource totals overlap at enlarged mobile text.** In `src/features/characters/ui/party.tsx`, the two-column resource `SimpleGrid` and its numeric `Text` elements (approximately lines 108–124 of this snapshot) do not constrain or wrap long values. At 390px, Spanish, dark theme and 150% root text, set gold to `9007199254740991` and water/food/exhaustion to `2147483647`. These are accepted domain values. Gold crosses the water label/value; the other totals extend outside their cells/card. Document scroll width becomes 392px for a 390px viewport. Preserve complete amounts without overlap, then recheck phone and tablet enlarged-text rendering. Evidence: `max-resources-390-es-dark.png` and `probe-results.json`.

## Independent browser checks

Executed `probe.mjs` against the production-subpath identity build at `http://127.0.0.1:4175/rytta-dnd-app/`, with the repository's explicit HTTP identity fixture. This is real Chromium rendering and interaction with fixture responses, not hosted Supabase.

- 390px ES/dark and EN/light; 820px ES/light and EN/dark.
- Account home and campaign selection, account drawer, resource list and resource modal.
- 150% text on campaign, editor and drawer; reduced motion.
- Zero axe WCAG A/AA violations in the tested normal states; no measured visible interactive targets below 44px.
- Escape returns focus to the resource-editor trigger and hamburger. Account-link navigation closes the drawer and focuses `main-content`.
- No browser page errors during these journeys.
- Resource and account hierarchy remains readable for representative values; explicit units match homebrew gold, food/water rations and manual exhaustion.
- Account/logout lives in home; return-to-account is distinct from the membership-leave action.

Executed `states.mjs` independently at 390px:

- DM empty list and Player unassigned empty list.
- Failed character read, visible loading during retries, error and successful retry.
- Signed-out home and accessible preference menu.
- Stale editor warning, disabled save, Escape and reopen loading the new amount (70).
- Twelve Tab presses remain inside the resource dialog.
- Zero axe violations in these states.

The first error-state probe used the default five-second assertion timeout and observed the loading state while SDK/query retries were still active. Repeating with a 20-second bound reached the expected error and retry recovery. This was a probe timing limitation; the initial result is retained here.

## Evidence inspected visually

- Independently captured home phone EN/light, party tablet EN/dark, editor tablet ES/light, drawer phone ES/dark, and the large-value failure.
- Generated `home-*`, `party-*`, `editor-*`, `menu-*`, `state-*` screenshots and JSON probe results are in this directory.
- Implementation-provided automated evidence covers the complementary theme/language combinations, desktop, login/campaign/membership flows and axe; those reported 93 passing tests are supporting evidence, not substituted for the independent checks above.

## Limits

No hosted OAuth/JWT/PostgREST, real Safari/iOS, screen reader, or backend authorization/concurrency certification was performed by this UI reviewer. The implementation's PostgreSQL and multi-device reports are separate evidence. No production change was made. This initial verdict does not approve any later source digest.
