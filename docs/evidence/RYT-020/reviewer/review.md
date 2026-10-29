# RYT-020 independent UI/UX review

Date: 2026-10-29. Reviewer: ui-ux.

Verdict: PASS

Reviewed source digest: `bf88a9898095d94d4fd6f812679180a70b03773a0481323d5a45b9617ed914e0`.

## Resolution and scope

Focused re-review after Prettier-only formatting of `src/app/layout.tsx` and
`src/features/campaigns/ui/members.tsx` (whitespace/line breaks; no behavior change).
Member cards, membership-only invite, unassigned characters, Player POV, Escape/focus,
touch targets, axe, overflow, ES/EN, dark/light, reduced motion and 150% members text
remain as previously approved. No unresolved blocking finding. Approval applies only to
the digest above.

## Independent verification

Isolated preview: `http://127.0.0.1:4180/rytta-dnd-app/` from rebuilt `dist-ryt020-review`
with the SDK HTTP fixture. Harness: `review.mjs` via `node --experimental-strip-types`
(digest matched at harness start and end; `failure: null`). Matrix unchanged: 390/820 ×
ES/EN × dark/light, `reducedMotion: reduce`, 150% members text. Captures under `captures/`;
results in `results.json`. Spot-checked members, invite modal, linked card (tablet light)
and empty Player POV against the prior PASS — no visual or interaction regressions.

### Acceptance (unchanged)

- Member cards list linked characters with on-card Link/Unlink.
- Invite player is membership-only email modal (“Sin personaje asignado” / “No character
  assigned”).
- Unassigned characters section appears while unlinked and clears after link.
- Player view menu lists Players; POV hides Create character / Edit resources; REST filter
  uses `user_id=eq.<player>`; no membership mutations from preview.
- Escape restores focus on invite/link/unlink dialogs; controls ≥44px; axe clean; no
  horizontal overflow.

## Limits

Chromium + fixture only. Safari/iOS and full screen-reader remain untested. Preview state
is in-memory. No further `src/` edits in this review.
