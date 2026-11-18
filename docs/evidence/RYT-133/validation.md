# RYT-133 — Dice: campaign setting, "what to roll" sheet, in-app rolls and roll visibility

Branch `sheet-dice`, head `290694c`. No backend change in this delivery. The database part
(`20261130120000_party_level_dice_settings.sql`: dice mode, roll visibility, `set_dice_settings`,
`log_roll`, the roll read policy and the roll signals) was reviewed and applied to production with
RYT-130 on 2026-11-18. Its SQL denial tests are in `tests/database/party-level-dice.test.ts`.

## Commits

| Commit | Change |
|--------|--------|
| `4a3dcec` | DM dice setting, "what to roll" on the sheet, in-app rolls, the recent-rolls strip, and initiative and hit dice following the campaign mode |
| `4af9486` | The server rolls in app mode; independent code review fixes |
| `ecc9d9f` | First UI review fixes |
| `1f264e4` | Second UI review fixes |
| `290694c` | Third UI review fixes |

## Decisions recorded during the delivery

### The server rolls in app mode

In "dice in the app" mode the server rolls: `log_roll` is called with source `app` and the client
sends no dice. The result card, the recent-rolls strip, initiative and hit dice show the server's
dice. The 3D animation is decoration that fades before the dice settle, because the bundled engine
cannot land on chosen faces. Every roll is labelled as rolled by the app or recorded by hand. A
failure offers a retry with the same request id and never invents a number.

Reason: the first build rolled in the browser and stored the result through the "recorded" path.
An app roll and a typed roll could not be told apart, and a Player could send chosen dice or keep
the best of several local rolls.

### One roll per fight and per rest

In app mode a Player rolls initiative once per fight and hit dice once per rest; only the DM can
change a saved initiative. This is a presentation guard. It is derived from the Player's own roll
log, matched by time to the fight's initiative phase or to the rest's creation. It is not enforced
by the server; server enforcement is ticketed in RYT-137.

## Local validation

| Check | Result |
|-------|--------|
| `npm run check` on `290694c` | 106 files, 906 tests, build OK |
| `npm run test:e2e` on `4a3dcec` | 1007 passed, 2 failed |
| `npm run test:e2e` on `4af9486` | 1011 passed |
| `npm run test:e2e` on `ecc9d9f` | 1017 passed |
| `npm run test:e2e` on `1f264e4` | 1021 passed |
| `npm run test:e2e` on `290694c` | 1041 passed, 117 skipped, 0 failed |

### Earlier browser failures on this branch

Recorded so the initial failures are not hidden. On `4a3dcec`, 2 tests failed on a changed
attack-line text. They were fixed in the following commit.

## Independent code review

On `4a3dcec`:

- No authorization or visibility problem found: what is read is decided by the server, the cache is
  keyed by user and campaign, and the roll signal carries no roll content.
- Changes required, high: roll integrity (the browser rolled and stored the result as a recorded
  roll; see the first decision above).
- Twelve smaller items:
  - silent failures of background logging;
  - initiative with an unknown bonus;
  - rolls wrongly attributed to the DM;
  - request ids derived from content;
  - typed totals not range-checked;
  - blocked storage;
  - a home-made focus loop;
  - the status region and accessible names;
  - visibility text taken from the cache;
  - versatile damage not rollable;
  - fixture drift;
  - slow propagation of a mode change.

All addressed in `4af9486`.

## Independent UI review

- CHANGES_REQUIRED on `4af9486`, five blocking:
  - formulas spilling out of the ability medals at 150% text;
  - the strip revealing the result before the card;
  - missing source label on initiative and hit dice;
  - field error contrast in Parchment;
  - setting copy promising things that do not happen.
- CHANGES_REQUIRED on `ecc9d9f`:
  - field error contrast in the dark theme;
  - a hit-dice roll lost on reopening a rest.
- CHANGES_REQUIRED on `1f264e4`:
  - a dead end when the roll log fails to load;
  - false text after the DM changes a Player's initiative;
  - failed-roll alert contrast in the dark theme.
- PASS on `290694c`.

The field error colour now follows the app's danger token in all 14 themes, with a unit test for
4.5:1 contrast on every surface. Automated accessibility checks are clean on every dice state in
both base themes.

Non-blocking leftovers, moved to RYT-135:

- if the roll log keeps failing and the rest is closed and reopened, the roll made on that screen
  is forgotten;
- a disabled "Save initiative" is shown where "Close" would be clearer;
- at 390px the proficiency dot sits close to "DES" and "CAR";
- the result card repeats the newest strip entry;
- the sticky result card is tall at 150% text.

## Merge and release

- PR 18 merged to `main` (merge commit `16254f8`); live at https://rytta.pages.dev with that build
  id.
- One CI failure on the way: a test computed its drag coordinates before the DM map's first fit.
  The trace showed 32px squares measured and the fit landing 80ms later. The test now waits for the
  settled layout. No product change.

## Known limits

- The one-roll guard depends on the roll log (the newest 50 rolls of the campaign) and on the
  fight's opening event being among the newest 60 events. Outside those windows the roll button is
  offered again.
- The DM console can overwrite a Player's initiative but cannot clear or re-roll it (RYT-137).
- The level-up hit-point roll is still typed.
- Spell attacks, death saves and the sheet's initiative stat are not rollable.
- The 3D dice do not land on the server's result (RYT-138).

## Not verified

- Realtime delivery of roll signals; the tests use the polling fallback.
- The animated path on a real GPU and on phones.
- A real screen reader.
- Hosted Supabase through the real API.
- WebKit and iOS for the new spec.
- Real phones and tablets.

## Status

Done. Merged to `main` (`16254f8`) and live; the database part was applied to production with
RYT-130, and both independent reviews are recorded above. Follow-ups are in RYT-135, RYT-137 and
RYT-138.
