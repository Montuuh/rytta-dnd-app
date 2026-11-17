# Delivery RYT-115: account deletion, data export and legal pages

Status: review (2026-11-17). Implementation, checks, the independent UI review, independent
security reviews and the hosted migrations are complete. Not Done: the frontend is not
released, the removal of the Auth user in production was never exercised, and the legal texts
and contact address are owner items.

## Outcome

Migrations `20261125120000_account_deletion_export.sql` (hosted `20261117063453`) and
`20261128120000_account_deletion_prepare_combat_leave_mask.sql` (hosted `20261117063840`) were
applied to production and mirrored to PRE on 2026-11-17; baseline row counts were unchanged.

- RPCs `export_my_data`, `account_deletion_blockers`, `account_storage_paths`,
  `prepare_account_deletion` and `delete_my_account`. Deletion needs the typed word, is blocked
  while the user is the only DM of a campaign with other members, deletes solo campaigns,
  de-identifies history and hands ownership to the oldest active DM.
- No foreign key to `auth.users` is left as NO ACTION.
- Browser flow: prepare, remove the user's images, delete, sign out.
- Settings has an Account section with a data download and a delete dialog; a notice is shown
  after deletion.
- Privacy and terms pages in English and Spanish, marked as draft; attribution is covered by
  sections of the Terms page.
- `docs/security.md` has an "Account deletion" section.

## Acceptance

| Criterion | Result |
| --- | --- |
| Export returns the user's own data and nothing of other users or DM-only fields | Met in SQL tests and in a hosted PRE actor check (RYT-119, check a) |
| Typed confirmation, sole-DM consequence stated, Auth user, profile, memberships, invitations and storage objects gone, others' data intact | Met in SQL tests and hosted PRE checks b and c (PRE returns `auth_user = 'shared'` and never touches production or Auth). Not verified: real removal of the Auth user in production, solo-campaign deletion with real stored images, concurrency |
| Deleting an Auth user no longer fails on foreign keys | Met in SQL tests; hosted catalog shows 0 NO ACTION keys to `auth.users` |
| Denial tests for anon, outsider, Player and cross-campaign DM | Met on PGlite; anon denial confirmed on hosted PRE |
| Legal pages signed out under the production subpath, linked from landing and settings; privacy URL recorded for the Google consent screen | Partly met: pages and links pass browser specs; the texts are drafts and the privacy URL can only be recorded once the frontend is published (RYT-122) |
| 390px and 820px, both themes, both languages, keyboard and Escape, axe; independent UI review PASS | Met. Round 1 CHANGES_REQUIRED with 8 findings, all resolved; round 2 PASS |

## Verification

`npm run test:db` 292 or more passing. Every migration had an independent security review with
the verdict safe to apply. Final run on the current tree, 2026-11-17: `npm run check` passed
(627 unit and database tests, build), format check clean, `npm run test:e2e` 680 passed, 59
skipped, 0 failed. Hosted results are in [RYT-119 validation](../RYT-119/validation.md).

## Not verified

Real removal of the Auth user in production, solo-campaign deletion with real stored images,
concurrent deletions, real iOS and Android keyboards, screen readers and the production build.

## Owner items

- Review the legal texts and remove the draft flag.
- Set the `VITE_CONTACT_EMAIL` repository variable. Until it is set, the 'disabled' and 'kept'
  notices tell the user the address is not yet published.
- Decide whether the production build should fail without `VITE_CONTACT_EMAIL` once the draft
  flag is off.
- Accepted behaviour to confirm: deleting a solo campaign also removes rows authored there by
  former members.

## Follow-ups

- RYT-120: a Player with an absent character cannot leave a campaign through
  `change_campaign_member` (`Character absent`), found during this delivery.
- RYT-121: account dialog action order and post-deletion notice focus ring (UI review notes
  R2-b and R2-c).

- 2026-11-17: the owner approved the privacy policy and terms texts; the draft state is off (`LEGAL_DRAFT = false`) and the pages show "En vigor desde el 17 de noviembre de 2026". Live builds now fail without the contact address and owner name.
