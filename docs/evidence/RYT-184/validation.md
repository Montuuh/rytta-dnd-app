# RYT-184 validation: campaign content by pack

Date: 2026-11-26. Decision: [ADR 060](../../decisions/060-campaign-content-by-pack.md); server
side in the addendum of [ADR 051](../../decisions/051-campaign-content-packs.md). The owner chose
option A in each of the eight questions of the options page.

## What was built

| Choice                     | Where                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| 1. One card per pack       | `src/features/campaign-content/ui/` (`pack-card`, `pack-detail`, `content-panel`)          |
| 2. One update notice       | `pack-update.tsx`, `digest.ts`; `get_campaign_content_pack_changes`, `update_..._pack`      |
| 3. Entries in a sheet      | `entries-sheet.tsx`, `content-sheet.tsx` on the kit Drawer (`src/shared/ui/kit/drawer.tsx`) |
| 4. Items one at a time     | `src/features/inventory/ui/pack-finds.tsx`, `src/pages/item-store.tsx`, `basic-import.tsx`  |
| 5. One-step creation       | `src/features/campaigns/ui/create-campaign.tsx`, `content-choice.tsx`                       |
| 6. Pack covers             | `src/shared/ui/pack-cover.tsx`, `content-library/ui/pack-cover-field.tsx`, image queue      |
| 7. Lists open on what's used | `src/features/combat/ui/bestiary*.tsx`, `src/features/glossary/ui/`                       |
| 8. Kit only in new screens | ADR 059; no RYT-181 row rebuilt                                                             |

One short name per pack on every screen: `shortPackName` in `src/shared/api/pack-origins.ts`.

## Audit findings

Fixed: 1 (cover, initial until painted), 2, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17 (the
storeroom finds the items of the packs in use), 18, 19, 20, 21, 22, 23, 24 (cover field; slugs in
the manager left as they are, an editor screen). Left: 3 (storeroom rows keep the glyphs of
RYT-181; the pack finds use the item's picture), 4 (category headings no longer exist on the
panel), 12 (the light strip at the right edge of tablet captures is the scrollbar gutter of
headless Chrome; not seen as a layout fault).

## Checks

- PGlite: `npx vitest run tests/database` 588 passed, including 15 new tests of
  `tests/database/campaign-content-by-pack.test.ts` (denials for anon, outsider, inactive member,
  Player, the DM of another campaign; super admin through admin access; packs not offered,
  withdrawn offers, the base pack in its mismatch state, stale updates, the cover fallback).
- Security review of the migration before production: no critical, high or medium finding; the
  four low ones were applied (update and digest agree on `<`, the DM check inside
  `campaign_content_apply`, the offer checked under the campaign lock, more tests).
- Hosted: migration `campaign_content_by_pack` applied to staging (`rytta-staging`) and then to
  production, which applies it to `public`/`private` and through `pre_admin.remap` to
  `pre`/`pre_private`. Stored statement md5 `48382432596b80438ab44fd861c3b1a0`, 28,928 bytes, the
  same as the committed file on both projects. On production: the six new functions exist in both
  schemas, `list_campaign_content_entries` only in its 6-argument form, no `public.`/`private.`
  reference in the PRE copies, anon cannot execute them, authenticated cannot execute the private
  helpers. On staging an anonymous call was refused and an outsider got Forbidden. On PRE a DM of
  a campaign read `get_campaign_content` (3 packs; the base pack: 330 creatures, 339 spells, 12
  classes, rules and items, cover null) and `get_campaign_used_creatures` inside a rolled-back
  block. Advisors were not run.
- `npm run check`: passed (1,347 unit and SQL tests, build).
- `npm run test:e2e`, full runs on the integrated tree: first 1,902 passed and 5 failed (two specs
  still expected the old creation step and the glossary list at landing, updated; one storeroom
  focus check and one combat check that passed alone). Last run 1,884 passed, 25 failed: 24 were
  `ENOENT` on trace files removed while a second Playwright run used the same `test-results`
  folder; `dice` and `combat` then passed alone (106 passed), and `preferences.spec.ts` passed
  three times in a row alone. After the last review fixes `campaign-content` and `content-choice`
  passed (61 passed).
- Design critique: detector without findings in the new code; the visual review scored 27/40 and
  its nine material fixes were applied.
- UI review: CHANGES_REQUIRED, CHANGES_REQUIRED, then PASS on fingerprint
  `3b67790421cbb13751a3ccc37d0a39abaa619c2dc91bb9a8c4615d4280686f4e`.

## Open

- The three pack covers (IMG-469 to IMG-471) wait for the owner in the image queue; then the
  owner uploads each in the library as the pack's cover (PRE and production) and publishes.
- Not tested: real touch drag of the tablet side sheet, iOS safe areas, a screen reader, real
  painted covers and signed cover URLs on hosted storage, the glossary and bestiary with several
  real packs, the Supabase advisors after the apply.
- Low, optional: the base-pack turn-off text is one long sentence (nine lines on a phone at
  150% text).
