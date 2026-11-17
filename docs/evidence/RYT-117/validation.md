# Delivery RYT-117: long lists, lazy second language and update notice

Status: in progress (2026-11-17). Implemented; UI review not passed. Also records RYT-121
(account dialog), which was reviewed in the same rounds.

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
  - Both were since fixed under RYT-123 and have **not** been re-reviewed. A focused
    re-review of findings 20 and 22 is needed before this ticket can move to review.
- Known limitation, accepted by the reviewer as such (finding 19): in WebKit at 820px, after a
  long jump sequence in the bestiary (jump to D, 30 steps up, then 600 px steps down), one step
  moves 97 px back, next to "Serpiente venenosa gigante". The reader keeps their place.
  Suggested follow-up: check the `reconcile` correction in `windowed.tsx` for a stale height.

## RYT-121: account dialog

Covered by the same review. In rounds 1 to 4, at 390px and 820px in Hearth and Parchment, the
"keep my account" action comes before "delete for ever" both visually and in tab order, and
the post-deletion notice takes focus with no ring after a tap and a visible ring after keyboard
deletion; Escape returns focus to the opener. No finding was raised against RYT-121. It is in
review; its formal PASS comes with the RYT-117 re-review on the current source.

## Untested

- Real iOS Safari, Android Chrome, touch gestures and screen readers.
- A real `version.json` check against a deployed build (the notice was forced in review).
- axe was not rerun by the reviewer; the implementer reported `npm run test:e2e` results.
