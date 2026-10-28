# RYT-018 independent UI/UX review

Date: 2026-10-28. Reviewer: ui-ux.

Verdict: PASS

Reviewed source digest: `8df0ea17410043aed469712855bfb6cf9072501404a1413e4ca313fd53c47112`.

## Resolution

All three blocking findings from `review-initial.md` are resolved in this snapshot:

- Account and hamburger controls stay in the same row and correct left-to-right order at 390px/150%. Campaign identity and the Player-preview control may reflow outside that pair. Both remain usable touch targets.
- The account menu no longer renders the focusable presentational placeholder. Its axe audit is clean. Keyboard Enter focuses the first item, ArrowDown moves to Sign out, and Escape restores the account trigger.
- The account dropdown is constrained to the viewport. A valid 52-character email wraps fully without horizontal page overflow; its final dropdown width is 358px within a 390px viewport. The tested 32-character email also fits.

Initial findings and screenshots remain preserved separately. No unresolved blocking finding remains.

## Independent browser and visual checks

Executed `recheck.mjs` against the latest identity build at `http://127.0.0.1:4175/rytta-dnd-app/`, using the test-only SDK HTTP fixture. The matrix covers 390px ES/dark and EN/light, 820px ES/light and EN/dark, all at 150% root text with reduced motion. Its 32 captures cover party, right settings drawer, large centered settings modal, account menu, Player preview, membership, direct-link and unlink dialogs. Actual screenshot files were inspected with the image viewer, including the final mobile control pair, account menu, long-email wrapping and tablet membership layout.

`final/probe-results.json` records no document overflow, axe violations, visible interactive targets below 44px or browser page errors in the four combinations. In addition to automated geometry checks, the visual hierarchy remains readable in light/dark: campaign name in header, account/settings as global actions, character names and links in membership, resources isolated to the character page.

Verified right drawer contains Settings plus close control only; it closes before the preferences modal opens. Modal focus remains trapped for 12 Tabs and Escape returns to hamburger. Account Enter/arrow/Escape flow works as described above. Player preview hides DM creation/editing and restores controls on return without calling membership-role mutations. Linking an existing Player and unlinking changes the visible member-character relationship; resources are absent from the membership projection. Planned sidebar modules are visibly disabled and absent from actionable navigation links. Party no longer offers invite/link/unlink or the removed explanatory copy/context panel.

Additional state checks (`states.mjs`, `states-results.json`, before the final three focused shell fixes) exercised invalid-email and offline invitation feedback with retained inputs, Escape focus restoration, disabled mobile navigation, guest settings and empty-home settings. All were axe-clean. Captured requests confirmed membership metadata did not request `character_resources`. The final edits were limited to grouping the header controls and account-menu configuration/width; the linked-state flows were executed again in the final matrix.

`recheck-email.mjs` separately verifies 32/52-character account addresses at 390px/150%; screenshots and measured bounds are in `final/account-email-*`. Reviewer harness corrections: the first account-axe attempt used browser.newPage instead of a browser context; it was rerun correctly. The first alignment assertion compared button top edges despite different heights; it was corrected to compare vertical centers, then the full final matrix passed. Neither harness error required an application change.

The parent reports `npm run check` passing 43 tests, an earlier full 99-test browser pass after the first correction, and final focused 27/27 browser tests covering the account-menu fixes. Those broader suite results are implementation evidence, separate from the independent checks above.

## Non-blocking follow-up

P3: while character metadata is still loading, the member summary can briefly show
"No character" before the result arrives (`assignments.tsx`, fallback mapping). Prefer
withholding that summary until data is available. Loading is already announced, and
assignment actions are rendered only from loaded character rows, so this does not block
this delivery. It was noted from code inspection rather than a controlled slow-network run.

## Limits

These browser checks use HTTP fixtures, not two real Google identities or hosted Supabase Auth/JWT/PostgREST. SQL authorization, production migration and database concurrency are outside this UI review. Real Safari/iOS and an assistive-technology session were not exercised. No implementation code, backend permission or deployment was changed by the reviewer. This PASS applies only to the source digest recorded above.
