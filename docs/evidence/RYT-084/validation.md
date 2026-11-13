# RYT-084 verification: page intros and brand slogans

Date: 2026-11-10. Source: audit of page intros and brand copy,
applied in full at the user's request.

## Changes

- Cut (ES and EN): `hub.intro`, `dm.commandIntro`, `characters.intro`, `characters.playerIntro`,
  `roster.dmLede`, `catalogue.intro`, `shop.intro`, `glossary.intro` (also inaccurate: the
  glossary holds 2014 rules too), `tabletop.intro`, `brand.tag`, `brand.footer`.
- Unused keys deleted: `brand.title`, `brand.less`, `brand.more`, `members.intro`,
  `combat.bestiary.intro`.
- Shortened: `auth.title` ("Entra en Rytta"), `auth.intro` ("Crea una campaña o únete a tu
  mesa.", after UI review finding 1), `roster.lede`, `bestiary.intro` (DM-only visibility kept),
  `tabletop.setup.intro`, `tabletop.player.lede` ("Pellizca para acercar.", now shown on phones).
- Sign-in eyebrow "RYTTA" removed (repeated the title). Header subtitle and `<footer>` removed;
  the phone bottom-bar clearance moved from `.page-footer` to `.has-bottom-nav .workspace`
  (`src/app/styles.css`), and the tabletop editor resets it (`tabletop.css`).
- `tests/e2e/identity.spec.ts`: heading name updated.

## Results

- `npm run check`: passed (354 unit/SQL tests, docs contracts, build).
- `npm run test:e2e`: 549 passed, 17 failed, 55 skipped on the first run. 15 failures were
  `ENOENT` on `test-results/` traces because a concurrent capture run cleared that folder; 2 were
  glossary phone-editor timeouts under the same CPU load. `--last-failed` rerun: 17 passed.
  After the sign-in fix, `identity.spec.ts` and `scaffold.spec.ts`: 59 passed.
- Captures 390x844 and 820x1180 before/after (dark, ES): `sheet-before-mobile.webp`,
  `sheet-after-mobile.webp`, `sheet-after-tablet.webp`.
- Bottom clearance probe on phone, scrolled to the end: Party (Player) 46.7px and Shops 46.7px
  between the last content and the bottom bar (`end-party-player.webp`, `end-shops.webp`); the
  old footer left about 48px.
- UI review: PASS on fingerprint `4e5a57e7…`, three low findings (one introduced, fixed; two
  pre-existing). Report: the review report. Focused re-review of the sign-in fix: PASS on fingerprint `903fa59a…`; it also noted a pre-existing low issue (the Google button label wraps left-aligned at 150% on phones).

## Not verified

- Real devices and iOS safe areas; hosted backend; demo mode and the combat page copy.
- Pre-existing, out of scope: the Player map overflows the tablet viewport (`tabletop.css`
  2216-2218) and Escape on the calibration dialog returns focus to `BODY`.
