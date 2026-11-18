# RYT-132 — Map on the phone: the board is the page

Branch `phone-map`, head `8b148ac`. No backend change: the Player map makes the same queries as
before. No migration.

## Commits

| Commit | Change |
|--------|--------|
| `24fcbca` | The Player's map becomes the page on a phone: a turn strip, floating round keys and labels that keep their size at every zoom |
| `d7663c5` | Focus return waits until a closing overlay is gone |
| `a171934` | First review fixes |
| `8b148ac` | Second review fixes |

## Local validation

| Check | Result |
|-------|--------|
| `npm run check` | 102 files, 842 tests, build OK |
| `npm run test:e2e` on `24fcbca` | 952 passed |
| `npm run test:e2e` on `a171934` | 965 passed |
| `npm run test:e2e` on `8b148ac` | 969 passed, 117 skipped, 0 failed |

### Earlier browser runs on this branch

Recorded so the initial failures are not hidden. All were fixed:

1. 12 failures in the new spec and 7 in existing map tests that assumed the old phone layout. The
   existing tests were adapted to the Measure key and the effects sheet. The long-title test is
   skipped on phones, where there is no page header, and still runs on tablet.
2. Measure tests that left the screen after the new opening view.
3. 3 tests that looked for the board by its old role.

## Independent code review

On `24fcbca`:

- No visibility leak found. The queries are unchanged; the Player board still filters hidden
  tokens, notes, events and secret doors; rooms are drawn only for the DM; the turn strip and the
  live region never name a hidden turn; the DM path is unchanged.
- Changes required:
  - removing the page chrome also hid the rest vote prompt and the player-preview banner;
  - labels at a constant size covered neighbouring tokens when zoomed out.
- Smaller items: Escape from the Measure key, a re-render every 5 seconds at every size, zoom lost
  when crossing the layout threshold, the centring maths at the minimum zoom, pull-to-refresh, and
  the update notice over the keys.

All addressed in `a171934`.

## Independent UI review

- CHANGES_REQUIRED on `24fcbca`:
  - blocking: a long name in the turn strip widened the map and pushed the keys off screen;
  - major: overlapping text in the own-turn state with large text, labels piling up, and the
    opening view only a small band in portrait.
- CHANGES_REQUIRED on `a171934`:
  - new blocking: with an own token there was no single-pointer or keyboard way to see the whole
    map.
- PASS on `8b148ac`:
  - the first key toggles between fitting the whole map and centring on the own token;
  - `+`, `-` and `0` zoom the board from the keyboard;
  - the notices are stacked;
  - without an own token the opening view frames the visible tokens;
  - one-line name plates are hidden below zoom 0.9.
- Non-blocking leftovers, moved to RYT-135:
  - in landscape while measuring, the update notice covers the distance chip and its clear button;
  - the keyboard shortcuts are not announced;
  - the map cannot be panned by keyboard outside measure (pre-existing, also at 820px);
  - the board's focus ring shows only on its top edge;
  - the ellipsis hides the trailing number of similar names ("Goblin arquero 14" and "15");
  - the keys are only on the right;
  - a label still covers about a quarter of the token right below it.

## Focus return fix

`d7663c5` fixes an intermittent failure seen on a slow runner: after the viewer closed, focus was
not returned. Covered by unit tests with fake timers; the affected browser test passed 32 of 32
repeats, including with a 10x CPU throttle; the leave-campaign dialog was checked rendered during
the independent UI review.

## Not verified

- Real phones: hardware Back, iOS safe areas and real pinch. Pinch was driven through the
  browser's touch emulation.
- The operating system's 150 % text setting (approximated).
- A real screen reader.
- Hosted realtime.
- Visibility against the hosted database: the fixtures filter server-side and the client asks for
  nothing new.
- WebKit for the new spec.

## Status

Review. Local checks and both independent reviews are recorded above; the merge to `main` is
pending. Follow-ups are in RYT-135.
