# RYT-054 design flow (docs/ui-design-flow.md)

## 1. Brief (`ui-ux-pro-max`)

DM-only Operate surface used while preparing a fight: "prepare an encounter of the difficulty I want
for my party, see at a glance where it lands, fix the gap fast". Searches used: gauge, threshold and
target charts (bullet chart for one measure against defined thresholds, every zone labelled in text,
colour only supplementary), colour-only status, focus in modal dialogs and contextual live updates
(one atomic status message, no competing live regions). A search for comparison cards in dialogs
returned no match; that part follows the project's own patterns.

Direction:

- One measured instrument instead of a progress bar with chips: the three party budgets as notches,
  the spent XP as fill and needle, the band named in words with a glyph.
- The SRD troubleshooting advice reads as field-journal margin notes, not stacked alerts.
- Details behind one quiet disclosure: party and creature ledgers as ruled rows.
- One action on the card ("Suggest creatures"); "Ask for initiative" stays the console's primary.
- Avoided: a badge for the band, chips per party member, CR pills, per-row add buttons in the
  ledgers and more than one filled button.

## 2. Refinement (`frontend-design`)

Inside the existing tokens: the band in the heading face at `--fs-h2`, tabular numerals for every XP
figure, italic heading-face labels on the notches, a hatched `--danger` stretch past High, the fill
and needle easing in 240ms (none with reduced motion), and suggestion cards as muster rolls:
overlapping hexagon tokens, the composition as the heading and one action. Avoided template chrome:
eyebrow labels, all-caps labels and a stats grid of big numbers.

## 3. Implementation

`src/features/combat/ui/encounter-balance.tsx`, `encounter-suggest.tsx`, `builder-parts.ts`,
`builder.css`, the domain in `src/features/combat/domain/difficulty.ts` and the catalogs
`src/shared/i18n/builder-{en,es}.ts`. First captures led to two fixes before the analysis: the kind
tiles' CSS painted the tiles' check seal on every tile (a `> span` selector matched the seal), and on
phones the first idea was below the fold (kinds now sit in two columns, the rule note moved under the
ideas).

## 4. Impeccable critique and audit

Two isolated assessments ran in parallel on the code and the Playwright captures (390, 820 and
1440px; ES dark and EN light). Live overlay injection was not possible because the app runs only
against the SDK contract fixture; assessment B drove the fixture build in headless Chromium and ran
the detector over CDP instead.

- **A, design review:** 28/40 on the heuristics. Specific to the product (seal grammar, margin notes,
  art tokens); no pill, badge or generic-button overuse, with one mild case (three identical add
  buttons) and the type select as the only generic control.
- **B, detector and technical audit:** detector clean on the components; one `side-tab` finding on
  the first margin-note style (already fixed, see below). Scores: accessibility 3, performance 3,
  theming 3 (contrast passes in all 26 theme and scheme combinations), responsive 2, anti-patterns 3.

Fixed:

- **"A leader and its band" broke its promise** (two leaders, one follower, unrelated pairs): now
  exactly one leader and two or more lesser creatures of its type, and the type follows the draft's
  most common enemy type until the DM picks one. Each idea lists its creatures with their type glyph.
- **Suggestions contradicted the two-per-character rule** once the draft was crowded: nothing is
  suggested then, and the dialog says why.
- **The gauge read as a slider and collapsed far over budget:** a 3px pointer with a caret replaces
  the round thumb, band words sit inside their stretch with "up to N", the scale is fixed to the
  party and a fight beyond it pins the pointer with a chevron. The pointer moves by transform.
- **Numbers followed the browser's locale:** every figure now uses the interface language, with a
  no-break space before the unit.
- **Tiles clipped at 150% text on phones:** difficulty tiles are full-width rows on phones; an e2e
  case at 150% checks that no tile or idea overflows.
- **Phone card order and repetition:** one reading line replaces title, numbers and room line saying
  the same thing; the action follows the reading on phones; the SRD source moved into the
  disclosure; above High the action becomes a quiet line instead of a dialog of disabled tiles.
- **Iterating on ideas:** "Other ideas" sits beside the heading, announces the new set, says when
  none are left, and the dialog keeps its choices between openings; the candidate search is no longer
  rerun on every draw.
- **Focus and live regions:** add buttons stay focusable while saving, so a failure keeps focus; one
  persistent live region announces changes, never on first load; the add notice is plain text and
  leaves with the next change.
- **States and data:** a failed background refetch no longer replaces a working reading; characters
  without a sheet get a note; hidden typed-in creatures count as hidden; lair XP no longer leaks into
  suggestions; the region keeps one name; ledger ids use `useId`; the type select has a real "Any
  type" option (no 2.1:1 placeholder); "no CR" copy says its XP does not count.
- **The margin note's thick side rule** (detector `side-tab`) became a pen glyph and a hairline.

Left as is: the hatched lethal stretch (a documented functional zone flagged as a repeating stripe),
the shared Moderate tone `--warn` (also the focus gold), page-wide detector notes outside the builder
(Inter usage, the documented parchment light background, an Add-tab description's leading), the
systemic Mantine placeholder colour elsewhere in the app, per-idea count editing and an undo of a
suggested batch (the console log and roster already remove creatures).

## 5. Independent review

`ui-ux` returned CHANGES_REQUIRED in round 1 and PASS in round 2; see
[validation](validation.md#independent-review) and the
[review report](../ui-review/ryt-054/review.md).
