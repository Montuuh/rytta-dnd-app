# RYT-147 — Activation and return figures from the database

Date: 2026-11-22. Definitions and how to run it: [docs/metrics.md](../../metrics.md). Query:
`scripts/reports/activation-return.sql` (read only, no migration).

## Acceptance

| Criterion | Evidence | Result |
| --- | --- | --- |
| Counts per weekly cohort with denominators and sample size, nothing that identifies a person or a campaign | Output columns: cohort week, campaigns, activation and return denominators, activated, solo preparation, returned, percentages; `tests/database/activation-report.test.ts` checks the column list and that no id, address or campaign name appears | Met |
| Demo content, fixture accounts and the owner's campaigns excluded by a stated rule | Rule in docs/metrics.md: demo never reaches the database; test accounts by `rytta_test_account`; the owner's accounts by `app_metadata.rytta_internal`, set on production for the owner's two accounts on 2026-11-22; campaigns before the launch left out. The test covers a test-account and an internal campaign | Met |
| Runs with the owner role only; nothing exposed to anon or authenticated | A plain query run by the owner; it creates no function, view, table or grant (test asserts the function count is unchanged and the file has no DDL or DML) | Met |
| Definitions and the way to run it documented; privacy page checked; wording change listed | docs/metrics.md; privacy check below | Met (owner action listed) |
| A first production run recorded with its date | 2026-11-22 12:52 UTC, below | Met |

## Known counts

- PGlite (`tests/database/activation-report.test.ts`, 4 tests passed): seven synthetic campaigns
  with known outcomes (activated and returned; solo preparation; first fight after 14 days;
  activated without a return on another day within 28 days; a test-account campaign; an internal
  campaign; one before the launch; one too recent). Evaluated on 2027-01-31: 5 campaigns,
  activation 2 of 4 (50.0 %), 1 solo preparation, return 1 of 2 (50.0 %). Evaluated on
  2026-12-10, before any return window closed: return denominator 0 and one return so far.
- Staging (synthetic seed, 2026-11-22): 2 campaigns in the week of 2026-11-16; one has an encounter
  started with five members and counts as activated; no 14-day window has closed yet, so the
  activation denominator is 0. This matches the seed.

## First production run

2026-11-22 12:52 UTC: no campaign in the report. Production holds 3 campaigns, all created before
the launch; none has been created since 2026-11-18. The report needs new tables to say anything.

## Privacy page

The privacy policy says the data is used "only" to sign in, show campaigns to the people you play
with and keep your game (`legal.privacy.collect.p2`). Counting campaigns in aggregate is another
use. Proposed wording for the owner to approve (not applied):

- ES: «El titular también cuenta, de forma agregada, cuántas campañas empiezan a jugar y vuelven a
  usarse cada semana, para saber si Rytta resulta útil. Esos recuentos no identifican a nadie ni a
  ninguna campaña.»
- EN: "The owner also counts, in aggregate, how many campaigns start playing and come back each
  week, to learn whether Rytta is useful. These counts do not identify anyone or any campaign."

The block B offline shell (RYT-128) also stores the app's own files in the browser; the section on
browser storage could add «los archivos de la propia aplicación, para que abra sin conexión; no
contienen datos tuyos».
