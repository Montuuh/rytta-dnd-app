# RYT-145 — Creatures, encounters and live sessions

## What was exercised

- The contextual bestiary kept its encounter and filters while adding three creatures plus a different creature. Browser tests covered bookmark feedback, comparison, campaign variants, a change to just the second wolf and replay after a lost add response.
- The builder linked a draft to a scene and reward, recalculated difficulty when attendance changed, handled zero attendees and opened a duplicate with independent combatants. All 18 builder browser cases passed on mobile and tablet.
- The combat console retained its selected target across a remote turn change. Finishing combat requires the encounter menu and a summary. Table setup exercised the public projection, disconnection, calibration, map tools and the display with and without a map. The combat and tabletop suite passed 182 applicable scenarios across two runs. Eleven scenarios were intentionally skipped by the device matrix. Six portrait tests were updated to open the named detail control.
- The three-screen journal was exercised at 390 and 820 pixels. A DM granted a potion, saved a pending reward, a private note and a public recap, skipped edits, then withdrew the publication. A separate player context requested only the recap. A stale submission kept the local draft until the DM chose to reload. The DM's player preview also opened the published recap.
- A first pass found that Escape closed two setup dialogs, the combat confirmation had insufficient contrast, and long bestiary tab labels clipped at 150% text. Browser regressions were repeated after correction. The public example images for the changed DM console were recaptured in both languages.

## Hosted database

The migration for plans and continuity matched the committed 13,666 bytes and MD5 `c6e575cfb103fc12e8cf9a53b3c83c44` in staging (version `20261119151333`) and production (`20261119151352`). A rollback-only transaction in staging and another in hosted PRE exercised saving a plan, replaying it, duplicating it, recording notes and sharing a recap. The player could read the recap and was denied the private journal. The outsider was denied the recap.

The full index-contract test found three references that needed complete indexes. A second migration added them in each schema. Its 701 bytes and MD5 `66e11a048dfff11c90e8d60081fd7ee0` matched staging (`20261119151710`) and production (`20261119151730`). The catalogs confirmed all six indexes across the two production-project schemas.

The six RPCs in each schema have authenticated execution, with no anonymous execution. All six private table copies have RLS enabled and deny direct client reads. The security advisor reports authenticated security-definer functions and policy-free private tables. Authorization is checked by the RPCs. Aggregate checksums of the existing production encounters (`1642d857bf1feb49979eefe53f124a95`) and combatants (`e6b131093e408d63d53b9964e5ad94c2`) matched before and after both migrations.

The browser sessions used deterministic fixtures. Physical projection and two live Google accounts were outside these checks. The hosted checks used database roles inside rolled-back transactions.

## Review corrections

The first independent review identified ambiguous account/game wording, draft loss on skip, a missing retry action, focus loss and intermittent accessibility and loading failures. The final implementation distinguishes game closure from sign-out, keeps typed notes, offers a safe retry after transient failure and focuses the step heading. Mobile confirmation actions stack, and the public preview makes stale data visible. The end-menu, attendee selection and journal regression tests exercise these cases. The complete unit and database suite passed 1,109 tests.

## Final local verification

The independent interface re-review passed for the submitted UI fingerprint. It ran 16 focused browser scenarios and 18 repetitions at 390 and 820 pixels. Two minor observations remain: Skip and Next coincide when no encounter is selected, and the earlier variant-footer density observation was not reassessed in that final pass.

GitHub Actions declined to start all five jobs because of account billing or spending limits. The complete local browser run recorded 1,405 passing scenarios, 142 device-matrix skips and three failures across two tests. The table setup regression now navigates through the public preview and checks that Back restores focus twice. The layout regression measures the two dialog buttons in the same browser frame: an initial measurement had compared coordinates from different moments as the dialog moved. All three initially failing scenarios then passed without retries, for 1,408 verified scenarios. An earlier local browser run was interrupted when a concurrent build replaced its test bundle; the complete run used a dedicated build.
