# RYT-021 independent UI/UX review

Verdict: PASS

Reviewer: ui-ux. Date: 2026-10-29.

Reviewed source fingerprint:
`c7da5ca8b841f0dd92aa9f72499dd3ed65c57b58bf2becc03bb055210f835dc1`

## Scope and findings

Reviewed Party, the new Player assignment dialog, Members & invitations, the affected
English/Spanish catalogs, ADR 010 and the RYT-021 acceptance criteria. Implementation
files remained read-only. No blocking UI/UX findings were observed.

- Party now provides one coherent character workflow: create, inspect resources, link
  a Player, edit resources and confirm unlink from the character card. Assignment status
  and the Player's name are distinguishable from the character name.
- Members owns people, roles and invitations. Its redundant character list and assignment
  controls are absent. Both pages provide a specifically named navigation link to the other.
- The assignment dialog explains the one-character rule, lists eligible members by name
  and email, explains absent or already-assigned Players, and provides query recovery.
- Unlink explains retained membership/resources and requires confirmation. Cancel leaves
  the assignment unchanged. Player preview removes DM actions.
- Phone/tablet layouts remain legible and within the viewport at 150% text. Actions wrap
  without overlap. Both palettes maintain clear hierarchy; field labels, hints, confirmation
  copy and navigation are localized. The long phone layout at 150% is scrollable, with
  reachable actions and no fixed obstruction.

## Independently executed browser checks

Command:

```text
npx playwright test tests/e2e/characters.spec.ts --project=identity-mobile --project=identity-tablet --grep "consolidated|Party owns|assignment explains|already linked" --output=docs/evidence/RYT-021/reviewer/browser --workers=2
```

Result: 14 passed in 37.9 seconds. Chromium HTTP contract fixtures, 390x844 and 820x1180.
The matrix exercised Spanish/English, dark/light, 150% text and reduced motion across
Party, link, assigned, unlink, Members and invite states. Axe reported no WCAG A/AA
violations in those scans; visible tested buttons/selects met the 44px height check.
The focused flows also exercised query-error retry, no Players, every Player already
assigned, link/unlink, return focus and DM Player preview.

A separate live-browser script at 390px/150% additionally verified ten consecutive Tab
steps remain inside the link dialog, Escape returns to its opener, successful linking
returns focus to the updated unlink button, canceling unlink preserves assignment, and
the Members link navigates correctly. This script did not run axe. Its direct viewport
captures confirm that the visible skip link in some axe/full-page captures is not a
persistent overlay in the normal interaction.

Initial review-script attempts were preserved in the review record: the test-managed
server had already exited, causing connection refusal; after starting a dedicated preview,
an ambiguous Cancel selector matched both the close icon and footer button. Selecting the
footer Cancel explicitly resolved the harness ambiguity. The complete script then passed.
Neither attempt required an implementation change. The dedicated preview was stopped.

## Visually inspected evidence

All paths below are relative to `docs/evidence/RYT-021/`.

- `reviewer/browser/manual-link-390.png`: normal viewport, focus-trapped link dialog.
- `reviewer/browser/manual-assigned-390.png`: linked Player name and card actions.
- `reviewer/browser/characters-assignment-expl-c7e40-rs-from-failed-member-reads-identity-mobile/assignment-error.png`: visible error and retry.
- `reviewer/browser/characters-a-Player-alread-64d98-racter-is-not-offered-again-identity-tablet/all-players-linked.png`: explained unavailable assignment.
- `reviewer/browser/characters-en-light-consol-10652-haracter-management-at-150--identity-mobile/invite-en-light-150.png`: invitation dialog and next-step copy.
- `reviewer/browser/characters-es-light-consol-f5c46-haracter-management-at-150--identity-tablet/members-es-light-150.png`: reduced Members layout and navigation.
- `e2e/characters-es-dark-consolidated-character-management-at-150--identity-mobile/members-es-dark-150.png`: phone Members in dark mode.
- `e2e/characters-en-light-consol-10652-haracter-management-at-150--identity-mobile/assigned-en-light-150.png`: English assigned card.
- `e2e/characters-es-dark-consolidated-character-management-at-150--identity-tablet/link-es-dark-150.png`: tablet assignment layout.
- `e2e/characters-es-dark-consolidated-character-management-at-150--identity-mobile/unlink-es-dark-150.png`: unlink confirmation.

## Limits

This review independently ran the focused 14-test browser suite and the manual script;
the integrator's complete 129-test suite and 55 unit/SQL tests were reported separately.
Source inspection covered pending/error guards and the unchanged RPC calls. This is not
hosted PRE/PROD integration, a real two-account OAuth round trip, physical touch-device or
iOS Safari validation, a screen-reader audit, or proof of concurrent-server behavior.
No database, permission, deployment or release actions were performed.
