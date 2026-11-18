# Delivery RYT-117: long lists, lazy second language and update notice

Status: in progress (2026-11-18). Implemented, merged to `main` through PR 13 and live at
https://rytta.pages.dev; findings 20 and 22 passed the focused UI re-review. Open: the update
notice has not been checked against a real deployed build. Also records RYT-121 (account dialog),
which was reviewed in the same rounds and is done.

## Outcome

- The bestiary and glossary render through a windowed list (`src/shared/ui/windowed.tsx`)
  while search, filters, the letter strips, keyboard navigation and deep links keep working.
- Only the active language loads at start; the other loads on switch, with a retry on failure.
- A deployed build id lets an open tab show a dismissible update notice with a reload action.

## Measurements (implementer, not re-measured by the UI review)

| Measure | Before | After |
| --- | --- | --- |
| Bestiary DOM nodes, fully used list | 6046 | 1160 |
| Glossary DOM nodes, fully used list | 12977 | 1728 |
| Entry chunk before sign-in, gzip | 262 kB | 136 kB |

## UI review

Independent UI review, rounds 1 to 4, 2026-11-17 (record kept locally).

- Rounds 1 to 3: CHANGES_REQUIRED; their blocking findings were fixed and confirmed.
- Round 4 (fingerprint `2533f310…`): **CHANGES_REQUIRED**.
  - Finding 20, blocking: after a successful keyboard language Retry in Settings, focus drops
    to `<body>` instead of the checked language.
  - Finding 22, minor: one painted frame of the default body colour when the app mounts.
  - Both were fixed under RYT-123. The independent UI review of RYT-123 to RYT-126, which
    covered the RYT-117 leftovers, confirmed both resolved on the production build (finding 20:
    focus on the checked language in 80 of 80 runs; finding 22: theme background from the
    first frame, by computed style) and ended in PASS on the focused re-review of 2026-11-18.
- Known limitation, accepted by the reviewer as such (finding 19): in WebKit at 820px, after a
  long jump sequence in the bestiary (jump to D, 30 steps up, then 600 px steps down), one step
  moves 97 px back, next to "Serpiente venenosa gigante". The reader keeps their place.
  Suggested follow-up: check the `reconcile` correction in `windowed.tsx` for a stale height.

## RYT-121: account dialog

Covered by the same review. In rounds 1 to 4, at 390px and 820px in Hearth and Parchment, the
"keep my account" action comes before "delete for ever" both visually and in tab order, and
the post-deletion notice takes focus with no ring after a tap and a visible ring after keyboard
deletion; Escape returns focus to the opener. No finding was raised against RYT-121. The later UI review that included
RYT-121 in its scope ended in PASS on 2026-11-18, and the work was merged through PR 13; RYT-121
is done.

## Untested

- Real iOS Safari, Android Chrome, touch gestures and screen readers.
- A real `version.json` check against a deployed build (the notice was forced in review).
- axe was not rerun by the reviewer; the implementer reported `npm run test:e2e` results.
