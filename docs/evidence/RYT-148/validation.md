# RYT-148 — Help when joining goes wrong

Date: 2026-11-22. Delivered with RYT-154 (block D). Design from the options page answered by the
owner on 2026-11-22: switch account inside the empty state (P1 A) and a Contact link in the legal
links (P2 A).

## What changed

- My campaigns with no campaign and no invitation (`src/features/campaigns/ui/hub.tsx`,
  `SignedInAccount`): "Signed in as" with the address, Copy email, Switch account (signs out and
  returns to the sign-in page) and, when the contact address is set, a "Trouble signing in? Write
  to us" mail link.
- The legal links on the sign-in page (`LegalLinks`, `src/pages/legal-page.tsx`) add Contact as a
  mail link when the contact address is set.

## Acceptance

| Criterion | Evidence | Result |
| --- | --- | --- |
| With the contact set, no page shows the pending wording; a build without it fails the release check | Production serves `mailto:rytta.dnd@gmail.com` on the static privacy page (checked 2026-11-21); a live build without `VITE_CONTACT_EMAIL` stops in `vite.config.ts` (since RYT-115) | Met |
| My campaigns with no campaign and no invitation names the signed-in address and switches account in one action | `tests/e2e/account-help.spec.ts`: address, Copy email and Switch account in the empty state; Enter on Switch account lands on the sign-in page | Met |
| The invitation instructions name the address the Player must use; the empty state repeats the hint | `activation.invite.instructions` includes the address (RYT-144); the empty state keeps "Ask your DM to invite you with this email" with the address | Met |
| Contact reachable in two actions from the sign-in page and an empty My campaigns | One action: Contact in the sign-in page's legal links and the mail link in the empty state, both shown only with the contact set. Browser tests cover the absent case (test builds publish no contact); the configured case is checked after release | Met in code; configured case pending a live check |
| 390 and 820 px, both themes, both languages, keyboard, axe; independent UI review | `account-help.spec.ts` matrix at 390 px (es/en × Hearth/Parchment) and 820 px, axe clean, touch targets, keyboard; UI review below | Met |

## UI review

Independent UI review: CHANGES_REQUIRED first (the art prompt sat between the creature token and
its name; an empty live region was display:none; a refused copy from the pencil menu offered no
manual copy; the footer's name; the weight of Switch account and the contact link; the button's
inset), all fixed; PASS on 2026-11-22 for the current source (report kept locally under
`docs/evidence/ui-review/ryt-148-154/`). Non-blocking notes: the refused-copy line repeats the
manual box's label, and the stat block at 1024×768 with that box open was not re-checked.

## Checks

- `npm run check`: passed.
- `npm run test:e2e`: 1465 passed, 150 skipped, 0 failed before the review fixes; after them the
  bestiary, combat, account-help, shops, legal and account specs at 390, 820 and desktop: 247
  passed.
