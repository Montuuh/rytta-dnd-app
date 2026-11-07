# RYT-069 verification: one color scheme per theme, theme tiles and a Settings drawer

Delivery of 2026-11-07, uncommitted on `main` (base d303101, equal to `origin/main` after
`git fetch`). The working tree also holds the uncommitted RYT-067/068 work of another session; this
delivery owns only the paths listed below. Decision:
[ADR 034](../../decisions/034-one-scheme-per-theme.md). Design flow: [design flow](design-flow.md).

## What changed

- **Theme model** (`src/shared/theme/class-themes.ts`, `theme-store.ts`, `index.ts`): 14 themes,
  each with one `scheme`, palette and token set (26 sets before). Dark: Hearth, Bard, Cleric,
  Druid, Fighter, Monk, Paladin, Ranger, Rogue, Sorcerer. Light: Parchment (new, the former default
  light tokens), Barbarian, Warlock, Wizard. Light accents moved toward the class color: Wizard
  `#224fa7`, Warlock `#7d4dbe` (hero `#e9e3f7`), Barbarian `#ac0311`. `resolveClassTheme` migrates a
  legacy light default to Parchment; an explicit choice removes `rytta-color-scheme`.
- **Scheme follows the theme** (`src/app/providers.tsx`, `index.html`): `forceColorScheme` plus a
  manager that reports the theme's scheme; the store and the pre-paint bootstrap set
  `data-rytta-theme` and `data-mantine-color-scheme` together.
- **Generated CSS** (`src/app/class-themes.css`): one block per class theme, scoped to its scheme.
- **Settings drawer** (`src/app/layout.tsx`, `src/app/router.tsx`, `src/pages/settings-panel.tsx`
  and `.css`, renamed from `settings-page.*`): the profile menu opens a right-hand drawer
  (`calc(min(100vw - 1.5rem, 30rem))`, light 0.3 veil) over the current screen; language first,
  then the theme tiles in Dark and Light groups, then the saved note. `#/settings` opens the drawer
  over the home screen; route changes do not pull focus out of the open drawer.
- **Copy** (`src/shared/i18n/settings-*.ts`, `en.ts`, `es.ts`): Theme/Tema, group names and hints,
  Parchment/Pergamino, Close settings/Cerrar ajustes; Appearance and the class-theme strings and the
  intro line removed.
- **Docs:** ADR 034 (ADR 021 marked as partly superseded), design-system, docs index, RYT-069 ticket.

## Checks

- `npm run check`: typecheck, lint, architecture, docs (70 tickets), AI contracts, 44 unit files /
  310 tests and the build all pass. `tests/unit/class-themes.test.ts` (20 tests) checks every theme
  in its own scheme for WCAG AA, the grouping, the generated CSS, the bootstrap lists and migration.
  The first run failed once on Warlock (accent on hero 4.49 < 4.5); fixed by lightening the hero.
- Full `npm run test:e2e` on the theme model before the drawer: 503 passed, 55 skipped, 0 failed.
- Full `npm run test:e2e` after the drawer: 500 passed, 1 failed (tablet keyboard test: the test
  focused a radio before the drawer placed its initial focus). Investigating it found a real bug:
  opening Settings from a `#/settings` link left focus on `<main>` behind the dialog. Fixed in
  `layout.tsx`; the test now also waits for the drawer's initial focus.
- Other failures fixed in the tests, not the app: a hash change before the router mounted, axe
  measuring the page dimmed behind the modal veil (the drawer is now audited on its own; the page
  is audited in the first pass) and axe reading tiles mid-animation (tests wait for opacity 1 and
  use reduced motion for the per-theme contrast sweep). `preferences.spec.ts` then passed 3 times in
  a row on desktop, tablet and phone (96 passed).
- Final full run: see [Final run](#final-run).

## Captures

Inspected in the in-app browser (demo data, Vite dev server) at 390 × 844, 820 × 1180 and
1024 × 768: phone drawer with a strip of the page visible and four tiles a row; tablet and desktop
drawer at 480 px with five tiles a row (the ten dark themes fill two rows); Wizard, Hearth and
Warlock applied; light tiles on a dark page and dark tiles on a light page. Labels do not overflow
(longest "Explorador"/"Pergamino", 69 px at 14 px). The e2e matrix writes captures per language and
theme (`test-results/**/{es,en}-{default,parchment,warlock,rogue}-{party,settings}.png`).

## Impeccable critique and audit

`⚠️ DEGRADED: single-context` — the repository allows delegation only for the `ui-ux` review
(AGENTS.md, docs/ai-workflow.md), so Assessment A and B ran in this context, A first.

- **Assessment A (design review):** design specificity is good: the tiles are literal swatches of
  each class theme with its glyph, which no other product would ship unchanged. Nielsen scores:
  visibility 4, real-world match 3, user control 4, consistency 3, error prevention 3,
  recognition 4, flexibility 3, aesthetics 3, error recovery 3, help 3: **33/40**. Cognitive load:
  one decision point with 14 options, split 10/4 and made recognizable by the previews.
  Priority issues found and fixed: the default veil dimmed the page so a new theme was hard to judge
  behind the drawer (veil lowered to 0.3); the Theme help repeated the group hints (shortened to one
  sentence); an intro line repeated the saved-on-this-device note (removed); help text left a
  single word on its last line (`text-wrap: pretty`).
- **Assessment B (detector):** `impeccable detect --json` on `settings-panel.tsx` and `layout.tsx`:
  0 findings. Browser overlay injected in a fresh `[Human]` tab with the drawer open: 3 findings.
  Fixed: straggler "traduce." in the language help. Out of scope and left as they are: `overused-font`
  (Inter is the project's pinned body font, design-system.md) and `kicker-above-heading` ("TU
  AVENTURA" above the Party h1, an existing page head outside this delivery).
- Questions skipped: run inside the standing UI design flow; material findings were fixed directly.

## Independent review

See [ui-ux review](../ui-review/ryt-069/review.md). First verdict (fingerprint `e3b4b07f…`):
CHANGES_REQUIRED with two P2 and two P3. Fixes:

- **P2-1** language names broke inside the word at 360/375 px and at 150 % text: the language grid
  now places the cards side by side only when the name fits whole (`minmax(min(100%, 11.5rem),
  1fr)`) and the label no longer wraps anywhere. Checked with Playwright at 320, 360, 375 and
  390 px, 100 % and 150 %, Spanish and English: each name on one line, no overflow.
- **P2-2** the global phone rule capping drawers at 92dvh (meant for bottom sheets) shortened the
  side panel: `.settings-drawer` content now has `max-height: none`; it reaches the viewport
  bottom at all four phone sizes.
- **P3-1** the pre-paint `html` colors in `index.html` beat the theme tokens (light class themes
  showed Parchment's background): they are wrapped in `:where()`, and the bootstrap maps every
  theme to its scheme and background (`--boot-bg`, initial `theme-color`); the unit test checks the
  map against `class-themes.ts`.
- **P3-2** English close label is "Close app setup" like the title; the theme help no longer
  describes the implementation ("Text always keeps its contrast").

After the fixes the settings-related specs (preferences, scaffold, identity, characters,
character-sheet) ran once with 163 passed and 1 failed ("controls smaller than {height: 44}"; the
line reporter did not name the test), then 164 passed, then 3 repeats with 492 passed and none
failed. The intermittent touch-target failure did not reproduce and stays recorded here.

Focused re-review (round 2, fingerprint `51f1f2ae17d2ebe6207d2e5a6409e098a9666da6207444fc08c24db5d3aa1e2a`):
**PASS**, all four findings fixed in the browser, no regressions or new findings. Recorded in
`docs/evidence/ui-review-current.json` (it previously held the RYT-068 PASS; that report stays in
`docs/evidence/ui-review/ryt-068/review.md`). The fingerprint covers the whole working tree,
including the uncommitted RYT-067/068 work. Not re-covered in round 2: the full theme matrix, 1024 px
laptop, reduced motion and the `#/settings` deep link (unchanged paths, covered in round 1 and e2e).

## Final run

On the reviewed source: `npm run check` passed (310 unit tests, build). Full `npm run test:e2e`:
501 passed, 55 skipped, 2 failed.

- `preferences.spec.ts` "the profile menu opens the Settings drawer…" (desktop): the test compared
  the drawer's right edge with `clientWidth` (1440) while fixed elements end at 1425 because desktop
  Chromium keeps the stable scrollbar gutter (`scrollbar-gutter: stable` on `html`). Checked with
  Playwright at 1440 × 900: no element sits in the 15 px strip (`elementFromPoint` is null); it is
  the browser's scrollbar track, as on every screen. The test now measures against the drawer's
  veil, which shares the drawer's containing block, after the slide-in. Then `preferences.spec.ts`
  passed 3 times in a row on all projects (96 passed).
- `glossary.spec.ts` "focused fields stay clear of the sticky editor footer at 100% text"
  (identity-mobile): 90 s test timeout under the full-suite load; it does not touch Settings and
  passed twice in isolation (4 passed). Recorded as an unrelated load flake.

## Not tested

- Hosted Supabase and a signed-in live session: preferences are local; the live layout was covered
  by the identity fixtures in e2e.
- iOS Safari and real devices: Chromium emulation only.
