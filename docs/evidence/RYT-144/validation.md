# RYT-144 — Table activation and campaign preparation

The public example uses six screenshots of one synthetic turn across three roles in English and Spanish. Campaign recency means the last visit by the signed-in account on this device. The solo rehearsal keeps its turn order in memory. Pending shop orders open filtered to the selected merchant. Loot templates belong to the campaign and can be reviewed, reused or deleted by its DMs.

## Functional verification

- Chromium fixture sessions cover signing in as an invited player, acceptance, linking the selected person to a sheet, and copying or cancelling an invitation. Live two-account Google OAuth and physical devices were outside these tests.
- Sixteen mobile and tablet preparation checks exercised the current encounter, administrative navigation, the solo round, pending invitations, roster assignments and player preview. The shop suite passed all 32 cases against the fixture builds.
- The loot workflow granted one potion each to two recipients and a weapon to a third. The browser checked the summary, keyboard focus, receipt and template operations. Database tests exercised replay, rollback, stale revisions, cross-campaign and role denials, invalid quantities and the template quota.
- Early development-server shop runs encountered a cold-load timeout and a page reload during accessibility checks. The compiled shop suite passed. Adding a private table changed the PRE copier's expected table count. The updated copier and distribution tests passed together.

## Hosted SQL

The migration contains 7,742 LF bytes with MD5 `848159562d395fccb4ae9ddc3874405a`. Its stored statement matched the committed file in staging (version `20261118232904`) and production (version `20261118233029`). Staging and a rollback-only rehearsal on the production project's PRE schema exercised a DM distribution to two recipients, replay with the same request ID, exact resulting quantities, listing and deleting a saved template, and outsider denial. The smoke transactions rolled back their fixture data.

The production catalog exposes the three functions to authenticated users in both application schemas, with no anonymous execution. The private template table has RLS and no direct client grants. The security advisor flags the policy-free private table and authenticated execution of security-definer RPCs; access is checked inside the functions. Before and after deployment the MD5 aggregates of the existing production inventory, definitions and characters matched respectively: `3b1b7d09f3b8aa94e8b655130fd121b3`, `3432f3cf5730c984cdb06dbf5300e6ae` and `9f3ecceddd05e2462b965a9ae09b62af`.
