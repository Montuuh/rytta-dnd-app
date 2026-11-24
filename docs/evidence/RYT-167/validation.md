# RYT-167: the SRD leaves the code, and the DM chooses a campaign's content

Date: 2026-11-23 (block L). The owner chose the recommended options on the block L options page.
The decision record is [ADR 051](../../decisions/051-campaign-content-packs.md), section "The SRD
leaves the code (RYT-167)".

## Production data

- **SRD pack, version 2.** The 197 SRD items, 12 classes and 12 subclasses were added to the
  published SRD pack and published as version 2, next to its creatures, traits, the CR baselines,
  spells, class features and rules.
  - Source: the catalogues of commit 5911bc0e, the last commit that bundled them.
  - The item keys stored match the catalogue (md5 of the sorted keys
    `3fd389b0134399989dcd3a612382d1bf` on both sides).
  - Loaded as the SRD owner through the library RPCs (save and publish), not by table writes.
- **Rytta basics pack, version 1.** A new public pack (`rytta-basics`) with the 3 Rytta items of the
  old catalogue.
- **Existing campaigns (P3 A).** The 3 production campaigns now pin every SRD category at version 2
  (their classes come from the SRD version with classes) and have the Rytta basics items.
- **PRE.** The content tables (packs, entries and entry versions, 1385 rows each) were copied to
  `pre`, and both PRE campaigns enabled the SRD and the Rytta basics.
- The staging table and the temporary `http` extension used for the load were dropped afterwards.
- **The owner no longer needs to upload or publish the SRD.** The library's upload buttons for the
  bundled SRD and the Rytta basics are gone with the bundled data.

## Migration `20261222120000_campaign_content_choice.sql`

- `get_content_choices()`: the packs a new campaign can use, per category with their entry counts
  and whether a new campaign starts with them.
- `create_campaign_with_content(name, description, chosen)`: creates the campaign and leaves enabled
  exactly the chosen pack categories. A refused pick rolls the whole campaign back.
- `get_srd_creature_pack(part)`: the published SRD creatures, traits and CR baselines for the
  bestiary, capped at 8 MB.
- All three are for signed-in accounts only.
- **Anonymous reads were not opened.** P4 A asked that the demo read the published SRD. In
  production a visitor without an account sees only the landing page, so no anonymous surface shows
  SRD data. Opening it would only add unauthenticated egress. In practice:
  - The no-backend preview build says its glossary needs the content library.
  - The glossary outside a campaign reads the published SRD for any signed-in account.
- Hosted apply:
  - Staging (`rytta-staging`) first, then production with the PRE mirror.
  - The stored statement matches the reviewed LF file (md5 `9f7055fda588cb189d41b214b39378bb`,
    10621 characters).
  - PRE has the three functions. `anon` cannot execute them, in `public` or `pre`.
  - Production smoke test, rolled back:
    - The choices list the SRD (creatures 330, spells 339, classes 256, rules 212, items 197, all
      ticked) and the Rytta basics (items 3, ticked).
    - The creature pack serves 330 creatures, 28 baselines, 330 Spanish bodies and 48 traits (index
      96 KB, Spanish bodies 616 KB).
    - Creating with the defaults enables 6 categories and the SRD bestiary.
    - An unknown pack is refused.
  - Security advisors: no new finding.

## What changed in the app

- **Bundled data removed from `src/`.** The creature catalogue, the glossary (spells, class
  features, rules), the basic items and the SRD class tables are gone.
  - The JSON now lives in `tests/fixtures/srd/`, for unit tests and the browser test backend.
  - The production build ships none of it.
  - Only the bestiary art map stays in `src/`.
- **Readers.**
  - The bestiary reads `get_srd_creature_pack`.
  - Classes come only from the campaign's packs: creation, level up and the sheet offer no class
    until the library answers. A blank sheet shows the retry alert meanwhile.
  - The glossary outside a campaign reads the published SRD.
- **Creating a campaign (P2 A).** Creating a campaign has a second step, "Contenido de la campaña":
  - One group per category, with a checkbox per pack.
  - The SRD and the Rytta basics are ticked.
  - The DM's own private packs are listed too.
- **Library.** The upload dialogs for the bundled SRD and Rytta basics are gone. The empty state
  only offers to create a pack.

## Acceptance

| Criterion | Evidence | Result |
| --- | --- | --- |
| No bundled SRD catalogue of creatures, glossary, items or class tables remains in `src/`; the build ships none | `src/features/*/content` holds only `bestiary/content/art.json`; the build's largest chunks are code and translations | Met |
| Creating a campaign lets the DM choose packs per category, SRD and Rytta basics ticked; versions pinned | `identity.spec.ts` "empty hub creates": the defaults are ticked, an untick is respected and the call carries the chosen categories. `content-choice.test.ts`: creation enables exactly the choice, pins the current version and refuses foreign packs and bad shapes without creating anything. Production smoke test | Met |
| Existing campaigns keep working with classes from the SRD version with classes | The 3 production campaigns pin SRD v2; `pack-classes.spec.ts`, `level-up.spec.ts`, `character-sheet.spec.ts` | Met |
| The demo and the glossary outside a campaign read the published SRD | Glossary outside a campaign: `glossary-demo.spec.ts`, signed in, reads `get_srd_rule_pack`. Demo: changed by the security review, see "Anonymous reads were not opened" | Met for signed-in accounts; anonymous not opened |
| UI: 390px and 820px, both themes and languages, keyboard and Escape, axe; independent UI review | `content-choice.spec.ts`, `identity.spec.ts`, `pack-rules.spec.ts`; captures in `docs/evidence/ui-review/ryt-167/` | Met: UI review PASS on the second round |

## Checks

- `npm run check`: typecheck, lint, contracts, 1221 unit and PGlite tests (including the 4 new
  `content-choice` tests), then the build.
- `npm run test:e2e`, full suite: 1554 passed, 2 failed, 172 skipped.
  - The 2 failures were a navigation refused with `ERR_NO_BUFFER_SPACE` (casting axe, mobile) and
    a slow reload (preferences, demo mobile). Both pass when run alone (12 runs).
- Library browser tests now start from the published SRD served by the test backend
  (`tests/e2e/fixtures/srd-library.ts`) instead of uploading the bundled SRD.
- New `tests/e2e/content-choice.spec.ts`: the content step in both languages and themes. It covers
  the error and retry state, the defaults, Back keeping the name, and Escape returning focus.
- New preview test in `scaffold.spec.ts`: the glossary note of the no-backend build.
- After the first UI review (CHANGES_REQUIRED), a class choice says when the campaign's classes are
  loading, could not be loaded (with a retry) or do not exist (new test in `pack-rules.spec.ts`).
  The pack rows of the content step are whole-row checkboxes. The specs touched by the fixes pass
  again (72 runs).

## UI review

- First round: CHANGES_REQUIRED.
  - F1: the class step was empty with no state while the library loaded or failed, or when the
    campaign had no classes.
  - F2: the pack checkboxes had a 20 px touch target.
  - Plus minor findings.
- Second round: PASS on the fixed source.
- Non-blocking observations left open:
  - R1: the focus ring of the step heading is clipped.
  - R2: at 390px the create button is below the fold.
  - R3: the entry count uses 12 px instead of the meta size.
  - R4: in the quick sheet of a campaign without SRD classes, "Siguiente" stays the main button.
- Report: `docs/evidence/ui-review/ryt-167/review.md`.

## Not tested

- The browser against hosted Supabase: creating a campaign and reading the bestiary from production
  data.
- WebKit/iOS and screen readers.
