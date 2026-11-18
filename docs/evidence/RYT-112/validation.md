# Delivery RYT-112: launch presentation, brand art, landing, app shell and illustrated fallbacks

Status: done (2026-11-18). Every acceptance criterion is met and the independent UI review passed
in round 3. The work was merged to `main` through PR 13 on 2026-11-18 and is live at
https://rytta.pages.dev.

## Outcome

A static illustration set of 51 pictures (catalogued in `docs/interface-art.md`), a landing
page, app icons, a web manifest and a share image, translated document titles, reworked
navigation with planned modules hidden, not-found, error and loading screens, campaign hub
covers, a first-session checklist, a DM center, a class picker with default portraits, the
sheet hero and conditions, default shop and item art, and illustrated empty states.

## Acceptance

| Criterion | Result |
| --- | --- |
| Landing explains the product, hero art, sign-in, no horizontal scroll at 390px and 820px | Met in browser specs |
| Icons, manifest and share image; translated titles on nested routes | Met in the build and browser specs; a real link-preview crawler and PWA install were not tried |
| Bottom bar with one module, DM reaches Combat and the table in one tap, planned modules hidden | Met in browser specs |
| Not-found, error and loading screens with art and a link home | Met in browser specs |
| Fallback art for covers, empty lists, portraits, shop banners and items | Met. Table view tokens (finding F8) now show class emblems through RYT-118 |
| 390px and 820px, both themes, both languages, keyboard and Escape, axe; independent UI review PASS | Met. Independent UI review PASS in round 3; the current recorded PASS covers RYT-112 to RYT-118 |

## Verification

Progress run on 2026-11-17: `npm run check` passed (565 tests and the build); `npm run test:e2e`
finished with 605 passed, 53 skipped and 0 failed.

Final run on the current tree, 2026-11-17: `npm run check` passed (627 unit and database tests,
build), the format check was clean and the full `npm run test:e2e` run finished with 680
passed, 59 skipped and 0 failed.

## Independent UI review

- Round 1: CHANGES_REQUIRED with 16 findings.
- Round 2: CHANGES_REQUIRED. 15 findings resolved; F8 (Table view tokens without class
  emblems) deferred to RYT-118; one new blocking finding R1 (the conditions grid at 390px) and
  one minor finding N2.
- Round 3: PASS.

The detailed findings are kept in the local UI review record.

## Not verified

A real link-preview crawler, PWA install, the production build as deployed, real iOS and Android
keyboards, screen readers, the RYT-113 error strings rendered in the UI (no fixture produces
them), 150 % text size at 820px and real touch devices.

## Release

Merged to `main` through PR 13 on 2026-11-18 and published on Cloudflare Pages
(https://rytta.pages.dev); the owner verified sign-in there. The remaining production smoke test
is tracked in RYT-122.
