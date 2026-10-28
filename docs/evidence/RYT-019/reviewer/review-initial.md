# RYT-019 independent UI/UX review

Date: 2026-10-28. Reviewer: ui-ux.

Verdict: PASS

Reviewed source digest: `f279bcc8cc9c1c107dc5294f0c2809d2c513414bdda33a62170d50bfb6b53d1e`.

## Scope and conclusion

The duplicate home account/logout block is removed, while logout remains reachable from
the header account control. Campaign selection retains its hierarchy and the invitations
panel now groups its title, explanation, recipient, loading/error feedback and invitation
actions coherently. The empty state gives a concrete next step without suggesting an
unimplemented invitation-code workflow. Pending invitations retain character identity,
expiry, accept and confirmed-decline actions.

The hamburger opens a short menu next to its trigger with one Settings item. It does not
occupy the screen height or block the rest of the page with a drawer overlay. Preferences
remain in the centered dialog. The theme choices render recognizable moon/sun icons with
accessible localized names, selected radio state and adequate touch targets.

No unresolved blocking issue was found in the reviewed source snapshot.

## Independent browser verification

Executed `review.mjs` against the current production-subpath preview at
`http://127.0.0.1:4175/rytta-dnd-app/`, using the isolated SDK HTTP fixture. This browser
context did not access or modify the user's real localhost session or hosted PRE data.

The matrix covers 390px ES/dark and EN/light, and 820px ES/light and EN/dark, with 150%
root text and reduced motion. Each combination captured home at 100% and 150%, compact
menu, preferences and post-decline empty state. Two further phone captures cover deferred
loading and failed refresh. All 22 captures passed axe WCAG A/AA checks with no document
overflow. The four matrix contexts recorded no browser page errors. `results.json` keeps
the measurements and results. Captures were visually inspected, including both phone
themes, tablet themes, icon controls, menu anchoring, invitation typography and error state.

Verified independently:

- The removed home block and inline logout do not render; the top account menu retains
  logout, which closes private views when exercised through the fixture.
- Keyboard Enter focuses the single Settings item. Escape restores its trigger. Outside
  clicks dismiss the small menu. At 150% text its width scales to 330px and stays inside
  the viewport; height remains below 180px.
- Settings opens after the menu closes. Focus remains in the dialog across 12 Tabs and
  Escape returns to the hamburger. Switching from the settings menu to the account menu
  preserves usable focus and its own Escape return behavior.
- Theme labels each contain one icon, retain their localized radio names/checked state
  and measure at least 44px in both dimensions. Clicking the alternate theme changes the
  applied scheme. A separate phone check verified ArrowRight selection, the persisted
  theme value, changing language and persistence of both theme/language after reload;
  `persistence.json` records these results.
- Invitation decline can be cancelled with Escape and returns focus to its trigger.
  Confirmed decline sends one response and reveals the empty state. Accept adds the
  campaign and exposes its actual Open campaign link. Deferred loading does not claim
  an empty list. Failed refresh hides stale invitation actions; Retry restores them.
- The stable loading capture has its refresh spinner centered inside the button.
  The parent's earlier empty-state capture caught the spinner during exit transition;
  it is not persistent broken loading geometry. The stable empty captures are clean.

The parent's broader `npm run check` (55 tests), `npm run test:e2e` (111/111), fast and
format gates are implementation evidence reported by the parent, separate from these
independent browser checks.

## Non-blocking follow-up

P3, both languages/themes/viewports: the preferences dialog's close button retains the
inherited navigation-specific accessible name (`src/app/layout.tsx`, Modal
`closeButtonProps` using `t('nav.close')`). It announces “Cerrar navegación” / “Close
navigation” while closing Settings. Prefer a settings-specific or generic Close label.
The control is keyboard reachable, meets its touch size and closes the correct dialog;
this naming issue does not block the four requested changes.

## Harness corrections and limits

Initial review harness output is preserved in `results-harness-initial.json`: the harness
incorrectly expected the menu's 220px configured width not to scale at 150% text. It was
corrected to enforce the scaled width and viewport bound. A second initial harness result,
`results-harness-accept-race.json`, matched an existing invitation heading before acceptance
completed; the final run waits for the joined campaign's Open link. Neither harness
correction required an application change. Final `results.json` has no failure, and the
source fingerprint was unchanged before and after the review run.

These are Chromium fixture tests, not a real Google/JWT/PostgREST integration or an
assistive-technology session. Real Safari/iOS and live two-account invitations were not
exercised. Full-page modal captures extend below the browser viewport; the overlay covers
the actual viewport, so the undimmed synthetic capture area below it is not a page defect.
No implementation, database permission, deployment or review manifest was changed here.
