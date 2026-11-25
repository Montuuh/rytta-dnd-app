# RYT-180 validation

Second of three deliveries: the six administration panels inside the command centre
([ADR 057](../../decisions/057-dm-administration-panels.md)). The audit before the change is in
[audit.md](audit.md); the bestiary and the storeroom follow in RYT-181.

## Measured before and after

The audit script was repeated on the final tree against the e2e fixture backend, Spanish, Hearth,
at 390x844, 820x1180 and 1280x800, plus Parchment in English at 390px. Raw numbers:
`before/metrics.json` and `after/metrics.json`.

| Measure on a 390px phone              | Before                        | After                         |
| ------------------------------------- | ----------------------------- | ----------------------------- |
| Raise the party one level             | 3 taps                        | 1 tap, Undo in the panel      |
| Characters below the party level      | a count                       | named, with their level       |
| Change a dice setting                 | 3 taps, Apply at 865px of 844 | 3 taps, no scroll             |
| Link a character to a Player          | 4 taps (a select)             | 3 taps (a list)               |
| Make a member DM or remove a member   | 3 taps                        | 3 taps (confirmation kept)    |
| Pack version to review                | 282px, after the first pack   | 228px, first control          |
| Audit of one character                | read the whole list           | 2 taps (the character filter) |
| Member row height                     | about 155px                   | 64px                          |
| First control: Party level            | 393px                         | 245px                         |
| First control: Modules                | 287px                         | 226px                         |
| First control: Dice                   | 215px                         | 184px                         |
| First control: Audit                  | 245px                         | 183px                         |
| Page height: Members, Dice            | 1217px, 1165px                | 844px, 844px                  |
| Help text over 40 characters, Dice    | 510 characters                | 0 in the panel                |
| Badges in the six panels              | 7                             | 0                             |

With 64px rows and the list starting at 239px, eight members fit above the bottom navigation of
an 844px screen; the fixture has four. No horizontal overflow and no control under 44px in any of
the 18 panel states measured.

## Acceptance

1. Options page answered by the owner on 25 November 2026 (recorded in the ticket).
2. Primary action in the first phone screen, one title per panel on a phone, no badges: table
   above and `after/phone-*.png`. Refresh shows on Members and Audit only.
3. Steps: table above; `tests/e2e/identity.spec.ts` (member sheet, link in three taps, role
   change, invitations as rows, the only DM), `level-up.spec.ts` (raise, Undo, retry with the same
   request id, the stepper, level 20, `do=set`), `dice.spec.ts` (row, option, Confirm; arrow keys
   do not commit), `campaign-content.spec.ts` (To review first, one filled action, folded
   categories) and the audit filter and day groups in `identity.spec.ts`.
4. Carried from RYT-179: `tests/e2e/quick-switcher.spec.ts` (keys typed right after Ctrl+K, a key
   on the close button, 390x667 at 150% text with the group label in view, the navigation count
   units, the home's feedback when a party, proposal or session query fails) and `do=set` in
   `level-up.spec.ts`.
5. Widths, themes, languages, keyboard, axe and 44px: the specs above at the phone, tablet and
   desktop projects; captures in `after/`.

## Checks

- `npm run check`: passes on the final tree (typecheck, lint, architecture and docs contracts,
  1303 unit tests, build).
- `npm run test:e2e`: see Results.
- Design critique of the rendered result: 28 of 40 on the heuristics, 16 of 20 on the technical
  audit, two important findings (the audit filter marked its choice with a fill; the side
  navigation broke labels mid-word at 820px once the counts had a unit) and fifteen lesser ones,
  all applied before the review: off switches visible in Parchment, a key on the switcher's close
  button no longer typed into the query, status lines that keep their place, one name per panel in
  the navigation and its heading, centred dialogs, 44px hit widths for three controls, focus on
  the first row of a sheet.
- Independent UI review: see Results.

## Results

- `npm run test:e2e`, full suite on the final tree: 1758 passed, 185 skipped, 0 failed. Earlier
  full runs of this delivery: 1751 passed and 2 failed before the critique fixes (the update
  notice focus test and the signed-out landing link test), 1755 passed and 1 failed after them
  (`offline-shell.spec.ts`, a reload without signal, tablet project).
- Those failures were followed up, because single specs run alone kept failing in bursts: always
  the first tests to start, with the page still on its loading line after 10 seconds and the
  preview server answering assets in 4 to 6 seconds in the trace. The same specs were run
  alternately on the previous commit (fc5f556c) in a second checkout: the offline shell spec gave
  17, 16 and 17 of 17 there against 17, 8 and 8 here, the identity spec on desktop 1 failure
  there against 9 here, and then, in one series over the four commits, 11 failures on the
  previous commit and none on the final tree. The built bundles have the same assets and the same
  static imports from the entry and the router. The failures follow the load of the machine at
  the time, not the commit.
- Independent UI review, two rounds. First: changes required. A second tap on the raise action
  within half a second of a save raised the party two levels, because the same button then read
  the next level, and Undo went back only one; and "Show everything" in the audit left the focus
  on the page. Both fixed: the raise action rests for 1.2 seconds after a save (ignored and
  marked unavailable), and the character filter takes the focus. Lesser findings applied: a panel
  chosen at 150% text arrives at the top, and the reserved status line takes less room. The
  second round is a PASS on the final source: taps 150 to 1000 milliseconds after a save sent one
  request, a tap after 1.5 seconds raised again, the six panels were clean with axe and 44px at
  390px and 1280px in both themes. It left one low finding open (below).

## Initial failures

- Joining the two halves conflicted in one stylesheet (both removed rules the other kept); it was
  resolved by removing both sets.
- First runs of the new tests failed on test mistakes (a disabled-looking control read as
  disabled, a clipped heading counted as visible, a covered switch input) and on specs that
  expected the email in the phone row; all corrected without weakening an assertion.
- One critique fix reserved an empty line at the top of Content on phones (the first control went
  from 228px to about 276px); the live region is now visually hidden and the sentence drawn only
  when there is one.
- The test added for the double tap failed twice on its own mistakes (an unescaped pattern, then
  a wait that could outlast the rest under load); it now checks and presses in one step.

## Open

- From the second review round: holding Enter on the raise action raises one more level each
  time its rest ends (three levels in three seconds); Undo returns one step. Carried to RYT-181.
- From the review, not changed: the segmented control and the off switch keep Mantine's cool
  greys in Parchment (contrast passes); the dice confirmation repeats the option's line; the
  switcher's placeholder is cut at 390x667 with 150% text. Older than this delivery: after a
  stale-version error in the Content review dialog the focus is left on the page.
- Cold starts of the test server under machine load, described above, make single specs flaky on
  this machine; the full suite passed.

## Not verified

Real iOS Safari and Android, VoiceOver and TalkBack, hosted data. Error states of the level, the
dice and character linking are covered by tests, not by captures. The other class themes.
