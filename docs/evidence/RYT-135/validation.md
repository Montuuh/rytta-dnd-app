# RYT-135 and RYT-136 — Polish from the UI reviews, profile menu focus

Branch `review-polish`, delivered together with RYT-136 and the two missing RYT-131 proofs. No
backend change and no migration.

## Commits

| Commit | Change |
|--------|--------|
| `401c1bf` | Level up: real limit of a +2, roll hint tied to its input, options above the footer, distinct names in the party-level dialog |
| `9fb5b99` | Table screen and phone map: focus return, fit-based long names, fight load error, keyboard pan and shortcuts, focus ring, trailing numbers, plates clear of the token below, notice above the measure readout |
| `fee5824` | Dialogs and profile menu: Tab after Escape not swallowed, early Escape closes, focus not pulled back once the person moved on |
| `04b2f94` | Dice: hit-dice roll kept while the log is down, Close instead of a disabled Save, proficiency dot clear of names, no repeated roll, bounded roll card |
| `b08a954`, `20ca0f8`, `4d53d44` | Casting: spell named once, shared concentration in party plates, long rest says it ends concentration, cast waiting on a manual tap |
| `c17872f`, `59aae49`, `f79e75a`, `352e09c`, `ca3e7d7` | Review fixes |
| `92f6d0d`, `c8b3fe1` | Profile menu: Escape in the frame the menu opens closes it and returns focus; the test proves the menu opened and presses Escape once |
| `d8141c1` | Order screen: names never transition, so reduced motion no longer re-measures them every frame; failed-tap notice says whose tap it was |
| `e931a0c` | Tests: the concentration test waits for the marker's write |

## Local validation

| Check | Result |
|-------|--------|
| `npm run check` | 1015 unit and database tests, build clean |

## CI and release

- PR 21 "Table polish": checks and browser test shards 1 to 4 passed.
- Merged to `main` as `97108a8`; https://rytta.pages.dev serves build id `97108a8404d6-…`
  (checked 2026-11-18).

## Independent code review

Ten findings on the first pass; all ten fixed in the review-fix commits above.

## Independent UI review

- First pass: CHANGES_REQUIRED. Every RYT-135 criterion met on the rendered result, RYT-136 and the
  RYT-131 proofs passed, but a blocker: after the first roll of a session the recent-rolls strip
  showed a bare heading with nothing under it. Fixed.
- Re-review 1: CHANGES_REQUIRED. New blocker: with reduced motion, the order screen re-measured long
  names in a loop that never settled (a near-zero font-size transition resized the box after each
  pass). Fixed in `d8141c1` (names never transition) with a spec that asserts the names are measured
  once and then left alone. The failed manual-tap notice was reworded to say whose tap failed.
- Re-review 2: PASS on source snapshot
  `ae070a65ae2ee6293a7ed966e7c0e47cbbb5c986bd553671a04ba8eea6834d77`, the source merged in PR 21.
- Rendered at 390px, 390px landscape, 820px, 1280px and 1920px, at 100% and 150% text, Hearth,
  Parchment and a class theme, English and Spanish, with a wide font and a forced minimum font size;
  axe clean on every rendered state.

## RYT-135 acceptance

All 27 criteria have evidence: 26 met by the change and its specs, and criterion 14 (left-handed
key placement) met by a documented decision in `docs/design-system.md`: the round keys stay on the
right edge with no setting, to revisit if left-handed Players ask for it.

## RYT-136 acceptance

- Escape returns focus to the trigger, also when pressed in the frame the menu opens.
- A choice that opens a panel returns focus to the trigger; focus is not pulled back once the person
  has moved to another control.
- Browser spec `RYT-136 the profile menu returns focus …` in `tests/e2e/identity.spec.ts` proves the
  menu opened and presses Escape once; covered by the UI review PASS above.

## Known minor leftovers (non-blocking)

- At 820px and 1280px with 150% text, a 13-letter word in the order list can still break inside the
  word.
- The level-up step labels show a sliver under the sticky header after the scroll (cosmetic).
- The profile-menu and early-Escape specs flaked once each under heavy parallel load; they pass in
  isolation and in CI.

## Not verified

- Real screen readers.
- WebKit and iOS.
- Real Linux fonts (a wide font was emulated).
- Owner smoke test on real devices and real sessions.

## Status

Done for RYT-135 and RYT-136: every acceptance criterion has evidence, both independent reviews are
recorded, merged and live.
