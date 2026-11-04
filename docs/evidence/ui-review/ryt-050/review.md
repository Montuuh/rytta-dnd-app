# RYT-050 independent ui-ux review

- Reviewer: `ui-ux` (role `.codex/agents/ui-ux.toml`), independent of the implementer
- Date: 2026-11-04
- Source snapshot: uncommitted working tree on `main` @ `8ff4107`; fingerprint from
  `node scripts/check-ui-review.mjs --fingerprint`:
  `4e9bd8cb7f98ef28d4e3c32a898df7b05d8a80f126d169f3d15ff5416713d92b`
- Scope: `src/features/combat/ui/bestiary.tsx`, `bestiary.css`, `src/shared/i18n/bestiary-{es,en}.ts`,
  `tests/e2e/bestiary.spec.ts`

## Verdict: CHANGES_REQUIRED

The index rules, CR chips, removable chips, `/` shortcut and pinned actions work at 390px, 820px
and 1440px, in both themes and languages, with axe clean. One blocking regression remains: the
new list column width squeezes or hides the stat block at laptop widths (992 to 1280px), most
severely with 150% text. That breaks acceptance criterion 6 ("no horizontal scroll at laptop sizes").

## Findings

### 1. BLOCKER: the split layout squeezes the stat block or pushes it off screen on laptops

- Path: `src/features/combat/ui/bestiary.css:151`
  (`grid-template-columns: minmax(19rem, 28rem) minmax(0, 1fr)`)
- Cause: the list track grows to its 28rem maximum before the `1fr` track gets any space, and
  `rem` scales with text size. The old track was `minmax(280px, 380px)`.
- Measured in a real browser (Chromium, Spanish dark, `.bst-split` computed columns, page
  `scrollWidth`/viewport):

  | Viewport / text | Columns (list / detail) | Page width, list | Page width, detail open |
  |---|---|---|---|
  | 992px, 100% | 448px / 189px | 977 / 992 | **1027 / 992** |
  | 1024px, 100% (en light, too) | 448px / 221px | 1009 / 1024 | **1027 / 1024** |
  | 1024px, 150% | 549px / **0px** | **1058 / 1024** | **1359 / 1024** |
  | 1100px, 150% | 625px / **0px** | **1134 / 1100** | **1435 / 1100** |
  | 1280px, 150% | 672px / 133px | 1265 / 1280 | **1482 / 1280** |

- Repro: at 1024x768, open the bestiary and select any creature. At 100% text the stat block is
  about 220px wide: labels break mid-word ("Percep/tion", "Comm/on", "Draco/nic"), "Add to an
  encounter" wraps, and the kebab menu sits outside the card and outside the viewport. At 150%
  text the detail column is 0px: the stat block and its action bar render past the right edge,
  so the page scrolls sideways. Because of this, the pinned action bar also never shows at
  1024px/150% (its top was 252px after scrolling).
- Impact: on a laptop the DM cannot read the stat block, which is the bestiary's main job. It
  fails RYT-050 acceptance 6 and WCAG 1.4.10 (reflow) and 1.4.4 (resize text).
- Suggested fix: cap the list so the detail always keeps a usable minimum. For example,
  `minmax(17.5rem, min(26rem, 42%)) minmax(min(24rem, 100%), 1fr)`. Or switch to the
  sheet layout when the split container is narrower than about 46rem (a container query or a
  measured `wide`), so large text falls back to the phone/tablet sheet. Add an e2e check of
  `scrollWidth` with the detail open at 1024px and 150%.

### 2. MAJOR: on a 390px phone at 150% text, the CR chip leaves about 95px for the name

- Path: `src/features/combat/ui/bestiary.css:283` (`.bst-cr { min-width: 4.25rem }`), plus the
  44px token and 44px star.
- Repro: 390x844, Spanish dark, 150% text. "Dragón blanco joven" wraps one word per line and
  "Young White Dragon" wraps too, so each row is about 250px tall and only about 1.5 rows fit
  per screen. Evidence: `390-es-dark-150-2-chips.png`. Before this change the row had a
  narrower SRD badge and the CR sat in the meta line.
- Impact: the list is much harder to scan at large text on phones, which is the primary device.
  No overflow or axe failure.
- Suggested fix: size the chip by content (`min-width: 3.25em` or `ch`-based). Below about 30em
  of available width, stack it under the star or return CR to the meta line.

### 3. MINOR: on a 390px phone at 150% text, the search field gets squeezed

- Path: `src/features/combat/ui/bestiary.css:25` (`.bst-toolbar-search` has no wrap)
- Repro: 390px, 150% text. The search input is about 140px wide and its placeholder is clipped
  to "Goblir". The Filters button takes the rest. At 100% text it is fine.
- Impact: the "large search first" hierarchy from ADR 028 is lost at large text.
- Suggested fix: `flex-wrap: wrap` with the search on `flex: 1 1 14rem`, so Filters drops below
  it when there is no room.

### 4. MINOR: removing a chip focuses the first chip, not the next one

- Path: `src/features/combat/ui/bestiary.tsx:558-566` (`querySelector('.bst-active-chip')`)
- Repro: with chips [Dragón, Grande, Orden], remove "Grande" from the keyboard. Focus lands on
  "Quitar el filtro Dragón" at every viewport tested. `docs/design-system.md` says "keeps focus
  on the next chip".
- Impact: small loss of position for keyboard and screen-reader users. Acceptance ("keeps focus
  in the summary") is technically met.
- Suggested fix: focus the chip at the removed index, or at the last index if the removed chip
  was last.

### 5. MINOR: the count in each group heading has no label

- Path: `src/features/combat/ui/bestiary.tsx:982`
- Repro: the accessibility snapshot shows `heading "A 23"` and `list "A 23"`, so screen readers
  announce "A 23".
- Suggested fix: add visually hidden "criaturas"/"creatures" text through a pluralised key, or
  label the list with the letter only.

### 6. NIT

- `tests/e2e/bestiary.spec.ts:188` writes this delivery's evidence under `RYT-046`, not `RYT-050`.
- With the Campaign source and no campaign creatures, the list shows the generic "Ninguna
  criatura coincide." with "Ver todas las criaturas". A "Nueva criatura" call to action would be
  clearer. This was not introduced here.
- "Quitar filtros" also resets the CR sort. That is acceptable because the sort is shown as a chip.

## Tested scenarios

Browser-tested (Playwright Chromium against a production build on port 4175 with the identity
and combat fixtures; harness files `tests/e2e/_shots/review050.shots.ts` and `review050b.shots.ts`):

- 390x844: English light 100%, Spanish dark 150%, Spanish light 100%. List, filter drawer,
  chips (all 44px), sheet, and Escape returning focus to the row. Axe clean, no horizontal scroll.
- 820x1180: English light 100%, Spanish dark 150%. List, chips, sheet, Escape. Axe clean, no
  horizontal scroll.
- 992x800 and 1024x768 at 100%; 1024, 1100 and 1280 at 150%: measured the split columns and
  overflow (finding 1).
- 1440x1000: English light 100%, Spanish dark 150%. Letter rules, sticky group heads inside the
  scrolled list, CR rules after sorting by CR, chips, pinned actions (top 0 after scrolling),
  axe clean.
- Keyboard (1440, Spanish dark): ArrowDown crosses from the last "A" row to the first "B" row;
  End goes to the last row (Zombi); `/` from a row focuses `#bestiary-search`; a query removes
  the rules (0 headings, 4 rows for "lobo"); `/` with the filters popover open does not move
  focus out of it; Escape closes the popover and returns focus to Filters; "Quitar filtros"
  removes the summary and focuses Filters.
- States: Favourites empty, Campaign empty, no-match ("zzzz").
- Accessible names: rows read "Acechador invisible · Invisible Stalker …"; the hidden separator works.

Screenshot inspection: the implementer's before/after captures (scratchpad `before/` and
`after/`). The `after/` set shows "23 criaturas" in the group pill, so it predates the current
source; I relied on my own captures.

## Untested states

- Reduced motion with live animation (all runs used `reducedMotion: 'reduce'`).
- Real touch gestures (clicks were mouse-emulated), and Safari/Firefox.
- Hosted Supabase data; fixture data only. Campaign creatures with images in the list.
- I did not re-run `npm run check` or `npm run test:e2e`.
- No baseline build at 1024px, so finding 1's "regression" is based on the CSS diff
  (380px cap to 28rem). The breakage in the current snapshot was measured directly.

## Evidence

Scratch directory (not committed):
`C:/Users/dmont/AppData/Local/Temp/claude/0f049fd8c6ab0dac/edcb4093-8367-4eb9-933f-f629280bcdef/scratchpad/review/`

- `1024-en-light-100-3-detail.png`, `1024-en-light-100-3b-detail-scrolled.png`: squeezed stat block
- `probe-1024-150-detail.png`, `1024-es-dark-150-3b-detail-scrolled.png`: detail off screen
- `390-es-dark-150-2-chips.png`: phone rows and squeezed search
- `1440-en-light-100-2-chips.png`, `820-es-dark-150-2-chips.png`, `390-en-light-100-2-chips.png`: chips
- `1024-en-light-100-1b-list-scrolled.png`: sticky letter rule
- `state-campaign.png`, `state-favorites-empty.png`, `state-nomatch.png`, `kb-query.png`
- Run logs: `run2.log`. The output of the first run was captured in the session task log.

Re-review needed after the fix: finding 1 at 992, 1024 and 1280 with 100% and 150% text, and
findings 2 and 3 at 390px/150%.

---

## Round 2 (focused re-review after fixes)

- Date: 2026-11-04
- Source snapshot fingerprint (`node scripts/check-ui-review.mjs --fingerprint`):
  `d3c3db3943252e51ff3c41eb2f671b3eb9850be1c679d6af94ac137460ad34ea`
- Changes reviewed: `useSplit` (ResizeObserver; split only when the panel is at least 52rem wide),
  grid `minmax(17rem, 2fr) minmax(30rem, 3fr)`, `.bst-list` inline-size container with a 20rem
  query, a wrapping search row, chip focus by index, labelled group counts, and the evidence
  path moved to RYT-050.

### Round 2 verdict: PASS

All Round 1 findings (1 to 6) are resolved. One pre-existing, non-blocking issue is recorded
below for a follow-up.

### Round 1 findings re-checked (browser-tested)

| # | Round 1 | Round 2 result |
|---|---|---|
| 1 BLOCKER | Stat block squeezed or off screen at 992 to 1280px | **Resolved.** No horizontal scroll anywhere. With the list or a creature open: at 992/100%, 992/150%, 1024/100%, 1024/150%, 1280/150% and 1440/150% the stat block opens in the full-screen sheet; Escape closes it and focus returns to the row. At 1280/100% the split is 370px + 555px and at 1440/100% it is 408px + 612px. The stat block reads cleanly and the action bar pins (top 0 after scrolling). Axe is clean in every case. |
| 2 MAJOR | Names wrapped word by word at 390/150% | **Resolved.** The CR chip moves under the name. Names wrap at most once ("Dragón blanco / joven") and alt names stay on one line. Rows are about 190 to 230px at 150% text, which is acceptable. |
| 3 MINOR | Search squeezed at 390/150% | **Resolved.** The search is 343px wide and Filters drops below it. |
| 4 MINOR | Focus went to the first chip | **Resolved.** With [Dragón, Grande, Orden], removing "Grande" focuses "Orden"; removing the last chip focuses the previous one; removing the final chip focuses Filters (es and en). |
| 5 MINOR | Group heading read "A 23" | **Resolved.** The heading and list read "A (23 en este grupo)" / "A (36 in this group)". |
| 6 NIT | Evidence path RYT-046 | **Resolved** (coordinator report; not re-run). |

### New observation (pre-existing, non-blocking, follow-up)

- **MINOR (pre-existing)**: at 390px, 150% text, English, the last source segment shows
  "Favouri…" clipped at the control's right edge. The label overflows its segment; in Spanish
  the labels hyphenate ("Favo-ritas"). The segment stays operable and its accessible name is
  complete. Path: `src/features/combat/ui/bestiary.css` source segment label rules (about lines
  50 to 64; unchanged here) and `.bst-source` on phones. The segmented control was already full
  width at this size before RYT-050, so this delivery did not cause it. Suggested follow-up: let
  the control wrap to two rows, or use shorter English labels ("Starred"), below about 24em.

### Round 2 tested scenarios

Browser-tested (Chromium, production build on port 4175, identity and combat fixtures, scratch
harness `tests/e2e/_shots/review050r2.shots.ts`, which was type-checked with `tsc -b` and then
deleted):
- 992x800: 100% English light, 150% Spanish dark
- 1024x768: 100% English light, 150% Spanish dark
- 1280x800: 100% Spanish dark, 150% English light
- 1440x1000: 100% Spanish dark, 150% English light
- In each: list and open creature (keyboard Enter on the first row), `scrollWidth` against the
  viewport, overflowing elements, axe (wcag2a/aa/21aa), sheet Escape and focus return, or pinned
  actions after scrolling.
- 390x844 at 150%, Spanish dark and English light: toolbar layout, search width, filter drawer,
  chips (all 44px), chip focus sequence, row height, group heading accessible names, axe.

Screenshots inspected: the 1280/100% split after scrolling, the 1024/150% sheet, the 1024/100%
list, and the 390/150% list and chips (es and en).

### Round 2 untested

- 820px tablet and the full keyboard sweep (arrows, `/`, popover Escape) were not repeated. The
  code paths are unchanged apart from layout; the coordinator reports a full e2e run of 454
  passed, which I did not re-run.
- Resizing across the 52rem threshold while a creature is open (the switch between pane and
  sheet) was not exercised.
- Reduced motion off, real touch, Safari/Firefox, hosted Supabase data.

### Round 2 evidence

`C:/Users/dmont/AppData/Local/Temp/claude/0f049fd8c6ab0dac/edcb4093-8367-4eb9-933f-f629280bcdef/scratchpad/review2/`
(`run.log`, `r2-<width>-<text>-<lang>-<theme>-{1-list,2-detail,3-scrolled,2-chips}.png`).
