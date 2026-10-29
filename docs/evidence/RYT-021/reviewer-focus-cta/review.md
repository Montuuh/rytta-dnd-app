# RYT-021 focused UI/UX review — CTA removal, silent refetch, Player Party load

Date: 2026-10-29. Reviewer: ui-ux.

Verdict: PASS

Reviewed source digest:
`b6b66e7960ed8319303f2ce28684130441b299a115d3d32d3a120ecb5fcfd666`

## Scope

Focused re-review covering:

1. Party no longer exposes “Ir a Miembros e invitaciones” /
   “Go to Members & invitations” as a page-level control.
2. Members no longer exposes “Gestionar personajes en Grupo” /
   “Manage characters in Party” as a page-level control.
3. Contextual `characters.manageMembers` remains inside the Player
   assignment dialog only.
4. Background TanStack Query refetches no longer drive visible loading UI —
   no campaign-boundary “Actualizando…” / “Updating…” banner on `isFetching`;
   Party / Members / Hub Refresh buttons are not `loading={isFetching}`;
   removed `campaign.refreshing` i18n keys. Polling stays ~20s; updates remain
   silent while existing data is shown.
5. **NEW:** `CampaignBoundary` only cancels/removes DM-only leaves
   (`members`, `sent-invitations`, `assignments`) when role !== `dm`. Player
   characters queries stay alive. Party as Player must show the
   “Tu personaje” / “Your character” badge and must not stick on
   `common.loading` (“Abriendo tu compañero…” / “Opening your companion…”).
   Create character and Edit resources remain absent for Players.

Members remains reachable via main nav (`campaign.manage`). Create character
on Party and Invite player on Members stay as primary page actions for DM.
Implementation stayed read-only for this review.

## Independent verification

Isolated preview: `http://127.0.0.1:4185/rytta-dnd-app/`
(`dist-party-button-review`). Harness:
`docs/evidence/RYT-021/reviewer-focus-cta/review.mjs` via
`node --experimental-strip-types`. Digest matched at harness start and
end (`failure: null`). Results: `results.json`. Captures under
`captures/`.

Matrix (reduced motion): DM 390/820 × ES dark + EN light (CTA + silent
refetch + dialog), Player 390/820 × ES dark + EN light
(`identityFixture(..., { player: true })`), plus a no-Players dialog path at
390 ES dark.

| Check | Result |
| --- | --- |
| Removed Members CTA absent on Party (link/button + body text) | Pass, all four DM cells |
| Removed Party CTA absent on Members (link/button + main text) | Pass, all four DM cells |
| Create character / Crear personaje visible for DM | Pass; targets ≥44px |
| Invite player / Invitar jugador visible on Members | Pass (visual) |
| Link Player dialog opens; manageMembers link visible | Pass with Players |
| No-Players dialog still shows manageMembers | Pass (390 ES dark) |
| Party Refresh present; after ~3s with data, no Actualizando…/Updating… | Pass, all four DM cells |
| Refresh not aria-busy / data-loading across short sample window | Pass (6 samples × 4 DM cells) |
| Members Refresh present; refreshing copy absent; not busy | Pass, all four DM cells |
| Player Party: “Tu personaje” / “Your character” badge visible | Pass, all four Player cells |
| Player Party: not stuck on common.loading | Pass, all four Player cells |
| Player Party: Create / Edit resources absent | Pass, all four Player cells |
| axe wcag2a/aa/21aa | Clean |
| Horizontal overflow | None (document ≤ viewport) |
| Escape restores focus to Link Player opener | Pass (DM matrix) |

## Visual inspection

Inspected captures directly:

- `party-player-390-es-dark.png` / `party-player-390-en-light.png`: Player
  Party resolves with Arin card, “TU PERSONAJE” / “YOUR CHARACTER” badge,
  resources populated; no “Abriendo tu compañero…” / “Opening your companion…”;
  no Create/Edit; Refresh idle; no overflow.
- `party-player-820-es-dark.png` / `party-player-820-en-light.png`: Tablet
  Player Party matches; sidebar keeps Members nav; page body has no DM create
  action; badge and resources visible; silent Refresh.
- `party-390-es-dark.png` / `party-390-en-light.png`: DM Party has no Members
  page CTA; Create character remains; Refresh idle; no refreshing banner.
- `party-820-es-dark.png` / `party-820-en-light.png`: Tablet DM Party; sidebar
  Members path remains; page body free of removed CTA; silent Refresh.
- `members-390-*-*.png` / `members-820-*-*.png`: Members has no Party page CTA;
  Invite player remains; Refresh idle.
- `link-dialog-*-*.png`: Contextual manageMembers link inside assignment dialog.
- `link-dialog-no-players-390-es-dark.png`: Empty-Player explanation plus the
  same contextual link; primary Link action correctly disabled.

No unresolved blocking findings. Hierarchy, contrast (dark/light), ES/EN
copy, touch targets, Player vs DM Party states, dialog context and silent
background-refresh UX remain acceptable for this scoped change.

## Limits

Chromium + identity HTTP fixture only. Safari/iOS, physical touch and full
screen-reader remain untested. Preview state is in-memory. Nav reachability
to Members/Party was confirmed visually in tablet sidebar captures, not by
navigating every mobile drawer path in this harness. Background poll is
~20s; harness asserts absence of refreshing UI after ~3s with cached data
and samples Refresh loading attrs over ~1.5s — it does not wait for a full
poll tick. Manual Refresh click loading behavior is out of scope for this
silent-background change. Player matrix asserts resolved Party content after
boundary mount; it does not inject a synthetic cancel of the characters
query to prove the pre-fix failure mode.
