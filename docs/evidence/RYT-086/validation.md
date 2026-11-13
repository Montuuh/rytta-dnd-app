# RYT-086 validation: the Player board fills the room below the page head

## Change

`src/features/tabletop/ui/tabletop.css`: the Player board no longer uses a fixed viewport offset
(`100dvh - 15rem - var(--bottom-nav-h)` on phones, `100dvh - 19.5rem` on tablets). While a Player
board is on the page, the workspace is a border-box column, `main` and `.tt-player` are flex columns
and the board takes the remaining height (`flex: 1 0 0`) with a `min(20rem, 40dvh)` floor. On phones
that page clears the bottom bar with 16px instead of 32px, so a one-line title keeps about the board
height RYT-085 had (ends at 748 instead of 752) and the page no longer scrolls (scroll height 844).

## Probe (fixture backend, Player, blank 20x12 scene)

Titles: short "Puente de Vado", two "La Cripta del Rey Hechicero", long (71 chars)
"La Cripta del Rey Hechicero bajo las Colinas de Ceniza y el Puente Roto". 150% text is a root
`font-size: 150%`. Both themes (`default`, `parchment`) and both languages gave identical numbers.

| Viewport | Text | Title | Before (board / zoom bottom) | After (board / zoom bottom) | Limit |
| --- | --- | --- | --- | --- | --- |
| 390x844 | 100% | short | 752 / 744 | 748 / 740 | bar 779 |
| 390x844 | 100% | two lines | 796 / 788 (under the bar) | 748 / 740 | bar 779 |
| 390x844 | 100% | long (4 lines) | 885 / 877 | 748 / 740 | bar 779 |
| 390x844 | 150% | short | 756 / 744 | 748 / 736 | bar 779 |
| 390x844 | 150% | two (3 lines) | 823 / 811 | 748 / 736 | bar 779 |
| 390x844 | 150% | long (7 lines) | 1022 / 1010 | 879 / 867, page scrolls | bar 779 |
| 820x1180 | 100% | short / two | 1151 / 1143 | 1158 / 1150 | viewport 1180 |
| 820x1180 | 100% | long (2 lines) | 1195 / 1187 (past the viewport) | 1158 / 1150 | viewport 1180 |
| 820x1180 | 150% | short / two | 1079 / 1067 | 1158 / 1146 | viewport 1180 |
| 820x1180 | 150% | long (3 lines) | 1211 / 1199 | 1158 / 1146 | viewport 1180 |

The one remaining overflow is outside the acceptance (a 71-character title at 150% on a phone
wraps to seven lines and leaves 190px): the board keeps its 337px floor and the page scrolls to
it, which is the intended fallback.

Screenshots: `board-mobile-default-en-150-two.png`, `board-tablet-parchment-en-100-long.png`.

## Checks

- `npm run check`: exit 0.
- `npx playwright test tests/e2e/tabletop.spec.ts`: 24 passed. The first run failed only the new test
  on desktop (1440px), where the 71-character title stays on one line; the wrap assertion is now
  limited to phones and tablets, and the fit assertion runs on all three sizes. With the old CSS
  the probe shows the long title past the limit on 390px (877 vs 779) and 820px (1187 vs 1180).
- UI review: see `ui-review.md`.
- Not covered: real devices, iOS Safari dynamic toolbars (`dvh`), hosted Supabase (fixture backend only).
