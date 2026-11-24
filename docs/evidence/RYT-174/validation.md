# RYT-174: the base pack becomes Rytta

Date: 2026-11-24 (block Q). The owner chose every recommended option on the block Q options page.
Decision record: [ADR 051](../../decisions/051-campaign-content-packs.md), section "The base
pack becomes Rytta".

## What changed

- **Data.** Migration `20261226120000_pack_origin_protected.sql`.
  - `content_packs.baseline_version`, set on the base pack (slug `srd-5-2-1`) at its current
    version. Origin (`srd`, `changed`, `own`) is worked out against the published versions; the
    picture does not count. Nothing is written to the entries.
  - Library rows carry `origin` and `protected`; `get_content_draft` adds the baseline of a changed
    entry.
  - `get_campaign_content_origins` (active members) and `get_content_origins` (signed-in
    accounts) list the entries that are changed or the pack's own, with the pack's title.
  - A trigger refuses to withdraw the 40 published entries the app's code names.
- **Library.** `src/features/content-library/ui/`: an origin filter with counts (two rows of
  two, only for a kind that mixes origins), the origin in each row and in the editor's header, a
  "See the SRD original" disclosure for a changed entry, and no Delete on a protected entry, with
  a line that says why.
- **Readers.** `src/shared/api/pack-origins.ts`, `src/shared/ui/pack-origins-context.ts`, loaded
  by the glossary layer for the open campaign or for the published pack.
  - The glossary source line and the stat block footnote read "SRD 5.2.1, page N · changed by
    <pack>" for a changed entry and the pack's name for one of its own.
  - The base pack's title replaces the fixed "SRD" in the bestiary source filter, the fight
    form's creature group and the item origin label while it is 18 characters or fewer.
  - Content and the campaign creation step add "Based on the SRD 5.2.1" once the title no longer
    names the SRD.

## Deviations from the ticket's scope

- The licence lines keep their fixed text, which stays true; the indication of changes that the
  licence asks for is given per entry in the source line. The pack's attribution field is one
  language and is edited from the library.
- The pack is renamed from the library, not by the migration: production still shows the SRD's
  title (see Hosted).

## Checks

- **Database tests (PGlite).** 50 files, 566 tests passed. New: `pack-origin.test.ts` (7 tests:
  origins of drafts and of published versions at the pinned version, hidden entries, denials for
  anon, outsider and a member of another campaign, the 40 protected keys compared with
  `src/features/characters/domain/srd.ts`, refusals through the RPC and through SQL, and what may
  still be deleted) and PRE assertions in `content-library.test.ts`. First run: one failure, a
  wrong expected version in the new test.
- **Unit tests.** `src/shared/api/pack-origins.test.ts` (5 tests).
- **`npm run check`.** Passed on the final code: 143 test files, 1257 tests, build.
- **Browser tests.** Three new tests on mobile (390 px), tablet (820 px) and desktop, with axe:
  the origin filter, the original and the protected entry (Spanish, dark); the same in English
  and the light theme with text at 150%; the glossary source line. The first run found a real
  defect: the origin filter stayed applied when the kind changed. Fixed (it resets with the
  search).
- **Whole browser suite.** 1610 passed, 180 skipped, 2 failed on tablet: the signed-out landing
  links (`legal.spec.ts`) and the offline reload (`offline-shell.spec.ts`). Both pass when run
  alone and neither touches this change; the offline one also passed in the rerun of its file.
  The suite ran before the last polish of the filter; the library, glossary, legal and offline
  files were rerun on the final code (191 passed, the landing test failing once more in that run
  and passing alone).
- **Design critique.** Uneven wrapping of the filter labels at 390 px: each count now sits on
  its own line.
- **Independent UI review.** Round 1: changes required (the filter clipped its last option at
  390 px with text at 150%; the "light" captures were dark because the test named the wrong
  theme). Fixed: the filter is two rows of two, the test uses the light theme and asserts it,
  the filter hides for a kind with one origin and the disclosure has a chevron. Round 2: PASS.
- **Independent security review of the migration.** Safe to apply. Three medium findings were
  pre-apply checks, all met (below). Low findings are recorded in `docs/security.md`: Players
  receive the keys of changed and own creatures and items of a pack open to all, and an entry
  withdrawn at the baseline and added again reads as the pack's own.

## Hosted

Checked before applying, in production and PRE: the base pack is at version 3 with 1412
entries, each with a single published version; no withdrawn row and no pending change; the 40
protected entries are published.

- **Staging.** Applied. Stored statement md5 `fe6b40766b5f6ccd9b391e1ee97db22b`, 14074
  characters, equal to the LF file. Rolled-back actor check with a probe pack: drafts read
  `moon-ray: own`, `shield: changed`; the protected condition could not be deleted; another
  account read the same two origins and was refused the drafts.
- **Production and PRE.** Applied in one migration, same md5. Both: baseline 3, 1412 entries
  reading `srd`, 40 protected, the trigger installed, no execute for anon, helpers closed to
  clients; the PRE functions name no production schema. No other pack has a baseline. Every
  campaign stays at version 3.
- **Rolled-back actor check in production.** The super admin was refused the deletion of a
  protected entry in production and in PRE (Entry protected). A campaign member read the base
  pack with no changed entry, in the campaign and outside it, and was refused another campaign.
- **Security advisors.** No error. The two readers join the standing notice about security
  definer RPCs callable by signed-in accounts.
- **Names.** The PRE pack is titled "Rytta" (owner choice P1 A), for local use with this code.
  The production pack keeps the SRD's title until the release: the deployed app still prints
  its fixed "SRD".

## Acceptance

- **Renaming changes the name where the app printed a fixed "SRD"; stored references still
  resolve.** Unit test of the label; the slug and keys did not change. Not captured in a browser
  outside the library (see below).
- **Every entry has an origin; a changed entry and a new one show as such once published; the
  library filters by origin.** Database tests, hosted counts, browser tests.
- **No campaign is asked to review anything.** No entry was written; every campaign stays at
  version 3.
- **Withdrawing a protected entry is refused with a reason the library shows.** Database tests,
  hosted actor checks, browser test.
- **390 px, 820 px and a laptop width, both themes and languages, keyboard, axe; options page
  first; independent UI review PASS.** Browser tests and the review.

## Not verified

- The base pack's name in the bestiary filter, the fight form and the item origin label, the
  "Based on the SRD 5.2.1" line and the stat block footnote in a browser (code and unit test
  only; the fixtures outside the library keep the SRD's title).
- A changed or own entry in production: none exists yet.
- The library against hosted data in a browser, and a PRE refresh after this migration.
- iOS Safari and real devices.
