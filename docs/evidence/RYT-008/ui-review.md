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

---

# Round 2 (focused re-review)

- Date: 2026-11-03.
- Reviewed source: commit `0897a57` (on top of `c693b3c`), clean working tree.
  UI source fingerprint (`node scripts/check-ui-review.mjs --fingerprint`):
  `6231f9f0ef9e60534aa13b72d22f3dcdbb5c0523826184c7e900553dd0474926`.
- The coordinator first asked for `c693b3c`. I probed it, then re-ran every check below on a
  fresh production build of `0897a57`. All results here are from `0897a57`, except the
  `c693b3c` note in R2-2.

## Round 2 verdict: CHANGES_REQUIRED

F1, F2 and F3 are fixed. F4, F5, F6, F9 and F10 are fixed, and the checked condition chip
contrast is fixed. One major issue remains:

- **R2-1:** Escape inside a definition opened from the item card closes both layers.

Round 1 missed it. Its "What passed" section wrongly said that Escape in the stacked item card
closes the definition first. My own round 1 log already showed both drawers closed after one
Escape. That statement is withdrawn.

## How round 2 was tested (real browser)

Setup:

- Chromium `/opt/pw-browsers/chromium` with Playwright scripts in the session scratchpad.
- Production build of `0897a57` (supabase mode, mocked backend
  `tests/e2e/fixtures/identity.ts`) served on port 4175.
- Demo dev server restarted on the current tree, port 5299.
- 390×844 and 820×1180, both touch enabled. Reduced motion emulated in the sheet and
  homebrew flows.

### F1 typing (production build and dev server, All tab)

| Input | Result |
| --- | --- |
| "grappled" at 120, 60 and 30 ms per key | Intact every time |
| Eight select-all, Backspace and retype rounds at 60 ms per key ("grappled" / "agarrado") | All intact |
| Home, then insert "bola de " before "fuego" | `bola de fuego` |
| Clear button, then type | Intact |
| Escape, then type | Intact |
| "/" then "prone" then an immediate Enter | Opens `condition.prone` with focus on the headword |

- Back link: returns to `?q=prone` with focus on the Derribado row.
- Browser back: keeps the query.
- I saw one doubled value (`grappledgrappled`) once, on the `c693b3c` dev server only, and
  never again in about 40 repetitions on `0897a57`.

### F2 sheet geometry at 390px

The sheet is anchored to the bottom (bottom = 844) in every case:

| Content | Sheet height |
| --- | --- |
| Short (Armor Class, es dark) | 485px |
| Item card term "Cortante" | 283px |
| Item card term at 150% | 408px |
| Long entries, or 150% text | Capped at 726px (86dvh); the content scrolls inside |

- At 820px the sheet is a full-height side panel (440px wide; 660px at 150%).
- Checked in es dark/default, en light/druid at 150% and es light/warlock at 150%.
- axe: no violations in any of these.

### F3 nested terms

On open, focus starts on the close button. Every move forward or back focuses the headword
(`span.gl-sheet-headword`), including going back to the root entry. The next Tab goes to the
close button. Escape returns focus to the term on the character sheet. Checked at both
viewports and in all three variants above.

### Spot checks of the other fixes

- **F4:** after M → Maleficio → "Todas las entradas", focus is on the Maleficio row and it is
  in view (scroll about 9,000px).
- **F5:**
  - Tab from search goes to the tab list, then one thumb stop, then the rows.
  - ArrowRight on the thumbs moves to C; Enter focuses the C heading.
  - ArrowDown and ArrowUp move through the results. ArrowUp on the first row returns to
    search, and Escape from a row returns to search with the query kept.
- **F6:** Enter in search and a homebrew save both focus the H1 headword.
- **F8:**
  - Both thumbs are 28px and named "Nivel de conjuro mínimo" / "Nivel de conjuro máximo".
  - The 44px `::before` is present. `elementFromPoint` 20px from a thumb's centre did not
    return the thumb, but taps on the track still move the nearest thumb.
- **F9:** submitting an empty name shows "Ponle un nombre a la entrada." and focuses the
  field. The duplicate footer text is gone. The delete-specific message I checked in code only.
- **F10:** with "fuego", the tabs read Todo 19, Estados 0, Acciones 0, Reglas 3,
  Conjuros 16, Homebrew 0.
- **Checked condition chip:** axe (wcag2aa) on `.condition-chip` found no violations in
  dark/default, light/default, dark/warlock, light/druid, dark/barbarian and light/paladin.
  The text now uses `--app-on-accent`, for example `#181009` on `#eda145` in the default
  dark theme.
- **F7:** unchanged, as stated. I accept the rationale: it is minor, and taps on the term
  text itself always resolve correctly.

## Round 2 findings

### R2-1 (major): Escape in a definition opened from another drawer closes both drawers

- **Where:**
  - `src/features/glossary/ui/reference-sheet.tsx:45-108` (the reference `Drawer`).
  - The item card drawer in `src/features/inventory/ui/item-card.tsx`.
- **Cause:** in Mantine 9.7.4 every open Modal or Drawer adds its own window-level Escape
  listener in the capture phase (`ModalBase/use-modal.mjs`). Independent drawers do not share
  `handledEscapeEvents`, so one Escape closes every open drawer.
- **When:** 390px and 820px. It is independent of theme and language. It was present in
  `b1c3af5` and still is in `0897a57`.
- **Reproduction:**
  1. Open Inventory, then Espada larga.
  2. Focus "cortante" and press Enter. The definition opens above the card; both are visible.
  3. Press Escape.

  Both drawers close, and focus lands on the inventory tile "Espada larga, cantidad 1, Común"
  instead of the term in the card. With the "Cerrar definición" button only the definition
  closes and focus returns to "cortante: ver definición", which is correct.
- **Likely also affected (code inspection):** the shop listing drawer
  (`src/features/shops/ui/listing-card.tsx`, which links its description) and any future
  drawer containing terms.
- **Impact:** keyboard users lose the item card they were reading. Focus does not return to
  the term, which fails the acceptance criterion "with keyboard, Escape and focus return".
  This is the same keyboard path F3 was about.
- **Suggested fix (one option):**
  - Expose "a reference sheet is open" from the glossary context.
  - Give the host drawers `closeOnEscape={!sheetOpen}`, or handle Escape once in the
    reference sheet and stop it from reaching the other drawers.
  - Add an e2e test: item card → term → Escape leaves the card open with focus on the term,
    and a second Escape closes the card.

### R2-2 (minor): the search field ignores outside changes to `?q=`

- **Where:** `glossary-page.tsx:97-116` (local query state and the URL mirror).
- **Reproduction:**
  - With "fire" typed, tap the active "Glosario" nav item: the URL briefly loses `q`, then the
    mirror puts `?q=fire` back, and the field and its 8 results stay.
  - In the same document, navigating to a URL with a different `?q=` loses it. On `c693b3c`,
    a hash navigation to `/glossary/condition.prone?q=pro` followed by the back link returned
    to an index with an empty search. I did not repeat this check on `0897a57`.
- **Impact:** tapping the module's nav item does not reset the search, and deep links with
  `q` into an open glossary page are ignored. Low impact at the table.
- **Suggested fix:** when the URL `q` changes from outside, set the field to it (for example
  when the location key changes and the value differs from the last mirrored one).

### R2-3 (minor, cosmetic): the sheet headword shows a full focus ring when it receives focus

- **Where:** `reference-sheet.tsx` (`span.gl-sheet-headword` with `tabIndex={-1}`) and
  `src/app/styles.css:92-99`.
- **Reproduction:** after moving to a nested term with the keyboard, the headword gets the
  3px `--app-focus` outline (`*-sheet-nested-*.png`). Page headwords use `h1/h2[tabindex='-1']`
  and are deliberately exempt. This is not an accessibility problem; it is only inconsistent
  with the page headwords.

## Untested states and limitations (round 2)

- No real devices, soft keyboards or screen reader. Typing used Playwright key events.
- The shop listing drawer was not opened in the browser. R2-1 there is inferred from code and
  the Mantine mechanism.
- The delete-error message was reviewed in code only.
- The repo e2e and `npm run check` were not run by me. The coordinator reports 18/18 glossary
  e2e on six projects.

## Round 2 screenshots

These are in the session scratchpad and are not committed:
`/tmp/claude-0/-home-user-rytta-dnd-app/63bbd363-2400-5756-80a5-86a53f7c2ad4/scratchpad/ui-review/shots3/`

- **Sheet:** `{mobile,tablet}-sheet-{speed,ac,nested,long,long-scrolled}-{es-dark-default,en-light-druid-150,es-light-warlock-150}.png`
- **Item card stack:** `{mobile,tablet}-stack-*.png`
- **R2-1:** `{mobile,tablet}-after-close-Escape.png` (both closed) and
  `{mobile,tablet}-after-close-close-button.png` (card kept)
- **Search, homebrew and filters:** `{mobile,tablet}-prod-enter-prone.png`,
  `{mobile,tablet}-back-to-row.png`, `{mobile,tablet}-tabs-counts-fuego.png`,
  `{mobile,tablet}-hb-validation.png`, `{mobile,tablet}-hb-saved.png`,
  `{mobile,tablet}-filters.png`
- **Chips:** `chip-{dark-default,light-default,dark-warlock,light-druid,dark-barbarian,light-paladin}.png`

Re-review needed after the fix: R2-1 (Escape order and focus return with the item card and the
shop listing drawer).

---

# Round 3 (focused re-review of R2-1, spot checks of R2-2 and R2-3)

- Date: 2026-11-03.
- Reviewed source: commit `8b78b6f`, extracted with `git archive 8b78b6f` into the session
  scratchpad and built there. UI fingerprint `75aab5b983137184ebfc390e616b3cf83a4c67394e4a520fc37be8ea80e95987`,
  taken from the working tree before it changed.
- Why the scratchpad: during this round the shared working tree went into an unrelated
  merge with `origin/main`. It contains conflict markers (for example in
  `src/app/modules.ts`), and a build from it fails. I did not touch that merge. Every result
  below comes from the exact commit.
- Servers:
  - Production build (supabase mode, mocked backend `tests/e2e/fixtures/identity.ts`, plus
    `tests/e2e/fixtures/shops.ts` for shops) on port 4176.
  - Demo dev server from the same extracted tree.
- Viewports: 390×844 and 820×1180, both touch enabled. Reduced motion emulated.

## Round 3 verdict: PASS

R2-1 is fixed for the item card, the shop listing drawer and pages without a host drawer.
R2-2 and R2-3 are fixed. No blocker or major finding remains.

## Real browser checks

### R2-1, Escape order (390px and 820px)

| Case | Escape | Result |
| --- | --- | --- |
| Inventario → Espada larga → Enter on "cortante" | 1st | Only the definition closes; the "Objeto" card stays open; focus on "cortante: ver definición" |
| | 2nd | The card closes; focus on the "Espada larga, cantidad 1, Común" tile |
| Nested from the card: "Versátil" → "dos manos" (focus on the "A dos manos" headword) | 1st | The whole sheet closes and the card stays; focus on "Versátil: ver definición" |
| | 2nd | The card closes |
| Shop listing drawer, direct load of `#/campaign/:id/shops` → "Poción de curación" → Enter on "PG" | 1st | Only the definition closes; focus on "PG: ver definición" |
| | 2nd | The listing closes; focus on the "Poción de curación" listing button |
| No host drawer: character sheet, Clase de armadura → nested "tirada de ataque" | 1st | Everything closes; focus returns to "Clase de Armadura: ver definición" |
| | Extra | Nothing happens; no navigation |
| Glossary page: a term in the Agarrado entry (`?q=agarr`) | 1st | The sheet closes; focus returns to "desventaja: ver definición"; the URL and query are kept |
| Close button instead of Escape (item card) | — | Only the definition closes; focus on "cortante" (unchanged) |

### R2-2, outside `?q=` changes

- With "fire" typed, tapping the "Glosario" nav item clears the field and shows "550
  entradas"; `q` is not written back.
- A hash navigation to `?q=prone` while the page is mounted puts "prone" in the field.
- Browser back to an entry without `q` empties the field.
- Slow device: with 6× CPU throttling (CDP), "grappled" typed at 120 ms per key is intact.
  "prone" plus an immediate Enter opens `condition.prone?q=prone` and stays there at
  +300 ms, +900 ms and +2 s, so the mirror no longer pulls the URL back to the index.

### R2-3

The sheet headword (`.gl-sheet-headword`) receives focus after a nested move with
`outline: none`, consistent with the page headwords (`mobile-nested-no-ring.png`).

## Still open (minor, not blocking)

- **F7:** inline hit areas overlap in dense prose. Accepted with the rationale in
  `validation.md`.
- **F8:** the slider thumbs are 28px and named, but `elementFromPoint` 20px from a thumb's
  centre does not return the thumb. Taps on the track still move the nearest thumb.
- **Content nit:** in the Spanish "Puntos de golpe" entry the opening quote before
  "Romper objetos" can break onto the previous line ("Consulta también “ / Romper objetos”").
  The text extraction places a space between the quote and the linked term. Cosmetic.

## Limitations (round 3)

- No real devices, soft keyboards or screen reader. Escape and typing used Playwright key
  events; CPU throttling was emulated through CDP.
- I did not run the repo e2e or `npm run check`. The coordinator reports 24/24 glossary e2e
  on six projects.
- This approval applies only to source `8b78b6f` with fingerprint
  `75aab5b983137184ebfc390e616b3cf83a4c67394e4a520fc37be8ea80e95987`. The merge now in
  progress in the shared working tree is not covered and needs its own check once resolved.

## Round 3 screenshots

These are in the session scratchpad and are not committed:
`/tmp/claude-0/-home-user-rytta-dnd-app/63bbd363-2400-5756-80a5-86a53f7c2ad4/scratchpad/ui-review/shots4/`

- `{mobile,tablet}-card-after-1st-escape.png`: card open, definition closed.
- `{mobile,tablet}-shop-stack.png`
- `{mobile,tablet}-nested-no-ring.png`
