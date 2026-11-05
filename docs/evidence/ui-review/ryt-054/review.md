# ui-ux review: RYT-054 encounter builder

- Ticket: RYT-054 "Encounter builder: party XP budget, difficulty gauge and suggestions" (ADR 031,
  design flow `docs/evidence/RYT-054/design-flow.md`)
- Reviewer: `ui-ux` (role `.codex/agents/ui-ux.toml`, applied by an independent agent)
- Date: 2026-11-05
- Current verdict: **PASS** for fingerprint
  `7776f1f397100baa62121ff741813b087c4ecd1d575aab24933691520676437a` (round 2, see
  "Re-review (round 2)" at the end)
- Reviewed source fingerprint: `95a44a56be8c1b32d3de90268c9ef2e7affafb1d54e5c1a2b272d25c8ae352eb`
  (checked with `node scripts/check-ui-review.mjs --fingerprint` before and after the review; it
  did not change)
- Base: `main` at 4b38809 plus the uncommitted RYT-054 working tree

## Verdict: CHANGES_REQUIRED

The instrument is well judged. It has a seal with the band glyph and word, one reading line, a
ruled gauge with three notches, margin notes and a quiet disclosure, with no pills or extra filled
buttons. The suggestion dialog uses the bestiary's own tiles. Most states, both themes, both
languages, axe, 44px targets, Escape and the usual focus return hold up in the browser. Four
concrete defects remain:

- focus is lost after an add that reaches the High budget;
- text overlaps at 150% text on phones and tablets (not caught by the existing 150% e2e check);
- the gauge pointer collides with the band words, even at default text size on phones;
- a false "No enemies yet" headline when the draft holds only typed-in enemies.

## Findings

### P2-1: focus is lost after an add that lands exactly on the High budget

- Paths: `src/features/combat/ui/encounter-balance.tsx:211` (`full = balance.xp >= balance.budget.high`)
  and `:246-263` (the "Suggest creatures" button unmounts and a text line replaces it);
  `:149-152` (`closeSuggest` focuses `suggestButton` in the next frame); `:306-309` (`onAdded`).
- Viewports/themes/languages: 390, 820 and 1440px; dark; Spanish. The cause is the same in every
  theme and language.
- Reproduction: empty draft "Cripta" with the fixture party (two level 5 characters, High 2200 XP).
  Open Sugerir criaturas, choose Alta, and add an idea worth exactly 2200 PX. "2 × Súcubo",
  "2 × Pudin negro", "2 × Hombre tigre" and other 2 × CR 4 builds come up on the first or second
  draw. Use Enter on its Añadir button.
- Observed: the dialog closes and focus lands on the opener for one frame. When the refetched draft
  arrives, `full` becomes true, the opener unmounts and `document.activeElement` is `BODY` at all
  three widths (`flows-all.json`, `high-exact-*`).
- Impact: High is a target the dialog offers, and the SRD method aims to spend the budget exactly,
  so this is an ordinary outcome. Keyboard and screen reader users are thrown to the top of the
  document right after the main action. This breaks the "a successful add closes it and … returns
  focus to Suggest creatures" rule (design system, ADR 031) and the ticket's focus-return criterion.
- Fix direction: when the opener is gone after an add, send focus to a stable target. For example,
  make the "already reaches the High budget" line or the card heading focusable (`tabIndex={-1}`),
  or keep the opener rendered as `aria-disabled` with the explanation. Add an e2e case that adds an
  exact-High idea and asserts focus.
- Evidence: `high-ideas-*.png`, `high-after-add-*.png`.

### P2-2: at 150% text, words overlap in the difficulty tiles and the party budget

- Paths: `src/features/combat/ui/builder.css:403-418` (phone target row
  `grid-template-columns: auto minmax(0, 1fr) auto`: the word track may shrink below its content
  while the XP track keeps its width) and `:349-370` (`.bld-budget` is `repeat(3, minmax(0, 1fr))`
  with no wrap for "Moderada" or for "1500 PX", which holds a no-break space).
- Viewports: 390px (tiles and budget) and 820px (budget), html font-size 150%, dark Spanish.
- Reproduction (tiles): draft with 3 × Ogro (1350 PX), 150% text, open Sugerir criaturas. The
  selected "Moderada" tile reads "Moderada" running into "Quedan 150 PX". Measured: word right edge
  at 194px, XP left edge at 182px (`zoom.json`, `targets-150-mobile`). The same overlap shows with
  an empty draft ("Quedan 1500 PX", the spec's own `suggest-150.png`) and with one Ogro ("Quedan
  1050 PX").
- Reproduction (budget): same draft, open Grupo y criaturas. "Moderada" (113px) overflows its 95px
  column into "Alta" ("ModeradaAlta"). At 820px all three columns overflow by 5–26px.
- Impact: the role and the ticket require usable 150% text. The design flow says the 150% tile
  clipping was fixed. The selected difficulty, which is the main choice in the dialog, becomes hard
  to read.
- Not caught by tests: `tests/e2e/encounter-builder.spec.ts:227-232` only compares a tile's
  `scrollWidth` with its `clientWidth`. A word that overflows its own grid track but stays inside
  the tile is not detected. A bounding-box overlap check between `.bld-target-word` and
  `.bld-target-xp` (and between budget columns) would catch it.
- Fix direction: give the word track `minmax(min-content, 1fr)` and let the XP drop under the word
  when the row is too narrow (for example `flex-wrap`, or the tablet stacked layout once the word
  does not fit). Let the budget wrap, for example `repeat(auto-fit, minmax(min-content, 1fr))` or a
  stacked list at large text.
- Evidence: `zoom-targets-150-mobile.png`, `large-dialog-mobile.png`, `large-dialog-ideas-mobile.png`,
  `zoom-budget-150-mobile.png`, `zoom-budget-150-tablet.png`, `large-card-mobile.png`.

### P2-3: the gauge pointer runs into the band words

- Paths: `src/features/combat/ui/builder.css:99-111` (gauge padding 26px on phones), `:160-179`
  (pointer from 9px above the track and its 6px caret, so the caret top is 12px from the gauge top
  on phones), `:191-208` (the Moderate word sits at the top of the gauge, 0–17.5px at 100% and
  0–26px at 150%; Low and High sit just under the track).
- Viewports: 390px at 100% text, whenever the spent XP is inside the Moderate stretch. Measured hits
  at 1100 and 1350 PX. At 820px with 100% text the hit is at 1350 PX. At 150% text there are hits
  at both widths, with "Baja" at 600 PX, "Moderada" at 1100/1350 PX and "Alta" at 2000 PX on phones.
  Dark Spanish was measured; the geometry does not depend on the theme or language length beyond
  the word widths.
- Reproduction: draft with 3 × Ogro (1350 PX) or 1 × Elefante (1100 PX) on a 390px phone.
- Observed: at 100% the caret sits on the lower part of "Moderada" (`zoom-gauge-mod1350-100-mobile.png`,
  `zoom-gauge-mod1100-100-mobile.png`, `zoom-gauge-mod1350-100-tablet.png`). At 150% the pointer
  line strikes through the word, between "d" and "a" (`zoom-gauge-mod1350-150-mobile.png`), and
  touches "Baja" and "Alta" (`zoom-gauge-low600-150-mobile.png`, `zoom-gauge-high2000-150-mobile.png`).
- Impact: "Moderate" is the dialog's default aim, so this is the most common reading of the main
  instrument. Its label is the one the pointer hits. The design system promises labels that "never
  collide".
- Fix direction: reserve a band between the top label row and the caret. For example, increase the
  top padding by the caret height at each breakpoint and font size (in `em`, so it follows text
  size), or shorten the pointer above the track. Re-check with the XP inside each stretch at 390 and
  820px, at 100% and 150%.

### P2-4: "No enemies yet" while the draft holds typed-in enemies

- Paths: `src/features/combat/domain/difficulty.ts:63` (band `none` whenever the counted XP is 0),
  `src/shared/i18n/builder-es.ts:7` / `builder-en.ts:5` (`builder.title.none`),
  `encounter-balance.tsx:166`.
- Viewports: 390, 820 and 1440px; dark; Spanish.
- Reproduction: add 8 × "Bandido" from Añadir combatientes as a custom creature with no bestiary
  origin. You can also add only allies.
- Observed: the h2 says "Aún no hay enemigos". Directly under it the note says "Más de dos criaturas
  por personaje (8 para 2)", and the ledger lists "8 × Bandido · Sin valor de desafío: sus PX no
  cuentan" (`unrated-dark-es-*.png`). The polite announcement uses the same false title.
- Impact: the headline of the instrument contradicts the notes and the roster. Typing creatures in
  by hand is an ordinary way to prepare a fight. The ticket asks that unrated creatures be "listed
  as not counted", not that the encounter be described as empty.
- Fix direction: give the 0-XP-with-enemies case its own title and reading ("Ningún enemigo con
  valor de desafío" / "No rated enemies yet", plus the budget line). Keep "No enemies yet" for a
  draft without enemies. Do the same for allies only.

### P3-5: the add notice is never announced

- Paths: `encounter-balance.tsx:155-180` and `:306-309`; `src/features/combat/api.ts:106-108`
  (`onSettled` awaits `invalidateQueries`, so `run()` resolves only after the refetched draft has
  rendered).
- Observed with a MutationObserver on the live region (390px, Spanish): one announcement,
  "Dificultad moderada: 1400 PX.". The new reading renders, and is announced, before `onAdded` sets
  the notice, so the `[noticeText, …]` join never includes "Añadido a Cripta: 2 × Minotauro de
  Bafomet.". The visible notice is correct, because `combatants.length` in the `onAdded` closure is
  the old length.
- Impact: screen reader users hear the new band but not what was added, unlike the design intent
  ("announces changes … the add notice is plain text"). The band announcement still tells them
  something changed, so this is minor.
- Fix direction: set the pending notice before awaiting `run`, or announce the notice in
  `onAdded` (for example `setAnnouncement(text + current reading)`).

### P3-6: copy

- `builder.suggest.noRoom` (`builder-es.ts:89-90`, `builder-en.ts:86-87`) says "Quita criaturas
  para bajarlo." / "Remove creatures to bring it down." even when the DM has just reached exactly
  High with a suggested idea (`high-after-add-*.png`). Reserve the removal advice for above High.
  At exactly High, say the budget is spent.
- `builder.suggest.groupMeta` (`builder-es.ts:79`, `builder-en.ts:76`) says "cada una" / "each"
  for the single leader too ("Elefante: VD 4, 1100 PX cada una" under "1 × Elefante"). The card
  ledger already pluralizes `each_one/each_other`; this line should too.
- Spanish uses "tipo" for two different things: the kind tile "Un solo tipo de criatura"
  (`builder-es.ts:72`) and the select "Tipo de criatura" (`:76`). That produces "Prueba otro tipo o
  un solo tipo de criatura." (`:87-88`). Something like "Una sola criatura" / "Varias iguales"
  would keep the select's meaning clear. The English uses kind and type, which do not collide.

### P3-7: documentation example (docs only)

- `docs/design-system.md:264` gives "1.100 de 1.500 PX". The UI renders the CLDR Spanish form
  without a separator for four-digit numbers ("1100 de 1500 PX"; "7200 de 13.200 PX";
  "18.000 PX … de 2200"). This is correct Spanish, but the doc example should match what ships.

## What works (verified in the browser)

- Card hierarchy: the band seal (scale, feather, swords, flame, filled skull) sits beside the band
  word as an h2 and one reading line in all five bands. Phone order is reading, gauge, party line,
  action, notes, disclosure. From 48em, "Suggest creatures" sits beside the reading and the card
  spans the console. "Ask for initiative" stays the console's primary action. There are no badges,
  chips or extra filled buttons.
- Over High: the pointer is pinned at the end with the chevron, the notches keep the party's scale,
  the only filled seal is used, the action is replaced by a quiet line, and the lethal reading is in
  words (dark and light, ES and EN, at 390, 820 and 1440).
- Ledgers: mixed levels add up (level 5 + sheetless level 1 = 550/825/1200). There are "Sin hoja
  todavía: cuenta como nivel 1" and the assumed note, the ally row ("Aliada: lucha con el grupo y
  no gasta presupuesto"), the unrated row, "1 oculta", a long custom name that wraps without
  overflow, CR 0 critters and a swarm. Lair XP shows (Aboleth 7200, plus the lair line). All five
  note kinds render as margin notes.
- States: loading ("Midiendo el encuentro…"), error (`role="alert"`, a 44px Reintentar, recovery
  after a retry), no assigned party (explanation and a 44px "Abrir el grupo" link). The card shows
  in the DM console while initiative is collected and is absent when active, in the table view and
  in the Player preview (as Bea).
- Keyboard: card Tab order is Acciones del encuentro → Sugerir criaturas → Grupo y criaturas. In the
  dialog, initial focus is on Close, with a visible ring. Tab cycles inside the dialog (targets,
  kinds, type, Otras ideas, each Añadir, Close). Arrow keys move the difficulty. Escape closes and
  returns focus to the opener. Escape with the type dropdown open closes only the dropdown. Enter on
  Añadir closes the dialog, focus returns to the opener (whenever it still exists, see P2-1), the
  notice shows and it leaves with the next change of the draft. The dialog remembers its choices.
- Suggestions: the type follows the draft (Humanoid with bandit captains, Gigante with ogres). The
  select has 15 options with glyphs and a real "Any type". "Otras ideas" announces "3 ideas
  nuevas." / "1 idea nueva.", stays focusable and `aria-disabled` once exhausted, and shows "No hay
  más ideas nuevas con estas opciones.". The crowded message appears for the leader option and for a
  crowded draft. No idea went over the chosen budget in the runs above.
- Axe (wcag2a/aa, wcag21aa): zero violations on the card in the empty, Low (EN light), over-High
  (ES dark and EN light), stress (ES dark and EN light), no-party and error states at 390, 820 and
  1440. Zero on the dialog in EN light at all three widths, at the top and the end. The delivery
  spec adds the ES dark dialog, the card after the party joins and the 150% phone dialog.
- Touch targets: no visible control under 44px in the card (empty, stress, no party, error) or in
  the EN light dialog at any width.
- No horizontal page overflow at 390, 820 and 1440, including 150% text
  (`scrollWidth ≤ innerWidth`).
- Reduced motion: fill and pointer are 240ms, chevron and collapse 160ms without it; about 0s with
  `prefers-reduced-motion: reduce`.
- Light and dark: tones, the hatched stretch, the fill, the chevron on the danger fill and the muted
  meta text read well. The disabled "Already reached" tile is faded, which is exempt from contrast
  rules, and it says so in words.
- Languages: the catalogs are typed (`satisfies Record<keyof typeof builderEn, string>`), and no
  untranslated or mixed-language interface text was seen. Numbers follow the interface language
  with a no-break space before the unit.

## Scenarios tested

Browser (Chromium, Playwright, SDK contract fixture, identity build `dist-identity` built by the
spec run):

1. Requested run: `RYT_CAPTURE=1 npx playwright test tests/e2e/encounter-builder.spec.ts
   --project=identity-mobile --project=identity-tablet --project=identity-desktop --output=<scratch>/run1`.
   Result: 10 passed, 2 skipped by design (the 150% case runs at 390px only).
2. Throwaway Node scripts (Playwright library, the repo's `identityFixture` and `combatServer`)
   against `vite preview` of `dist-identity` on 127.0.0.1:4176. The server was stopped afterwards.
   Unless noted, each ran at 390×844 (touch), 820×1180 (touch) and 1440×1000 with reduced motion:
   - card states: empty; Low (EN light, details open); over High (ES dark and EN light); only
     typed-in enemies; a stress draft (sheetless character through a stubbed `get_party_overview`,
     4 rats, ogre, troll, ally wolf, hidden goblin, long custom name, swarm; ES dark and EN light);
     a level-15 party with an Aboleth and a lair; no assigned party; overview 500 then retry;
     overview delayed 4s; initiative status (DM console); active status; Player preview (tablet);
   - flows: keyboard-only card and dialog (Tab stops, initial focus, trap, arrows, Escape, Enter on
     Añadir, focus after the add, live region, notice cleared by an Add-tab change); a High target
     with an exact-fit add; the EN light dialog with a reached tile, type select (keyboard open,
     Escape in the dropdown, choosing Beast) and the leader option; exhausting "Otras ideas"
     (Celestial and Dragón; clicks forced because the button is `aria-disabled`); 150% text at 390
     and 820 (card with details, dialog, ideas); motion with and without reduced motion;
   - zoom (device scale 2): gauge geometry at 600, 1100, 1350, 2000 and 2400 XP at 100% and 150%,
     at 390 and 820; target tiles and party budget at 100% and 150%; MutationObserver on the live
     region during an add (390).

Screenshot inspection: the spec's `gauge`, `suggest`, `gauge-en-light`, `over-high` and
`suggest-150` captures, and every capture listed below.

Code inspection: `encounter-balance.tsx`, `encounter-suggest.tsx`, `builder-parts.ts`, `builder.css`,
`difficulty.ts`, `builder-{en,es}.ts`, the `dm-console.tsx` mount, the `creatures.ts` `dataError`
flag, `TileGroup` in `bestiary-widgets.tsx`, `useRunner` and `useCombatAction` (`api.ts`), the
e2e spec.

## Evidence

The role allows only this report in the repository, so screenshots and logs were not copied here.
They live in the review session's scratchpad,
`C:\Users\dmont\AppData\Local\Temp\claude\84e3d83304c88c7a\0c99e808-b9b4-4a01-b66f-295a20858619\scratchpad\uiux\`,
which is temporary:

- `run1/…/{gauge,suggest,gauge-en-light,over-high,suggest-150}.png` (spec captures)
- `shots/high-ideas-*.png`, `shots/high-after-add-*.png` (P2-1)
- `shots/zoom-targets-150-*.png`, `shots/large-dialog-*.png`, `shots/large-dialog-ideas-*.png`,
  `shots/zoom-budget-150-*.png`, `shots/large-card-*.png` (P2-2)
- `shots/zoom-gauge-{mod1100,mod1350}-100-*.png`, `shots/zoom-gauge-{low600,mod1100,mod1350,high2000}-150-*.png` (P2-3)
- `shots/unrated-dark-es-*.png` (P2-4)
- `shots/empty-dark-es-*.png`, `low-light-en-*.png`, `low-light-en-details-*.png`, `over-dark-es-*.png`,
  `over-light-en-*.png`, `stress-{dark-es,light-en}-*.png`, `lair-dark-es-*.png`, `noparty-dark-es-*.png`,
  `error-dark-es-*.png`, `loading-dark-es-*.png`, `initiative-*.png`, `player-preview-tablet.png`
- `shots/kbd-dialog-open-*.png`, `kbd-dialog-target-focus-*.png`, `kbd-idea-focus-*.png`,
  `kbd-after-add-*.png`, `dialog-light-en{,-select,-leader,-end}-*.png`, `exhaust-*.png`
- Measurements: `shots/states-all.json`, `flows-all.json`,
  `flows-keyboard_dialog-light_exhaust_large.json`, `flows-exhaust.json`, `zoom.json`

`shots/initiative-missing-*.png` shows the table view, which is the default for a live encounter.
It is not a defect: the card is in the "Consola del DM" mode (`initiative-*.png`).

## Limitations

- Chromium emulation only. iOS Safari, Firefox, real touch devices, VoiceOver, TalkBack and NVDA
  were not tested. Live-region behaviour was checked by reading the DOM, not with a screen reader.
- No hosted Supabase or PRE. The fixture stands in for `get_combat_state`, `get_party_overview` and
  `add_combatants`. The sheetless and level-15 parties came from a stubbed `get_party_overview`
  response, not from the fixture's own data.
- Large text was tested at 150% (root font-size) only. 200% and browser zoom were not tested.
- Only the Default (Hearth) class theme was rendered, in dark and light. The other 12 class themes
  were not rendered.
- Changes from another DM or from polling were only partly exercised (an Add-tab change in the same
  session).
- I did not run `npm run check` or the full e2e suite. Only the delivery spec and the scripts above
  ran.

## Re-review request

After fixing P2-1 to P2-4, and P3-5 and P3-6 if accepted, ask for a focused re-review. It should
cover:

- an exact-High add (focus);
- the target tiles, party budget and gauge at 390 and 820px with 100% and 150% text, with the
  spent XP in each stretch, in both themes;
- the typed-in-only and allies-only titles in both languages;
- the live region after an add.

An overlap assertion in the 150% e2e case would keep P2-2 from coming back.

This verdict applies only to fingerprint
`95a44a56be8c1b32d3de90268c9ef2e7affafb1d54e5c1a2b272d25c8ae352eb`.

---

## Re-review (round 2)

- Date: 2026-11-05
- Reviewed source fingerprint: `7776f1f397100baa62121ff741813b087c4ecd1d575aab24933691520676437a`
  (checked with `node scripts/check-ui-review.mjs --fingerprint` before and after this round; it
  did not change)
- Scope: the fixes for P2-1 to P3-7, the states and paths they touch, and a regression pass of the
  round 1 card states, keyboard flow and light English dialog.
- Source note: `git status` also lists `amount-dialog.tsx`, `combat-log.tsx`, `combat-page.tsx`,
  `combat-summary.tsx`, `death-saves.tsx`, `initiative-entry.tsx`, `parts.tsx`, `roster.tsx`,
  `square-image.ts` and `combat.test.ts` as modified. They have no content change against HEAD:
  `git diff` is empty, and the carriage-return counts in the working tree match HEAD. The reviewed
  changes are the builder files.

### Verdict: PASS

No blocking or P2 findings remain. The round 1 findings are resolved as follows.

| Finding | Status | Verification |
| --- | --- | --- |
| P2-1 focus lost after an exact-High add | Fixed | Browser, 390/820/1440, Spanish dark. From an empty draft, with Alta as the target, an exact 2200 PX idea (2 × Cría de dragón rojo, Couatl, Archelon, Hombre jabalí, Ettin, Lamia) was added once with Enter and once with a pointer click at each width. Focus lands on the h2 "Dificultad alta" every time, never `BODY`. The card shows "El presupuesto alto está completo: no caben más criaturas." and no Suggest button, and Tab from the heading goes to "Grupo y criaturas". Code: `encounter-balance.tsx:155-174` (`isConnected` fallback to `titleRef`, and the effect for a button that retires while focused) and `:270` (`tabIndex={-1}`). The heading draws no focus ring (computed `outline-style: none`). That is acceptable for a programmatic, non-interactive target. |
| P2-2 overlaps at 150% text | Fixed | Bounding boxes measured at 390/820/1440, 100% and 150%, with an empty draft and with 1350 PX. No target word overlaps its XP: at 150% on phones "Quedan 150 PX" / "Quedan 1500 PX" drop below the word inside the tile (`r2/zoom-targets-mod1350-150-mobile.png`). No budget label exceeds its column. At 150% the budget stacks one value per row, at 390 and 820. |
| P2-3 pointer over the band words | Fixed | The gauge was measured at 600, 1100, 1350, 2000 and 2400 PX at 390/820/1440 with 100% and 150% text: 30 positions, zero pointer or caret hits on any word or "up to" number. The caret top is now 24.4px against the word bottom at 17.5px (390, 100%), and 33.6 against 26.3 (390, 150%). The reserve grows with text size (`builder.css:101-113`). See `r2/zoom-gauge-mod1350-150-mobile.png`. |
| P2-4 "No enemies yet" with typed-in enemies | Fixed | 8 × typed "Bandido": "Enemigos sin valor de desafío" / "Enemies without a challenge rating" at all three widths in ES dark and EN light. Axe is clean (`r2/unrated-dark-es-*.png`). Allies only still reads "Aún no hay enemigos" / "No enemies yet", which is correct. |
| P3-5 add notice not announced | Fixed (see R2-1) | MutationObserver on the live region: every add now announces "Añadido a Cripta: 3 × Fanático sectario. Dificultad moderada: 1350 PX." (and the same at 820 and 1440). |
| P3-6 copy | Fixed | At exactly High the line reads "El presupuesto alto está completo: no caben más criaturas."; above High it keeps the removal advice. A single leader reads "Hombre jabalí: VD 4, 1100 PX" with no "cada una", while its band keeps "cada una". The kind tile reads "Todas iguales" / "All the same". Leader pairs share their type (wereboar + giant vulture are both monstrosities; incubus + sahuagin warrior, lamia + gnoll warrior and others are fiends). |
| P3-7 doc example | Fixed | `docs/design-system.md:264` now reads "1100 de 1500 PX; quedan 400", and notes that Spanish groups thousands from five digits. |

### New observations (non-blocking)

- **R2-1 (P3): the add is often announced twice.**
  - Path: `encounter-balance.tsx:200-214`.
  - In 8 of the 10 adds observed with a MutationObserver, the live region was written twice in a
    row: first "Dificultad moderada: 1350 PX.", then "Añadido a Cripta: … Dificultad moderada:
    1350 PX.". The refetch render announces the new reading, and the queued notice replaces it one
    render later. React batched the two writes into one in the other 2 adds (the keyboard adds at
    820 and 1440).
  - A polite queue such as NVDA's may then read the band twice.
  - Fix direction: skip the reading-only write while an add is in flight. For example, set a
    pending-notice ref before awaiting `run`, or delay the reading announcement by one tick when
    `toAnnounce` is expected.
- **R2-2 (P3): English copy.** `builder-en.ts:86-92` reads "Try another type or All the same." and
  "or try All the same.". Quote the option name ("All the same") as the Spanish does with
  «Todas iguales».
- **R2-3 (polish): party budget layout at 390px.** At 100% text the budget is now two columns plus
  one, with "Alta" on its own row, because three `6.5rem` columns do not fit 301px
  (`r2/zoom-budget-mod1350-100-mobile.png`). It is legible and nothing overlaps. A smaller minimum
  (about 5.5rem) would keep the three budgets on one row at default size and still stack at 150%.

### Regression (round 2 build)

- Requested run: `RYT_CAPTURE=1 npx playwright test tests/e2e/encounter-builder.spec.ts
  --project=identity-mobile --project=identity-tablet --project=identity-desktop --output=<scratch>/run2`.
  Result: 20 passed, 1 skipped by design (150% overlap at desktop). This includes the new overlap
  cases (100% and 150%), the exact-High focus case and the unrated title case.
- Card states (empty, Low EN light, over High ES dark and EN light, stress ES dark and EN light,
  lair, no party, error with retry), each at 390/820/1440:
  - axe (wcag2a/aa, wcag21aa): zero violations wherever it ran;
  - no visible control under 44px;
  - no horizontal overflow;
  - error recovery works.
- Keyboard at 390/820/1440:
  - the card Tab order is unchanged (Acciones del encuentro → Sugerir criaturas → Grupo y
    criaturas);
  - the dialog opens on Close, Tab stays inside it, and arrows move the difficulty;
  - Escape returns focus to the opener;
  - an add below High returns focus to the opener, shows the notice, and the notice leaves with the
    next change.
- EN light dialog at 390/820/1440: axe is clean at the top and the end, all targets are 44px, the
  type select opens with the keyboard (15 options), and Escape in the dropdown keeps the dialog open.
- Motion: 240/240/160/160ms without reduced motion; about 0s with it.
- Visual inspection: the spec's round 2 captures (`run2/…/{gauge,suggest,gauge-en-light,over-high,suggest-150}.png`,
  where `suggest-150` now comes from the 150% overlap case at 390 and 820) and the captures below.

### Evidence (round 2)

In the review session's temporary scratchpad,
`C:\Users\dmont\AppData\Local\Temp\claude\84e3d83304c88c7a\0c99e808-b9b4-4a01-b66f-295a20858619\scratchpad\uiux\`
(not copied into the repository, because only this report may be written):

- `run2/…` spec captures
- `shots-r2/r2-high-{keyboard,pointer}-{mobile,tablet,desktop}.png` (P2-1)
- `shots-r2/zoom-targets-{empty,mod1350}-{100,150}-*.png`, `shots-r2/zoom-budget-{empty,mod1350}-{100,150}-*.png` (P2-2, R2-3)
- `shots-r2/zoom-gauge-mod1350-{100,150}-*.png` (P2-3)
- `shots-r2/r2-unrated-{dark-es,light-en}-*.png` (P2-4)
- `shots-r2/r2-dialog-leader-*.png` (P3-6)
- Measurements: `shots-r2/r2-all.json`, `zoom.json`,
  `states-empty_low_over_over-light_stress_lair_noparty_error.json`,
  `flows-keyboard_dialog-light_motion.json`

### Limitations (round 2)

- The round 1 limitations still apply: Chromium emulation only, no real devices or screen readers
  (announcements were checked by reading the DOM), no hosted Supabase, 150% text but not 200%, and
  only the Default class theme.
- I did not run `npm run check` or the full e2e suite. The coordinator reports `npm run check`
  passing (269 unit tests) and the full `npm run test:e2e` with 482 passed, 55 skipped and 0 failed.
  Only the delivery spec and the scripts above were run by me.
- The focus fix was exercised with the save resolving quickly. The effect path for a refetch that
  lands well after the next frame (a slow network) was read in code and is covered by the
  implementer's repeated e2e, but I did not throttle the network for it.

This approval applies only to fingerprint
`7776f1f397100baa62121ff741813b087c4ecd1d575aab24933691520676437a`.
