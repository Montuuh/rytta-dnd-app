# RYT-179 validation

First of three deliveries: the DM home and the navigation between command centre panels
([ADR 056](../../decisions/056-dm-command-centre-home-and-navigation.md)). The audit before the
change is in [audit.md](audit.md); the panels' insides follow in RYT-180 and RYT-181.

## Measured before and after

The audit script was repeated on the final tree against the e2e fixture backend, Spanish, at
390x844, 820x1180 and 1280x800, in Hearth and Parchment. Raw numbers: `before/metrics.json` and
`after/metrics.json`.

| Measure on a 390px phone                           | Before              | After     |
| -------------------------------------------------- | ------------------- | --------- |
| Taps from another campaign screen to the bestiary  | 3 and a scroll      | 2         |
| From one panel to another                          | scroll, tap, scroll | 2 taps    |
| First control of Members, storeroom and bestiary   | from 525px of 844   | 183px     |
| First control of Content                           | from 525px          | 230px     |
| First control of Modules and Party level           | from 525px          | 287, 322px |
| Bestiary search field                              | about 700px         | 328px     |
| axe violations, WCAG 2.0 to 2.2 A and AA           | 0                   | 0         |
| Controls under 44px, horizontal overflow           | 0, none             | 0, none   |

Modules and Party level stay above the 200px aimed for: what remains is each panel's own header,
which is RYT-180. The heading outline of every screen is one h1 and the panel's h2; the main
navigation and, from 48em, the side navigation carry `aria-current="page"`.

## Acceptance

1. Options page answered by the owner on 25 November 2026 (recorded in the ticket).
2. Two taps to any panel and the first control in the first screen: table above;
   `tests/e2e/identity.spec.ts` asserts the offset of Invite player on a phone.
3. Home: the live encounter and the pending work, no empty block, first-session steps while
   incomplete; covered in `identity.spec.ts` with and without an encounter and pending work. The
   board is drawn once its queries have answered, so nothing moves after the first paint.
4. Groups in the home, the sheet and the side navigation; `?panel=` links, `?panel=prepare`
   (opens the home) and `/items` keep working; existing bestiary, storeroom, dice, level-up and
   characters specs updated from tab roles to links.
5. Current-page mark, one h2 per panel, links that load a panel only when chosen; choosing
   another panel scrolls to the top and moves focus to it.
6. Quick switcher: `tests/e2e/quick-switcher.spec.ts` (Ctrl+K, `/` outside fields, the header
   control, filtering without accents, Enter, Escape and focus return, absent for Players and in
   Player view, `do=new` and `do=loot` consumed once, axe and 44px with the dialog open).
7. Widths, themes, languages and keyboard: the specs above at 390px and 820px (and 1440px where
   the layout differs); captures in `after/`.

## Checks

- `npm run check`: passes (typecheck, lint, architecture and docs contracts, unit tests, build).
- `npm run test:e2e`: see Results below.
- Design critique of the rendered result: one accessibility finding (a panel chosen from the side
  navigation kept the old scroll position and focus) and five lesser ones, fixed before review:
  the home held until its queries answer, "invitations to accept" lands on the sent invitations,
  the sheet's header surface, the switcher's active tint, one icon and one English label.
- Independent UI review: see Results below.

## Results

- `npm run test:e2e`, full suite after the critique fixes: 1687 passed, 181 skipped, 1 failed
  (`preferences.spec.ts`, theme and language persist, on the demo phone project, while a review
  was driving another browser on the same machine); that spec then passed three times in a row in
  every project (177 passed). The full run before those fixes passed 1685 with no failure. After
  the last two style edits the switcher and identity specs were run again: 208 passed.
- Independent UI review, three rounds. First: PASS with no blocking finding and a recommendation,
  the switcher list was cut before the actions with nothing to show there were more rows. With
  that applied (a taller list that fades at its lower edge), the second round asked for changes:
  at 1280x800 the list was taller than the dialog had room for, so the dialog scrolled too, and
  a row reached with the keyboard stopped under the fade. Both were fixed in the list's size and
  scroll padding and measured at 390, 820 and 1280 wide; the third round is a PASS on the final
  source. Carried to RYT-180: keys typed in the first frame after Ctrl+K can be lost, the bare
  count next to Members in the side navigation, "Set party level" landing on the panel without
  focusing the stepper, a 6px overflow of the switcher at 390x667 with 150% text, and the Panels
  label scrolling out of view after Home.
- After the last style fix `tests/e2e/quick-switcher.spec.ts` passed again (45); the full suite
  was not repeated for that one stylesheet.

## Initial failures

- The first full e2e run after joining the two halves failed 25 tests: 9 were switcher tests that
  the integration changed (entry order, and `do=invite` now consumed by Members); 14 were trace
  files removed by a capture run started in parallel, which passed when repeated; 1 was the
  update notice focus test in the demo build, which passed in every later run.
- Two fixes from the critique failed their first test run and were corrected: focus on the sent
  invitations was taken back by the route focus, and skipping the field focus on touch screens
  broke Ctrl+K on tablets with a keyboard, so the field keeps focus on every device.

## Not verified

Real iOS Safari and Android, VoiceOver and TalkBack, the on-screen keyboard over the switcher
list on a phone, hosted data. Left open on purpose: no visible hint of Ctrl+K; `/` yields to any
search field in the main area, so on the storeroom only Ctrl+K opens the switcher; a failed party,
proposal or session query drops its row on the home without a message (members, invitations,
roster and encounters do show their error and retry). Found during the review and older than
this delivery: at 820px and 1280px the accessible name of the header brand link does not contain
its visible text "RYTTA".
