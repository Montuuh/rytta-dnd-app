# RYT-123 — Player journey fixes: arrival, account and shell

Delivered in `f34c726` (merged to main through PR 13 on 2026-11-18, live on rytta.pages.dev).

## Verification

- Unit: `account-api.test.ts`, `account-notice.test.ts`, `account-repository.test.ts`,
  `auth.test.ts`, `return-to.test.ts` (the deep link is restored after sign-in, J1-17),
  `settings.test.ts`, `document-title.test.ts`, `use-back-to-close.test.ts` and
  `app-version.test.ts`.
- Browser: `account.spec.ts` (deletion offline, export, Settings), `identity.spec.ts`
  (invitations, empty hub, refresh failure), `overlay-back.spec.ts`, `account.spec.ts`,
  `identity.spec.ts` and `preferences.spec.ts` (Back closes overlays and keeps the route; driven with
  `page.goBack()`) and `scaffold.spec.ts` (update notice).
- Close-out checks added on 2026-11-20 in `identity.spec.ts`: the landing keeps "Continuar con
  Google" above the fold at 844×390 and 667×375 without horizontal overflow (J1-27), and the hub
  uses two columns at 820 px and one at 390 px (J1-26). Both pass.

## Not covered

- Real Google OAuth and real devices; 320 px was spot-checked in the review, not automated.

## UI review

The independent UI review of the four journey tickets ran on 2026-11-18: the first pass returned CHANGES_REQUIRED (wizard ability increases left unasked, class-loss notice out of view, item facts at 150 % text and others); the focused re-review the same day passed at 390 and 820 px in both themes and languages. Its remaining notes were minor (campfire arc rarely used, long names in rest rows).
