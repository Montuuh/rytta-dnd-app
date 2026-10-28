# RYT-019 focused UI/UX re-review (members confirm focus)

Date: 2026-10-28. Reviewer: ui-ux.

Verdict: **PASS**

Reviewed source digest: `f8e33e3db42563f4a4bb0aa04b1a87c26af58c514671d0212a742c4eefce07ef`
(verified with `node scripts/check-ui-review.mjs --fingerprint` before and after the run).

## Scope

Focused re-review after the members confirmation Modal focus fix made the prior
RYT-019 digest stale. Owned path: `src/features/campaigns/ui/members.tsx`.

Change under review: Modal uses `returnFocus={false}` plus
`onExitTransitionEnd={() => trigger.current?.focus()}` (same pattern as layout
settings), so Escape / cancel restores focus to the promoting trigger and Enter
can reopen the dialog.

No implementation source was modified by this reviewer. Evidence-only writes:
`review-focus.md`, `recheck-focus.mjs`, `focus-results.json`,
`focus-captures/`, and (on PASS) `docs/evidence/ui-review-current.json`.

## Independent verification

Isolated preview: identity-fixture build served at
`http://127.0.0.1:4177/` (`dist-review-focus`, ports 4173/4174 left alone).
Harness: `docs/evidence/RYT-019/reviewer/recheck-focus.mjs`.

Matrix (all passed, axe empty, no page errors):

| Viewport | Language | Theme | Escape → focus | Enter reopens | Cancel → focus | Touch ≥44px | Reduced motion | 150% text |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 390 | es | dark | yes | yes | yes | 212.75×44 | reduce | yes |
| 390 | en | light | yes | yes | yes | 173.64×44 | reduce | yes |
| 820 | es | light | yes | yes | yes | 212.75×44 | reduce | yes |
| 820 | en | dark | yes | yes | yes | 173.64×44 | reduce | yes |

Live DOM probe (390 / es / dark, 100% text) additionally confirmed:

- Dialog title: “Confirmar cambio de miembros”
- Body explains promoting Arin to DM
- Close control and footer Cancel both meet 44×44; Confirm meets 44 height
- After Escape: `document.activeElement` text “Nombrar DM”, dialog closed
- After footer Cancel: same restore; Enter reopens before cancel path

Code inspection matches the intended pattern at
`members.tsx` Modal (`returnFocus={false}`, `onExitTransitionEnd` → trigger ref).

## Evidence paths

- `docs/evidence/RYT-019/reviewer/focus-results.json`
- `docs/evidence/RYT-019/reviewer/recheck-focus.mjs`
- `docs/evidence/RYT-019/reviewer/focus-captures/promote-open-{390,820}-{es,en}-{dark,light}.png`
- `docs/evidence/RYT-019/reviewer/focus-captures/escape-restored-*.png`
- `docs/evidence/RYT-019/reviewer/focus-captures/cancel-restored-*.png`

## Findings

No unresolved blocking findings.

Observation (P3, non-blocking, pre-existing naming): Modal close
`aria-label` and footer Cancel both resolve to `action.cancel`
(“Cancelar” / “Cancel”), so two dialog controls share one accessible name.
Axe did not fail; focus restore still works. Distinct close naming (as in
preferences “Cerrar ajustes”) would be a future polish, outside this focus fix.

## Limits

- Chromium + SDK HTTP fixture (`rytta-test.supabase.co`), not a live Google /
  PostgREST session or two real identities.
- Safari / iOS and assistive-technology sessions not run.
- Image caption tooling in this agent environment failed to describe PNG
  pixels; judgment for this focus regression used live DOM/focus probes,
  axe, touch metrics, localized copy checks, and on-disk captures rather than
  pixel captioning.
- Approval applies only to digest
  `f8e33e3db42563f4a4bb0aa04b1a87c26af58c514671d0212a742c4eefce07ef`.
