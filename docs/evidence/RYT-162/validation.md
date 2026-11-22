# RYT-162 — Campaign content: packs per category at pinned versions

Date: 2026-11-22 (block H). Owner choices on 2026-11-22 from the options page, all the
recommended ones: a Content tab ordered by category (P1 A), five categories (P2 A), a review with
collapsible New / Changed / Withdrawn lists (P3 A), hiding from Content and later from each module
(P4 A), new campaigns start with the SRD (P5 A) and Players do not see Content (P6 A).
Decision record: [ADR 051](../../decisions/051-campaign-content-packs.md).

## What changed

- `supabase/migrations/20261218120000_campaign_content.sql`:
  - `content_entry_versions` keeps every published version of every pack entry; publishing now
    writes it and the current SRD entries were back-filled at version 1.
  - `campaign_content` (pack, category, pinned version, enabled) and `campaign_content_hidden`,
    with RPCs to list, enable or turn off, review changes, accept an update, list entries with a
    search and hide or show one. Only the campaign's DM (or admin access) reads or writes them.
  - New campaigns start with the public SRD in every category; existing campaigns keep what they
    used: spells, classes and rules, and creatures only where the official bestiary was downloaded,
    with its removals hidden.
  - Until RYT-094 the campaign bestiary tables stay the record for the SRD creatures and drive
    `campaign_content` through triggers, so both views agree.
- `src/features/campaign-content/` and the DM Command Center: a Content tab with a switch per pack,
  its version and hidden count, a review of a newer version and a searchable list to hide entries.
- `docs/security.md`: "Campaign content (RYT-162)".

## Scope decisions inside the ticket

- Only categories a module already reads are offered (creatures). Spells, classes, rules and items
  are stored for every campaign and appear with RYT-164 to RYT-166, so no switch promises an
  effect that does not exist yet.
- Campaign versions of pack entries stay where they are today (the creatures' versions in the
  bestiary); a generic store comes with the module tickets that edit other kinds. The review
  already flags creatures the campaign has its own version of.
- Turning a pack off keeps its pinned version and hidden entries, so turning it on again never
  skips a review. Turning the SRD creatures off behaves as the bestiary's "remove all" and asks
  first.

## Acceptance

| Criterion | Evidence | Result |
| --- | --- | --- |
| Enabling, hiding, updating go through campaign-scoped RPCs; only the DM writes; Players read nothing here | `tests/database/campaign-content.test.ts` (every RPC refused to anon, outsider, Player and other-campaign DM; tables closed to clients; whole-category toggles, hidden entries, version checks) | Met |
| A new pack version changes nothing until the DM accepts it, and the review lists what changes | `campaign-content.test.ts` (a version 2 with a changed, a new and a withdrawn creature: the campaign stays at 1; the review lists them with the hidden flag; a stale version is refused; accepting moves to 2); `tests/e2e/campaign-content.spec.ts` (review, update, stale message) | Met |
| Existing campaigns that downloaded the official bestiary keep the same creatures and removals | `campaign-content.test.ts` (migration run over data created before it: creatures enabled with the removed kobold hidden; a campaign without the bestiary keeps no creatures; the bestiary and campaign content stay in step both ways) | Met |
| Denial tests for anon, outsider, Player and other-campaign DM; hosted apply to staging, PRE and production | Denials above; hosted results below | Met |
| 390 and 820 px, both themes and languages, keyboard and Escape, axe; independent UI review | `campaign-content.spec.ts` (15 runs: panel ES/EN × Hearth/Parchment at 390 px and base at 820 px; review, entries and turn-off dialogs with axe, touch targets and focus return) | Met |

## Hosted rollout (2026-11-22)

The same LF file (34446 bytes, md5 `d720fafc77fe7abd118f65adec6282d8`) was applied and the stored
statements compared by md5 and length in each project.

- Staging: no packs, 2 campaigns. The three tables have RLS on and no client grants. Anon cannot
  execute the RPCs, the three triggers exist and the account deletion clears `updated_by`.
  A rolled-back smoke refused an outsider.
- Production, before: the public SRD pack at version 1 (1161 published entries), 3 campaigns,
  2 bestiary downloads and no removals.
- Production, after:
  - 1161 entry versions back-filled.
  - 11 `campaign_content` rows: spells, classes and rules for the 3 campaigns, plus creatures
    for the 2 that downloaded the bestiary, all at version 1.
  - PRE: tables, triggers and RPCs created in `pre`, with RLS on, no client grants and no
    reference to `public`. No rows yet, because PRE has no packs.
  - Account deletion is patched in both `public` and `pre`.
- Production smoke (rolled back), as the DM of an existing campaign:
  - the SRD showed 330 creatures;
  - a search for "wolf" returned 5;
  - hiding one recorded it in `campaign_srd_removed`;
  - an outsider was refused in `public` and `pre`.
- Advisors: the findings match the existing pattern for RPC-only tables ("RLS enabled, no
  policy", INFO) and authenticated security definer RPCs (WARN). There is no new kind of finding.

## Checks

- `npm run test:db`: 526 passed. It includes `tests/database/campaign-content.test.ts` with
  8 tests, and the table and foreign key counts were updated in `pre`, `account-deletion` and
  `content-library`.
- `npm run check`: typecheck, lint, architecture and docs contracts, 1185 unit and SQL tests,
  and the build. All passed.
- `npm run test:e2e`: 1514 passed, 160 skipped and 1 failed. The failure was in
  `legal.spec.ts`, where the landing link measured 0 px before its styles loaded, so the test now
  polls the height. Under heavy parallel repeats the same spec can still click the static page
  before the app routes the link. This is a load race that predates this ticket. The spec passes
  alone (49 passed). `campaign-content.spec.ts`: 15 passed.

## UI review

An independent UI review ran three rounds:

1. Changes required: re-enabling a pack skipped the review; focus did not come back when a
   dialog closed; chained dialogs could not be closed.
2. Changes required: focus after an update; the English labels of the per-pack buttons.
3. PASS on the source fingerprint `05bf8f3b…`, with no blocking notes.

One cosmetic point remains: "Ver y ocultar" wraps to a second line on the phone.

## Not tested

- Hosted Supabase through the browser. The e2e tests use fixtures; PGlite is not hosted
  Supabase.
- WebKit/iOS, a screen reader, "Ver más" with more than 100 entries, and a pack that is no
  longer offered, in the browser.
