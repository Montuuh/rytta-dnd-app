# RYT-173: only super admins write the content library

Date: 2026-11-24. Decision record:
[ADR 054](../../decisions/054-library-single-writing-role.md). Follows the library audit of
2026-11-23 and the owner's request that the base data be set by super admins alone.

## What changed

- **Migration `20261225120000_library_super_admin_only.sql`.** `private.is_content_editor()`
  returns `private.is_super_admin()`, in public and PRE (`pre_admin.remap`). The helper keeps its
  revoked execute. `private.content_editors` is commented as retired; no row is deleted. The
  migration refuses to run where the super admin helper is missing.
- **No other SQL changes.** Every library write, draft read, private pack offer and picture upload
  already asks this helper.
- **Database tests.** The writer in every library test is a super admin. New denial cases:
  - `content-library.test.ts`: an account with only a content editor grant is refused on every
    write and draft read, in public and PRE, and still reads the published pack.
  - `pack-items.test.ts`: the same account, and an owner without the role, manage no offers; a
    super admin offers to any campaign.
  - `pack-images.test.ts`: the same account uploads nothing; an owner without the role reads
    their pack's pictures and uploads nothing.
  - `super-admin.test.ts`: the helper is false for a content editor grant alone.
- **Docs.** ADR 054, `docs/security.md` (library writers, offers, pictures) and ADR 040's status.

## Checks

- **Database tests (PGlite).** The first run with the migration failed 11 tests in 7 files, all
  because the tests granted the editor role. After moving them to the super admin role and adding
  the denial cases: 49 files, 559 tests passed.
- **`npm run check`.** Passed: typecheck, lint, architecture, docs (173 tickets), 141 test files
  with 1245 tests, build.
- **Independent security review of the migration.** Safe to apply. One medium finding: the
  migration assumed that the super admin helper and a super admin exist. Fixed with the guard in
  the migration and the pre-apply checks below. Three low findings are recorded in ADR 054: an
  owner without the role still reads their pack's pictures, cannot manage its offers, and PRE is
  skipped silently when its objects are missing (checked after the apply).

## Hosted

Checked before applying: `super_admin_role` is in the migration history of staging and
production; production and PRE each hold one super admin (the same account); the only content
editor grant outside the super admin owned both public packs; no private pack exists.

- **Staging.** Applied. Stored statement md5 `5b0750bc80aaa02aa9a73d5e10ab7dd0`, 2901 characters,
  equal to the LF file. Rolled-back actor check: an account with only a content editor grant got
  `editor: false` from `get_content_library` and `Forbidden` from `save_content_pack`; the same
  account as super admin saved a pack. Staging has no super admin and no packs, so it has no
  writer, as before.
- **Production and PRE.** Applied in one migration (PRE through the remap). Same md5 and length.
  `private.is_content_editor()` and `pre_private.is_content_editor()` return their own
  `is_super_admin()`, are security definer and are not executable by anon or authenticated.
- **Ownership.** One update per environment, PRE first, moved `srd-5-2-1` and `rytta-basics` to
  the super admin account. Versions (3 and 1), visibility and the default item packs are
  unchanged, and every campaign keeps the versions it pinned (3 campaigns in production, 2 in
  PRE).
- **Rolled-back actor check in production and PRE.** The former editor account: `editor: false`
  in both environments, `Forbidden` on `save_content_pack` (both) and on `list_content_drafts`,
  still reads the 15 published conditions and the 2 public packs of `get_content_choices`. The
  super admin: `editor: true` in both, no pending changes in either SRD. Nothing was written.
- **Security advisors (production).** No error. The three notices are the standing ones: RPC-only
  tables with RLS and no policy, security definer RPCs callable by signed-in accounts and leaked
  password protection. None names the changed helper.
- The two content editor rows stay in production and PRE; they grant nothing.

## Acceptance

- **A content editor grant alone is refused; a super admin still writes.** Database tests for
  writes, draft reads, picture uploads and offers; hosted actor checks for writes and draft reads.
- **Tests grant the super admin role and the denial tests still pass.** 559 database tests.
- **Applied to staging, PRE and production; packs owned by the super admin; campaigns keep their
  versions.** Hosted section.
- **Docs describe the single writing role.** ADR 054 and `docs/security.md`.

## Not verified

- A picture upload by the former editor against hosted Storage (the policy calls the same helper;
  only PGlite exercised it).
- A PRE refresh after this migration (read from the refresh code: the helper is plpgsql, so the
  name order does not matter).
- The library screen in a browser with the former editor account: the entry is hidden by the
  same `editor` flag the hosted check read.
