# RYT-181 validation

Third of three deliveries: the bestiary and the item storeroom for use during play
([ADR 058](../../decisions/058-bestiary-and-storeroom-at-the-table.md)). The audit before the
change is in [audit.md](audit.md).

## Measured before and after

The audit script was repeated on the tree after the first round of fixes, against the e2e fixture
backend (330 SRD creatures; a storeroom of 9 items, three characters and one pending proposal;
another of 129 items), Spanish, Hearth, at 390x844, 820x1180 and 1280x800, plus Parchment in
English at 390px. Raw numbers: `before/metrics.json` and `after/metrics.json`; captures in
`before/` and `after/`.

| Measure on a 390px phone                         | Before                     | After                     |
| ------------------------------------------------ | -------------------------- | ------------------------- |
| Creatures fully in the first screen              | 1                          | 7                         |
| Creature row height                              | 84 to 147px                | 57px                      |
| First creature row                               | 595px                      | 379px                     |
| Second attack of the goblin stat block ends at   | off screen (first: 1,300)  | 618px, above the bar      |
| Stat block bar                                   | 117px                      | 61px                      |
| Add a creature to the encounter in progress      | 4 taps                     | 2 taps, Undo in place     |
| "goblin" and Enter opens                         | Capitán hobgoblin          | Guerrero goblin           |
| Items fully in the first screen                  | 2                          | 6                         |
| First item row                                   | 546px                      | 392px                     |
| Give an item to one character                    | 7 taps                     | 4 taps                    |
| Two items to three characters                    | 11 taps and a scroll       | 8 taps, action in view    |
| Accept a proposal (one pending)                  | 4 taps and a closing one   | 2 taps                    |
| Reject a proposal                                | 4 taps and a closing one   | 3 taps                    |
| Badges and pill shapes on arrival, both screens  | 65 and 33                  | 0                         |
| Tab stops per creature row                       | 3                          | 1                         |
| Storeroom with 129 items, nodes in the main area | 2,789                      | 817                       |

Wide screens: at 820px 13 creatures fit (6 before) and at 1280px 6 (2 before); from 48em the stat
block is a pane beside the list (352px list and 569px pane at 1280; 224px and 309px at 820). The
storeroom rows at 1280px are 702px wide (935 before). Creating a quick creature or an item takes
one more tap than before, through the `···` menu, as chosen on the options page.

## Acceptance

1. Options page answered by the owner on 25 November 2026 (recorded in the ticket).
2. Steps and first screens: table above; asserted in `tests/e2e/bestiary.spec.ts`,
   `bestiary-official.spec.ts` (rows, stat block order, add in two taps, Undo, the dialog path, no
   encounter, the pane with arrows and Escape) and `campaign-items.spec.ts` (item sheet, give in
   four taps, loot with All and the pinned action, proposals).
3. Search ranking and Enter (unit tests of both helpers and the specs above), `/` and the sticky
   search and windowed list of the storeroom (`campaign-items.spec.ts`, `list-scroll.spec.ts`),
   no badges, discard guards for a quick creature and a new item.
4. The bestiary, storeroom, loot and list-scroll specs pass, updated where a control changed.
5. Carried from RYT-180: `level-up.spec.ts` (held Enter), `dice.spec.ts` (confirmation text),
   `quick-switcher.spec.ts` (placeholder at 390x667 and 150% text), `campaign-content.spec.ts`
   (focus after a stale-version error); the Parchment greys in the shared styles.
6. Widths, themes, languages, keyboard, axe and 44px: the specs above at the phone, tablet and
   desktop projects; captures in `after/`.

## Checks

- `npm run check`: passes on the final tree (typecheck, lint, architecture and docs contracts,
  1315 unit tests, build). The committed content of every changed file passes the formatter.
- `npm run test:e2e`: see Results.
- Measurement of the built screens found nine defects (the give step row tappable only on the
  name, the phone stat block scrolling away on add, the tablet pane's bar collapsing with an open
  encounter, focus lost after Undo, a 121px bar, three taps to accept a proposal, wide storeroom
  rows, a mid-word break, the laptop pane starting low): all fixed, two of them in part (below).
- Design critique of the rendered result: 28 of 40 on the heuristics, 15 of 20 on the technical
  audit. Three important findings (search placeholders at 2.07:1 in Parchment, applied creature
  filters stacking as pills and pushing the list down, the deliver action disabled without a
  reason) and thirteen lesser ones, applied before the review.
- Independent UI review: see Results.

## Results

- `npm run test:e2e`, full suite on the final tree: 1830 passed, 197 skipped, 1 failed, in
  10.6 minutes. The failure was a navigation error of the browser (`net::ERR_NO_BUFFER_SPACE`) in
  the loot deep-link test of `quick-switcher.spec.ts` on the tablet project, which then passed
  15 of 15 when repeated in every project. The run before the last four style and copy edits:
  1831 passed, 0 failed. Earlier full runs of this delivery: 1798 passed and 1 failed after joining the
  two halves (`preferences.spec.ts` on the demo tablet project, which passed 118 of 118 when
  repeated); 1792 passed and 20 failed after the first fixes, in a 19-minute run on a loaded
  machine. Those 20 were in `identity` (8), `offline-shell` (3), `legal` (2), `casting` (2),
  `character-sheet` (2), `account`, `preferences` and `session-journal`; each of those specs
  passed when run again on the same tree (217 and 345 passed; one further failure, the profile
  menu focus test, passed 9 of 9 alone).
- Independent UI review, first round: changes required. With 150% text the item sheet's buttons
  were cut to "Da" and "Edi" and the add button lost its end with no ellipsis; that button also
  clipped descenders at every size; "Discard" in the new item dialog measured 1.83:1 in Hearth
  and unchecked radios 1.31:1 in Parchment; the Party link in the no-characters sentence was
  marked by colour alone; the quick switcher placeholder was still cut at 390x667 with 150% text;
  focus dropped to the page after a failed give or delivery; the search field shrank to two or
  three characters at 150% text. All fixed, with a test each. The unchecked radio ring now uses
  the muted token in both themes across the app (Hearth measured 1.73:1 before).
- Second round: the thirteen fixes held; changes required for two new findings. Unchecked
  checkboxes still measured 1.73:1 in Hearth (the ring rule covered them in Parchment only), and
  with 150% text on a phone the link in the add status line was cut at the sheet edge. Both
  fixed (the muted ring now covers checkboxes in both themes; the actions of a status line wrap
  as whole controls), with three lesser ones: placeholders end in an ellipsis instead of half a
  letter, Give is the wider action again, and the accepted-proposal sentence reads the same way
  in English. The reviewer judged the tab order of the wrapped stat block bar acceptable.
- Third round: PASS on the final source. Measured there: an unchecked checkbox ring at 9.69:1 in
  Hearth and 6.70:1 in Parchment on four screens, the add status line whole at 390px with 150%
  text in both languages, placeholders ending in an ellipsis, no axe error. It left three low
  findings open (below).

## Open

- After adding, the status line makes the stat block's bottom area 131px on phones (61px before
  adding), and on a 1280x800 laptop the goblin's second attack ends 7px under the fold right after
  adding, until the pane scrolls.
- In the 820px pane the count is a number field without its minus and plus buttons, so that the
  add button stays readable.
- Creature search and item search rank the same way through two helpers; they are not unified.
- Wide layouts: Escape with focus in the search clears the query and leaves the pane open.
- At 820px with 150% text the `···` button of both heads wraps alone onto a second row.
- From the third review round: while a search field is focused and empty the browser draws no
  ellipsis, so a long placeholder is cut until the first key; English says "given to" after a
  give and "receives" after an accepted proposal; in Hearth a disabled unchecked checkbox has
  the same ring as an enabled one.
- The captures in `after/` were taken before the two rounds of review fixes; the states they
  changed (the item sheet and the stat block bar at 150% text, the discard dialog, radios and
  checkboxes, the status line when it wraps) were captured by the review, not kept here.

## Not verified

Real iOS Safari and Android, the on-screen keyboard over sheets, VoiceOver and TalkBack, hosted
data. Several creature packs, the comparison tray, the storeroom's grid view, shop, merge, import
and delete were not re-measured; the existing specs cover them.
