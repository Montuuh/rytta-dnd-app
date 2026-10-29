# RYT-021 focused UI/UX review — CTA removal + silent background refetch

Date: 2026-10-29. Reviewer: ui-ux.

Verdict: PASS

Reviewed source digest:
`bb26f4ed3aa460f12178188e37ed69b9f04640bc132118ed4af72fc246713d5c`

## Scope

Focused re-review covering:

1. Party no longer exposes “Ir a Miembros e invitaciones” /
   “Go to Members & invitations” as a page-level control.
2. Members no longer exposes “Gestionar personajes en Grupo” /
   “Manage characters in Party” as a page-level control.
3. Contextual `characters.manageMembers` remains inside the Player
   assignment dialog only.
4. **NEW:** Background TanStack Query refetches no longer drive visible
   loading UI — no campaign-boundary “Actualizando…” / “Updating…”
   banner on `isFetching`; Party / Members / Hub Refresh buttons are not
   `loading={isFetching}`; removed `campaign.refreshing` i18n keys.
   Polling stays ~20s; updates remain silent while existing data is shown.

Members remains reachable via main nav (`campaign.manage`). Create
character on Party and Invite player on Members stay as primary page
actions. Implementation stayed read-only for this review.

## Independent verification

Isolated preview: `http://127.0.0.1:4184/rytta-dnd-app/`
(`dist-party-button-review`). Harness:
`docs/evidence/RYT-021/reviewer-focus-cta/review.mjs` via
`node --experimental-strip-types`. Digest matched at harness start and
end (`failure: null`). Results: `results.json`. Captures under
`captures/`.

Matrix (reduced motion): 390/820 × ES dark + EN light, plus a no-Players
dialog path at 390 ES dark.

| Check | Result |
| --- | --- |
| Removed Members CTA absent on Party (link/button + body text) | Pass, all four cells |
| Removed Party CTA absent on Members (link/button + main text) | Pass, all four cells |
| Create character / Crear personaje visible for DM | Pass; targets ≥44px |
| Invite player / Invitar jugador visible on Members | Pass (visual) |
| Link Player dialog opens; manageMembers link visible | Pass with Players |
| No-Players dialog still shows manageMembers | Pass (390 ES dark) |
| Party Refresh present; after ~3s with data, no Actualizando…/Updating… | Pass, all four cells |
| Refresh not aria-busy / data-loading across short sample window | Pass (6 samples × 4 cells) |
| Members Refresh present; refreshing copy absent; not busy | Pass, all four cells |
| axe wcag2a/aa/21aa | Clean |
| Horizontal overflow | None (document ≤ viewport) |
| Escape restores focus to Link Player opener | Pass |

## Visual inspection

Inspected captures directly:

- `party-390-es-dark.png` / `party-390-en-light.png`: Party content has no
  Members page CTA; Create character remains; “Actualizar” / “Refresh”
  idle (no spinner); no “Actualizando…” / “Updating…” banner; card
  actions intact; no overflow.
- `party-820-es-dark.png` / `party-820-en-light.png`: Sidebar still exposes
  “Miembros e invitaciones” / “Members and invitations”; page body has no
  duplicate removed CTA; Refresh idle; no refreshing banner above content.
- `members-390-es-dark.png` / `members-390-en-light.png`: Members has no
  “Gestionar personajes en Grupo” / “Manage characters in Party” page CTA;
  Invite player remains; Refresh idle; no refreshing banner.
- `members-820-es-dark.png` / `members-820-en-light.png`: Tablet Members
  matches; sidebar Party nav remains the cross-page path; Invite intact;
  silent Refresh.
- `link-dialog-*-*.png`: Contextual “Ir a Miembros e invitaciones” /
  “Go to Members & invitations” remains inside the assignment dialog.
- `link-dialog-no-players-390-es-dark.png`: Empty-Player explanation plus the
  same contextual link; primary Link action correctly disabled.

No unresolved blocking findings. Hierarchy, contrast (dark/light), ES/EN
copy, touch targets, dialog context and silent background-refresh UX remain
acceptable for this scoped change.

## Limits

Chromium + identity HTTP fixture only. Safari/iOS, physical touch and full
screen-reader remain untested. Preview state is in-memory. Nav reachability
to Members/Party was confirmed visually in tablet sidebar captures, not by
navigating every mobile drawer path in this harness. Background poll is
~20s; harness asserts absence of refreshing UI after ~3s with cached data
and samples Refresh loading attrs over ~1.5s — it does not wait for a full
poll tick. Manual Refresh click loading behavior is out of scope for this
silent-background change.
