# RYT-019 independent UI/UX review

Date: 2026-10-28. Reviewer: ui-ux.

Verdict: PASS

Reviewed source digest: `621bb1876b44181b3a68041e524c3731e0f74be5712992cac6a8bcf43ae89064`.

## Resolution and scope

All four requested changes pass independent rendered review: campaign home omits the
duplicate account/logout block, invitations have a clearer panel and states, the hamburger
opens a short anchored Settings menu, and preferences show accessible moon/sun controls.
Logout remains in the header account menu. No unresolved blocking finding remains.

The initial independent PASS and its evidence remain in `review-initial.md`, covering the
previous source snapshot. Its only P3 follow-up is now resolved: the preferences close
button announces “Cerrar ajustes” / “Close settings” rather than referring to navigation.
The source changes after that initial review are limited to this Modal accessible name and
the corresponding two localized catalog entries.

## Independent verification

The initial `review.mjs` matrix exercised phone 390px and tablet 820px with ES/dark,
EN/light, ES/light and EN/dark combinations, 150% root text and reduced motion. Its 22
captures, `results.json` and `persistence.json` record no axe failures, document overflow or
browser page errors. Actual screenshots were visually inspected in both themes/languages.

Verified menu Enter/Escape, outside dismissal, one Settings item, viewport-contained
content-sized menu, transition into the centered preferences dialog, 12 trapped Tab steps,
modal Escape focus return and switching to the account menu. Icon radio labels have
localized names/checked state and 44px minimum dimensions. A separate keyboard check
confirmed ArrowRight theme selection and theme/language persistence after reload.

Invitation checks covered pending content, deferred loading without a false empty claim,
failed refresh hiding stale actions, Retry recovery, accept adding a real campaign link,
decline cancellation/focus restoration and confirmed decline revealing the empty state.
Account logout removed private views in the fixture. Stable loading geometry centers the
refresh spinner; the earlier parent empty capture's displaced spinner was a transition
frame rather than a persistent defect. Initial harness corrections and their retained
failure artifacts are documented in `review-initial.md`.

After the localized close-label fix, executed `recheck-close.mjs` against the newly rebuilt
preview at `http://127.0.0.1:4175/rytta-dnd-app/`. All four phone/tablet/language/theme
combinations passed at 150% and reduced motion. The correct localized button is exposed,
the obsolete navigation label is absent from the dialog, its target exceeds 44px, clicking
it closes the preferences dialog and restores the hamburger focus. Axe and browser errors
remain clean. `close-results.json` and four `close-captures/` images are the focused evidence;
phone/tablet final captures were visually inspected. The current source fingerprint was
verified before and after this focused run.

The parent separately reports broad gates of 55 unit/SQL tests and 111/111 browser tests,
then another passing 55-test check and focused 9/9 browser tests after the label correction.
Those are implementation evidence, distinct from the independent checks above.

## Limits

These Chromium checks use the SDK HTTP fixture, not a real Google/JWT/PostgREST session or
two live identities. Safari/iOS and an assistive-technology session remain untested. The
user's localhost session and hosted PRE data were not changed. Full-page modal screenshots
extend below the browser viewport; the overlay correctly covers the actual viewport.
No implementation, database permission, deployment, manifest or backlog change was made
by the reviewer. Approval applies only to the source digest recorded above.
