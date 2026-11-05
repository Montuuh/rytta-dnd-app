# RYT-053 verification: art for every SRD creature and the DM's own creature image

Date: 2026-11-05. Decision: [ADR 030](../../decisions/030-bestiary-art.md). Credits:
[bestiary-art-credits.md](../../bestiary-art-credits.md).

## Content

- 330 of 330 SRD creatures have art: 163 Wikimedia Commons files (free licences only), 84 Battle for
  Wesnoth portraits (GPL-2.0-or-later, pinned commit) and 83 game-icons.net icons (CC BY 3.0) drawn as
  ink on parchment (the non-red dragons in their own colour). Prehistoric animals use life
  restorations, not skeletons. Total size 18 MB; the 330 thumbnails (about 2.3 MB) load lazily. Chosen by eye from contact sheets; the selection excluded unrelated search hits,
  human remains, nudity and photos of identifiable people.
- Pipeline (manual): `scripts/bestiary/image_candidates.py` (Wikipedia lead images, Commons search),
  `contact_sheet.py`, `render_icons.mjs`, `build_images.py` (720px WebP, 128px square thumbnail,
  `art.json`, credits page). Wikimedia rate-limits anonymous clients: the scripts pace requests and
  call curl, because Python's HTTP client was throttled on every request.
- `src/features/bestiary/domain/content.test.ts` (ADR 030 block): every SRD id has credits, an image
  and a thumbnail; no NC/ND/non-free licence; images at most 720px; origin-specific licence and source.

## Database

`tests/database/bestiary-images.test.ts` (PGlite, full chain, PRE copied before the migration):
attach, replace, replay, mismatch and clear; invalid ids, paths of another creature, campaign or
environment, other extensions and missing objects refused; anon (permission denied on RPCs and the
table), outsider, Player and DM of another campaign denied; no direct writes even for the DM; storage
reads and uploads under the SRD prefix only for the campaign DM; template image rules unchanged; the
PRE mirror has no `public.`/`private.` references.

Hosted PRE: the remapped DDL was applied to `pre` alone, then a real PRE DM was exercised in a
rolled-back transaction together with the new storage router: the DM uploads, attaches, lists and
reads; the Player gets Forbidden on list and set, reads no object and no row, and the storage policy
refuses the Player's upload.

Production: hosted history before the change ended at `bestiary` (20261104020328); migration
`bestiary_images` applied (hosted version 20261104234516, repository file
`20261110120000_bestiary_images.sql`). Table present with RLS, no direct insert for `authenticated`,
`anon` cannot execute either RPC or read the table, the router refuses an anonymous write to an SRD
prefix, existing rows unchanged (1 template, 3 combatants, 1 creature image object). Security
advisors list no new category (the two RPCs join the intentional `authenticated` security definer
list, like every combat RPC).

## Browser

`tests/e2e/bestiary.spec.ts` "RYT-053" on 390px, 820px and 1440px: list thumbnail and token use the
bundled art; tapping the token opens the menu (view, change; no restore for bundled art); the viewer
shows the full image, author, licence and source links (new tab), passes axe and 44px targets, and
Escape closes it without closing the phone sheet and returns focus to the token; changing uploads a
WebP under `pre/{campaign}/srd-wolf/` and attaches it; the viewer then says it is the campaign image;
restoring clears it and the bundled art returns, with focus kept on the token. `combat.spec.ts`
RYT-043: a campaign creature adds an image through the picker, changes it from the menu and removes it
(the token becomes the picker again). Screenshots: `docs/evidence/RYT-053/{token,menu,viewer}-{mobile,tablet}.png`.

## Design flow and UI/UX review

Brief, refinement and Impeccable critique/audit: [design-flow.md](design-flow.md) (detector clean; the
P2/P3 findings fixed). Independent `ui-ux` review in
[ui-review/ryt-053/review.md](../ui-review/ryt-053/review.md): round 1 CHANGES_REQUIRED (P1-1 the
saving/saved line squeezed the stat block heading; P2-2 Escape on the remove question closed the
phone sheet; P2-3 the filled red confirm failed contrast; P3 copy and screen reader details), round 2
**PASS** on digest `64f648f8…f3ea13` (recorded in `docs/evidence/ui-review-current.json`). Regression
checks were added for P1-1 (heading width, status under the token), P2-2 (Escape over the sheet) and
P2-3 (axe with the question open). Open by product decision: restoring the SRD art does not ask
before discarding the DM's image (ADR 030).

`npm run check`: typecheck, lint, architecture, docs, AI checks, 36 unit/SQL files (256 tests), build.
`npm run test:e2e` (full suite, final code): 462 passed, 54 skipped by project, 0 failed.

## Not covered

Hosted Supabase Auth/Storage with real accounts and signed URLs, real iOS Safari/Android devices and
screen readers, the viewer's loading state (the fixture answers at once), and Player-side SRD art
(out of scope by ADR 030).
