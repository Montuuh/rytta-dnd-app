# RYT-153 — Super admin role and admin panel

Date: 2026-11-22 (block E). Owner choices on 2026-11-22 from the options page: the panel shows a
campaign summary plus "Enter as DM", temporary audited DM access (P1 B), for two hours (P2 A),
opened from the account menu item "Administration" (P3 A), with the tabs Campaigns, Library,
Usage, Audit and Accounts (P4), and favourites in the directory and as "Supervised" in My
campaigns (P5 A).

## What changed

- `supabase/migrations/20261216120000_super_admin_role.sql`: the role (`private.super_admins`),
  two-hour access rows, favourites and the admin audit log, all closed to clients; ten admin RPCs
  that check the role server side; the access helpers add an open admin access as DM, so policies
  and RPCs work unchanged; super admins are content editors; character history shows an admin's
  change as the DM's without a name; campaign events taken through admin access carry no actor.
  A trigger guard keeps membership management (invitations, roles, seats) with the campaign's own
  members; a super admin who already plays in a campaign cannot open admin access to it;
  withdrawing the role closes open accesses. The same DDL is mirrored to PRE.
- `src/features/admin/`: the panel (`/admin`), the banner shown inside a campaign entered as
  admin (until when, Leave) and the Supervised list in My campaigns. Campaigns entered as admin are
  not listed as the account's own; the leave-campaign action is hidden there.
- `docs/security.md`: "Super admin (RYT-153)".
- Found while testing: the build now keeps Zod and its jitless setting in one chunk (the setting
  ran after a schema was built once the chunks were split differently, a CSP report), and the
  password visibility toggle keeps its 44 px size whatever order the CSS chunks load in.

## Acceptance

| Criterion | Evidence | Result |
| --- | --- | --- |
| Options page approved before implementation | Owner answer on 2026-11-22 (P1–P5 above) | Met |
| Role in a private table with no browser write path; server-side checks; every opening or change audited | Migration; `tests/database/super-admin.test.ts` (tables closed to clients for select, update and delete; enter, exit, favourites, account lookups and DM-email searches audited) | Met |
| Search all campaigns, favourites, open any campaign in the approved mode; DM, Player, outsider and anon get Forbidden | `super-admin.test.ts` (every RPC refused to anon, outsider, Player, own DM and other DM; directory, favourites, two-hour DM access to the entered campaign only, expiry and role withdrawal) | Met |
| Members, party, player lists, presence and player-visible history never show a super admin | `super-admin.test.ts` (member list and `campaign_members` as DM and Player, no membership row, history as DM and Player shows `dm` without a name); membership management refused while inside | Met |
| Super admins manage the content library like content editors | `super-admin.test.ts` (`is_content_editor`) | Met |
| 390 and 820 px, both themes and languages, keyboard and Escape, axe; independent UI review | `tests/e2e/admin.spec.ts` (17 runs: panel in es/en × Hearth/Parchment at 390 px, base at 820 px; banner and Leave; Supervised; usage, audit and accounts; a campaign far down a long list; every tab in view; retry after a failed load; hidden for everyone else; axe, overflow and touch targets); UI review below | Met |

## Database results

- PGlite: `npm run test:db` 509 passed (42 files), including 9 super admin tests.
- Staging (`rytta-staging`): migration stored with the same md5 and length as the file
  (`c5a523b1…`, 36 591 bytes); a self-rolling-back check created a campaign as a DM, refused the
  DM on the admin RPCs, entered as a super admin, refused a self-invitation, left and found both
  audit rows.
- Production: preconditions checked first (no orphan idempotency rows in `private` or
  `pre_private`, PRE present). Applied as `20261122160323_super_admin_role` with the same md5. The
  four tables exist with RLS in `private` and `pre_private`; the guard, withdrawal and event
  triggers exist on both schemas; the open-access index is unique on both; anon cannot execute the
  RPCs and authenticated cannot read the role table. The same rolled-back check ran on `public` and
  on `pre` and confirmed no cross-environment access.
- Advisors after the apply: only the existing patterns (RLS enabled with no policy on closed
  private tables, security definer RPCs callable by authenticated, unused new indexes).
- Grant: the owner's admin account was made super admin in production and PRE on 2026-11-22 (the
  address stays out of the repository, as for content editors).

## Checks

- `npm run check`: typecheck, lint, architecture, docs, 1168 unit tests, build.
- `npm run test:e2e`: 1472 passed in the full run; the 6 failures (CSP report, password toggle
  size, one legal navigation) were fixed or passed on re-run, and the affected specs pass.

## UI review

Independent UI review: CHANGES_REQUIRED first (picking a campaign far down the list left its
summary out of view; at 390 px the Accounts tab hid behind a scroll with no cue; failed loads said
"try again" with no way to; plus plural, percent format, a hidden Usage column, raw sign-in method
and ISO week), all fixed; PASS on 2026-11-22 for the current source (report kept locally under
`docs/evidence/ui-review/ryt-153/`). Non-blocking notes: at 390 px with 150 % text the Usage table
scrolls sideways with no cue; long emails break mid-word at 150 %; the action error is generic.

## Not verified

- Realtime updates for a super admin inside a campaign, and a real sign-in with the granted
  account, were not exercised in a browser against hosted Supabase.
- Dice rolls stay members' only: a super admin inside a campaign cannot roll.
