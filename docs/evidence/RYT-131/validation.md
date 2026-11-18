# RYT-131 — One table screen for combat

Branch `table-screen`, head `e84f3c7`. No backend change: the screen reads the Table projection
only. No migration.

## Commits

| Commit | Change |
|--------|--------|
| `cd1842d` | One table screen for combat: a movable turn plate over the map, and the whole order in columns without a map |
| `e84f3c7` | Review fixes: plate styles kept off the scene cards, long names clamped on the order screen, the screen hardened for refused accounts, turned tables and shared displays |

## Local validation

| Check | Result |
|-------|--------|
| `npm run check` | 100 files, 823 tests, build OK |
| `npm run test:e2e` on `cd1842d` | 923 passed, 0 failed |
| `npm run test:e2e` on `e84f3c7` | 935 passed, 77 skipped, 0 failed |

### Earlier browser runs on this branch

Recorded so the initial failures are not hidden:

1. The new spec first failed 6 times: in full screen a scrollbar gutter left a strip beside the
   screen. Fixed before commit.
2. The first full run had 3 failures caused by a second `role="status"` region on the page. Fixed
   before commit `cd1842d`.

## Independent code review

On `cd1842d`:

- No data exposure found. Both queries use the Table projection with their own cache keys; hidden
  combatants, real names behind aliases and DM notes never reach the browser; the hidden turn is
  announced without a name.
- Changes required for cost: a Player whose DM had not opened the map kept calling the map
  endpoint, up to about 40 refused calls a minute.
- Smaller items: the DM launched the screen in the same tab on a shared screen, arrow keys on a
  turned table, misleading Player states, repeated announcements, wake lock release, and the
  reading order between 640px and 767px.

All addressed in `e84f3c7`:

- On refusal the map query does not retry and re-checks every two minutes.
- No realtime channel is opened until the map has been read; a browser test counts exactly one
  call in seven seconds.
- The DM opens the table screen in a new tab.

## Independent UI review

- CHANGES_REQUIRED on `cd1842d`, two blocking findings:
  - the plate's class names collided with the scene library cards, which stacked so that only one
    scene could be opened;
  - long names overlapped other rows on the order screen.
- PASS on `e84f3c7`:
  - three scene cards visible and separate at 820px and 390px, now covered by a browser test;
  - 14 combatants with a 54-character alias and a 43-character name at 820px, 1280px and 1920px,
    at 100 % and 150 % text, both themes and both languages: no overlap, at most two lines.
- Non-blocking leftovers, moved to RYT-135:
  - focus does not return to the Player's link after leaving the table screen;
  - names classed as long always use the smaller type, even when they would fit;
  - the load-error text says the table failed when the fight did.

## Acceptance coverage

- DM and Player, with and without a map, at 820px, 1280px and 1920px, plus 390px.
- 16 combatants without scrolling at 1280px and 1920px.
- Plate move and shrink persisting across reload, and with storage blocked.
- One announcement per turn change.
- Network responses and the DOM checked for hidden names.

## Not verified

- Closing a real new tab opened by the DM.
- Escape in real full screen (the browser takes the first Escape).
- The wake lock.
- A real television.
- Touch drag of the plate.
- Dragging the plate on a turned table.
- A real screen reader.
- Hosted realtime (the fixtures poll).
- WebKit for this spec.

## Status

Review. Local checks and both independent reviews are recorded above; the merge to `main` is
pending. Follow-ups are in RYT-135.
