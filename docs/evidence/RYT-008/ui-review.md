# RYT-008 independent UI/UX review

- Reviewer: `ui-ux` role (`.codex/agents/ui-ux.toml`), run as an independent subagent.
- Date: 2026-11-03.
- Reviewed source: branch `cl/gifted-bohr-6l74mn`, commit `b1c3af5`, clean working tree.
  UI source fingerprint (`node scripts/check-ui-review.mjs --fingerprint`):
  `e3da40fb08f4e56cda89cb0d7bb1132730bdc940cd4b0a608cb9ffa1bd9e73a6`.

## Verdict: CHANGES_REQUIRED

Most of the delivery works and looks good. Bilingual and alias search returns the right
entries. Quick facts and the folded 2014 rules render correctly. The reference sheet opens
above the item card drawer. Homebrew text is rendered as text, and axe found no violations
in any glossary state. One blocker and two major issues remain:

1. Characters typed into the search field are lost on the default "All" tab.
2. The phone "bottom sheet" is anchored to the top of the screen.
3. Going back from a nested definition loses keyboard focus.

## How it was tested

### Real browser testing

I used the preinstalled Chromium at `/opt/pw-browsers/chromium` with Playwright scripts in the
session scratchpad. I added no repo specs.

Builds and viewports:

- **Production build (supabase mode):** built with base `/rytta-dnd-app/` and served by
  `vite preview` on port 4174. The mocked backend was `tests/e2e/fixtures/identity.ts`.
- **Demo:** the Vite dev server with `VITE_DATA_MODE=demo` on port 5299, for `#/glossary`.
- **Viewports:** 390×844 and 820×1180, both touch enabled.

Scenarios:

- **Standalone glossary (demo), es dark:**
  - Index, tab order, `/` shortcut, typing, ArrowDown/ArrowUp/Escape and Enter.
  - Alias search ("agotamiento" finds Cansancio) and the no-results state.
  - Spell entry (Bola de fuego), the back link, the thumb index (M) and scroll position.
  - Spell filters drawer: keyboard on the slider, Escape, focus return.
- **Theme and language matrix at 150% text** (`html { font-size: 150% }`), search results
  and the Grappled entry with the 2014 accordion open, then a nested term in the reference
  sheet:
  - en / light / druid
  - es / light / default
  - es / dark / warlock
  - en / dark / paladin

  In each variant I checked axe, horizontal overflow, Escape focus return and Spanish leaks
  in the English UI.
- **Typing speed probe:** on the dev server and on the production build, on the All tab and
  the Conditions tab.
- **Character sheet (Player, module on), es dark:**
  - 33 inline terms, with an `elementFromPoint` hit-area probe 9px above and below each term.
  - Term focus ring.
  - Enter opens the definition, Escape closes it and focus returns to the term.
  - Nested term (AC → attack roll), the back control, Tab after going back, closing.
  - Turning on "Agarrado" and opening it from the "Activos" line.
  - Spells tab.
- **Character sheet in en / light / bard at 150%:** axe, overflow, AC reference sheet and the
  "Open in the glossary" link.
- **Inventory:**
  - Item card drawer → damage-type term: the reference sheet stacks on top (verified with
    `elementFromPoint`).
  - Escape order and focus return to the item tile.
  - Equip the sword, then the attack-line term.
- **Party:** teammate conditions (Envenenado, Derribado) open their definitions; axe.
- **Homebrew (DM):**
  - Homebrew tab, editor drawer, Escape and focus return to "Nueva entrada".
  - Unsafe input (`<img onerror>`, `<script>`, `<b>`, `**…**`) saved and rendered.
  - Empty-name validation.
  - ⋯ menu, then "Añadir una regla de la casa" prefilled from the Prone entry.
  - The empty Homebrew state for a DM.
- **Player with the module off:** the page note.

### Screenshot and code inspection only

- I inspected the delivery's screenshots in `docs/evidence/RYT-008/*.png`.
- I read the code of every file under `src/features/glossary/ui/*`, plus the glossary i18n
  catalogs (`src/shared/i18n/glossary-{en,es}.ts`) and the integration diffs (sheet, vitals,
  party, item card, paper doll, listing card, storefront, modules, layout, router, members).
- The en/es catalog keys match exactly (the `satisfies` check plus a key diff).

## Findings

### F1 (blocker): typed characters are lost in the search field on the All tab

- **Where:** `src/features/glossary/ui/glossary-page.tsx:300-306` (controlled `value={query}`
  from the URL), with `setParam` at `:160-165` (`setSearchParams(…, { replace: true })` on
  every keystroke).
- **When:** 390px and 820px, every theme and both languages, on the production build and on
  the demo dev server.
- **Reproduction:** open the glossary on the All tab (550 entries), click the search field
  and type "grappled".

  | Typing speed | Production build result |
  | --- | --- |
  | 200 ms per key | `grappled` |
  | 120 ms per key | `rpled` (390px) |
  | 60 ms per key | `gappled` (both viewports) |

  On the dev server:
  - "grap" typed at 120 ms per key became `gap` or `p`.
  - "/" followed by "prone" became `r` or `loe`.
  - Pressing Home and inserting "bola de " before "fuego" gave `bfoola de `.
  - Typing "prone" and pressing Enter at once opened `skill.deception?q=e`.

  In the Conditions tab (small list) the same input is intact. The problem appears when the
  first keystroke re-renders the 550-row index.
- **Impact:** keyword search is the page's main element and an acceptance criterion. On real
  phones, which are slower than this container, players will see missing letters and
  scrambled queries, and Enter can open the wrong entry. The repo e2e misses this because it
  uses `fill()`, which writes the value in one event.
- **Suggested fix:**
  - Keep the input value in local React state, updated synchronously.
  - Mirror it to the URL without blocking (debounce, or after a transition).
  - Keep `useDeferredValue` for the list only.
  - Make Enter use the local value.
  - Add an e2e test that uses `keyboard.type` with a delay on the All tab.

### F2 (major): the phone "bottom sheet" is anchored to the top of the screen

- **Where:**
  - `src/features/glossary/ui/reference-sheet.tsx:163-174` (`Drawer.Root` with `size="auto"`).
  - `src/features/glossary/ui/glossary.css:581-586` (`.gl-sheet-content { max-height: 86dvh }`).
- **When:** 390px, every theme. The delivery's own `sheet-reference-mobile.png` shows it too.
- **Reproduction:** open any inline term on a phone. Measured geometry: `.gl-sheet-content`
  runs from top 0 to bottom 725.8 in an 844px viewport. It is a fixed 86dvh tall even for a
  two-line definition such as "Cortante".
- **What you see:**
  - The drag handle and the close button sit at the very top edge.
  - A 118px strip of page content (and the bottom nav) shows below the sheet.
  - Short definitions leave most of the panel empty.
  - At 150% the text runs into the bottom edge of the sheet, with page text visible just
    below (`mobile-demo-sheet-es-light-default-150.png`).
- **Impact:**
  - It contradicts the design-system contract ("bottom sheet on phones").
  - It looks broken.
  - It moves the close control to the hardest reach zone on a phone.
  - The handle suggests a drag gesture that does not exist.
- **Suggested fix:** anchor the content to the bottom with auto height up to 86dvh, for
  example with Mantine's bottom positioning and no override that stretches the content. Then
  check short and long entries at 390px and at 150%.

### F3 (major): going back from a nested definition loses keyboard focus

- **Where:**
  - `src/features/glossary/ui/reference-sheet.tsx:157-160`: the headword is focused only
    while `stack.length > 1`.
  - `:180-185`: the back button unmounts when the stack returns to one entry.
- **When:** 390px and 820px, es dark.
- **Reproduction:**
  1. On the sheet, open "Clase de armadura".
  2. Activate "tirada de ataque" inside the definition.
  3. Focus "Volver a Clase de armadura" and press Enter.

  `document.activeElement` is now `BODY`. The next Tab re-enters the drawer on the first
  term.
- **Impact:** keyboard and screen reader users lose their place inside a modal dialog. This
  fails the acceptance criterion "with keyboard, Escape and focus return" (WCAG 2.4.3).
- **Suggested fix:** after any stack change, including going back to the root, move focus to
  the current headword. Add an e2e assertion that the headword is focused after going back.

### F4 (minor): the reader loses its place in the list after viewing an entry (phone and 820px tablet)

- **Where:** `src/features/glossary/ui/glossary-page.tsx:273-277`, the back link. The index
  unmounts below 62em.
- **Reproduction (390px and 820px):** jump to "M", open "Maleficio", then come back.

  | How you come back | Scroll position |
  | --- | --- |
  | Before opening the entry | 22,616 px (390px) / 24,576 px (820px) |
  | Browser back | 10,096 / 9,619 |
  | "Todas las entradas" link | 0, the top of the 550-entry list |

  Keyboard focus also lands on `main`, not the row.
- **Impact:** browsing at the table means re-scrolling or re-tapping a thumb letter after
  every lookup. A preserved query hides this for search, but not for alphabetical browsing.
- **Suggested fix:** restore the scroll position and focus the row that was opened.

### F5 (minor): keyboard path into the results is long and only partly arrow-driven

- **Where:**
  - `src/features/glossary/ui/entry-index.tsx:435-450`: every letter of the thumb index is a
    Tab stop.
  - `glossary-page.tsx:198-203`: ArrowDown only focuses the first row.
- **Reproduction (390px and 820px):**
  - From search, the next Tab stops are one tab-list stop and then 20+ thumb buttons (A, B,
    C…) before the first entry.
  - In the results, ArrowDown, ArrowUp and Escape do nothing. There is no way back to the
    search field except Shift+Tab or `/`.
- **Impact:** slow keyboard navigation on a tablet with a keyboard. This is not a WCAG failure.
- **Suggested fix:** move between rows with the arrow keys, and return to search with ArrowUp
  on the first row or with Escape. Consider making the thumb index a single Tab stop.

### F6 (minor): focus after save goes to `main`, not the headword

- **Where:** `glossary-page.tsx:94-101` and `:423-431`.
- **Reproduction:** at 390px and 820px, after saving a homebrew entry (or pressing Enter in
  search), `document.activeElement` was `MAIN` 800 ms later. The ADR and the design system
  say "Saving moves focus to the saved headword". A route-level focus effect probably runs
  after this one.
- **Impact:** screen readers start at the back link and category instead of the new headword.
  The docs promise more than the UI does.

### F7 (minor): overlapping 44px hit areas between stacked terms

- **Where:** `src/features/glossary/ui/glossary.css:24-28` (`::after` inset −12px).
- **Reproduction (820px):**
  - In the sheet's skills list, a tap 9px below "Acrobacias", "Arcanos", "Atletismo" and
    others lands on the next skill's term.
  - The same happens in rules prose ("DC") on the English Grappled entry.
  - At 390px the probes passed, apart from terms that sit directly under the fixed bottom
    nav, which is expected.
- **Impact:** a tap between lines can open the neighbouring definition. Taps on the text
  itself are always correct.
- **Suggested fix:** consider a smaller vertical inset where the line spacing is tight (for
  example the skills list).

### F8 (minor): the spell-level range slider is small and its thumbs are unnamed

- **Where:** `glossary-page.tsx:523-536`.
- **Reproduction:** in the filters drawer at 390px and 820px, both thumbs are 16px tall and
  share the accessible name "Nivel de conjuro".
- **Impact:** both thumbs are hard to grab by touch at the table, and screen readers cannot
  tell minimum from maximum. Arrow keys work: two presses gave 255 spells.
- **Suggested fix:** name them "Nivel mínimo" / "Nivel máximo" and make the touch area larger.

### F9 (minor): editor and delete copy

- **Editor footer reuses the empty-state text.** `homebrew-editor.tsx:254-256` shows "Añade
  reglas de la casa… Toda la mesa puede leerlos y editarlos." under the Save button. It reads
  as an empty state inside a form.
- **Empty-name validation is generic and does not move focus.** `homebrew-editor.tsx:112-114`
  reuses "Revisa los campos: alguno está vacío o es demasiado largo." Focus stayed on "Guardar
  entrada" (screenshot `mobile-hb-validation.png`, where the error is scrolled out of view).
  It should say that a name is required and focus the field.
- **Delete failures use save wording (code inspection).**
  `glossary-page.tsx:594-595, 608-609`: a failed delete with an unknown error shows "No se
  pudo guardar la entrada". The mutation error also persists when the dialog is reopened.

### F10 (minor): category counts ignore the query

- **Where:** `glossary-page.tsx:133-145, 338-348`.
- **Reproduction:** while searching, tabs still show totals ("Estados 15", "Conjuros 339").
  When a tab has no matches, the user cannot see which category has them, even though the
  hint suggests "otra categoría".

### Out of scope (existing UI, not introduced by RYT-008)

- **Condition chip contrast.** axe flagged the checked condition chip label on the sheet:
  white on `#eda145`, 2.14:1 at 14px, es dark. It appears whenever a condition is active,
  including behind the reference sheet. This styling is not part of this commit, so I record
  it as an observation for its owning ticket.

## What passed

- **Search coverage:**
  - "grappled" finds Agarrado in the Spanish UI, and English names are shown as glosses.
  - The alias "agotamiento" finds Cansancio.
  - "fireball" finds Bola de fuego.
  - The no-results text plus hint are clear (`*-empty-clean.png`).
- **Content:** the Grappled quick facts (Causa, Movimiento, Ataques, Escapar, Fin) and the
  2014 accordion render in every theme and language at 150%, with no horizontal overflow.
- **Accessibility:** axe found no violations on the index, search results, entries, the
  reference sheet, the filters drawer, the homebrew editor, the saved entry or the stacked
  item card plus definition. This covers dark and light, the default, druid, bard, warlock
  and paladin themes, and es and en.
- **Inline terms:**
  - The focus ring is visible (3px `--app-focus`).
  - Enter opens and Escape closes, with focus returning to the term on the sheet and in
    entries.
  - Escape in the stacked item card closes the definition first and returns focus to the
    term in the card.
- **Homebrew:**
  - Unsafe input renders as literal text, with no injected elements and no alerts.
  - Rules terms inside homebrew text still link.
  - The DM ⋯ menu and the house-rule prefill ("Derribado (Estado)") work.
  - Escape closes the editor and focus returns to "Nueva entrada".
- **Translations:** no Spanish strings leak into the English glossary UI, and the en/es keys
  match.
- **Player with the module off:** a clear note; definitions still open from terms, with no
  "Open in the glossary" link.
- **Reduced motion:** covered by the global `prefers-reduced-motion` rule
  (`src/app/styles.css:648`), which applies to the Drawer transitions.
- **Visual direction matches the brief:**
  - The serif dictionary feel, underlined category tabs and ruled stat block avoid grids and
    pills.
  - The light theme and the class themes hold up.
  - Exception: the small bordered "Homebrew" and "Regla 2014" edition tags are pill-like but
    restrained.

## Untested states and limitations

- No real phone or tablet hardware, no real touch gestures and no screen reader. Typing was
  tested with Playwright keyboard events, not with Android or iOS soft keyboards and
  autocorrect.
- No real Supabase backend. Homebrew and the identity flows used the mocked fixture. I did
  not test a Player editing homebrew in the browser beyond the repo e2e. I did not run the
  stale-revision and duplicate-name error states in the UI.
- Shop description terms (`listing-card.tsx`, `storefront.tsx`) were reviewed in code only.
- Load-error and retry states and the bodies-loading skeleton were reviewed in code only.
- I did not run the landscape tablet split layout (≥62em) at 820px wide, because 820px is
  below the breakpoint.
- The demo glossary screenshots come from the Vite dev server, which is slower than
  production. F1 is confirmed on the production build.
- I did not run `npm run check` or the full e2e suite (out of scope for this review).

## Screenshots produced

These are in the session scratchpad and are not committed:
`/tmp/claude-0/-home-user-rytta-dnd-app/63bbd363-2400-5756-80a5-86a53f7c2ad4/scratchpad/ui-review/shots/`

- **F1:** `mobile-demo-search-grap.png` (the input is empty after typing "grap").
- **F2:** `mobile-demo-sheet-*-150.png` and `mobile-item-card-reference.png`.
- **States:** `mobile-empty-clean.png`, `mobile-demo-thumb-M.png`, `mobile-demo-fireball.png`,
  `mobile-hb-validation.png`.
- **Glossary pages:** `{mobile,tablet}-demo-index.png`, `{mobile,tablet}-demo-fireball.png`,
  `{mobile,tablet}-demo-grappled-{en-light-druid,es-light-default,es-dark-warlock,en-dark-paladin}-150.png`,
  `{mobile,tablet}-demo-search-*-150.png`, `{mobile,tablet}-demo-filters.png`.
- **Sheet:** `{mobile,tablet}-sheet-terms.png`, `{mobile,tablet}-sheet-conditions.png`,
  `{mobile,tablet}-sheet-condition-reference.png`, `{mobile,tablet}-sheet-after-back.png`,
  `{mobile,tablet}-sheet-en-light-bard-150.png`, `{mobile,tablet}-sheet-en-light-bard-reference.png`.
- **Inventory and party:** `{mobile,tablet}-item-card.png`, `{mobile,tablet}-item-card-reference.png`,
  `{mobile,tablet}-attack-lines.png`, `{mobile,tablet}-party-conditions.png`,
  `{mobile,tablet}-party-condition-sheet.png`.
- **Homebrew and module states:** `{mobile,tablet}-hb-tab.png`, `{mobile,tablet}-hb-editor.png`,
  `{mobile,tablet}-hb-editor-bottom.png`, `{mobile,tablet}-hb-saved.png`,
  `{mobile,tablet}-hb-menu.png`, `{mobile,tablet}-hb-house-rule-editor.png`,
  `{mobile,tablet}-hb-empty.png`, `{mobile,tablet}-module-off.png`.

Re-review needed after the fixes: F1 (typing at 60–120 ms per key on the All tab, plus Enter),
F2 (sheet geometry at 390px, for short and long entries at 150%) and F3 (focus after going
back to the root entry).
