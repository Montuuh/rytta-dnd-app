# RYT-160: an offline reload inside a campaign keeps its name and navigation

Date: 2026-11-23 (block O). The owner chose the recommended options on the block O options page.
Decision record: [ADR 052](../../decisions/052-campaign-shell-on-device.md).

## What changed

- **What the device keeps (P1 A).** `src/features/campaigns/domain/campaign-shell.ts`.
  - Only for the campaigns opened on the device: the campaign id, name, the account's role and the
    enabled modules. No description, party level, characters or anything about other members.
  - Stored under one `localStorage` key per account, validated on read; unreadable content, and a
    record filed under another campaign's id, are discarded.
  - Campaigns entered through the admin panel (RYT-153) are not kept.
- **How long (P2 A).**
  - Every successful campaign list refreshes the kept campaigns and drops those no longer listed
    (left, removed, deleted).
  - Signing out, or opening the app signed out for any reason but a lost connection, removes every
    account's; signing in removes every other account's.
- **What is shown (P3 A).** `src/app/layout.tsx`, `CampaignBoundary`,
  `src/features/campaigns/ui/campaign-shell.tsx`.
  - While the campaign list has never loaded on the page and cannot load now, the header names the
    campaign and the navigation is drawn from the kept modules.
  - Each section shows its title and the existing offline notice; no screen runs on kept data.
  - Nothing is requested or offered with kept data: members, rest requests, the admin banner and
    leaving the campaign are off until the list loads.
  - When the network returns, the list loads and so do the screens.

## Acceptance

| Criterion | Evidence | Result |
| --- | --- | --- |
| The owner decides whether the campaign name, role and modules may be kept on the device | Block O options page, 2026-11-23: recommended options P1 A, P2 A, P3 A; [ADR 052](../../decisions/052-campaign-shell-on-device.md) | Met |
| A cold offline reload inside a campaign shows its name and navigation with the offline line, and nothing else from the campaign is stored | `tests/e2e/offline-shell.spec.ts` "RYT-160 a reload without signal inside a campaign keeps its name and navigation" at 390 and 820 px (ES Hearth, EN Parchment): stored keys are exactly id, name, role and modules, no character name; after the offline reload the header names the campaign, the section title and offline notice show, the navigation reaches Combat, axe passes, Retry is 44 px; the screen loads when the network returns. `campaign-shell.test.ts`: stored fields, per account, sync and pruning, unreadable and mismatched records, clearing | Met |
| If no: the decision is recorded and the placeholder offers a way back | Not applicable: the owner chose yes | n/a |
| Browser test of the cold offline reload inside a campaign at 390 and 820 px | Same spec, identity-mobile (390) and identity-tablet (820); also "a campaign never opened on this device has no shell offline" and "signing out removes the kept campaigns" | Met |

## Checks

- `npm run check`: typecheck, lint, contracts, 1238 unit and PGlite tests, build.
- `npm run test:e2e`, full suite (before the security fixes): 1594 passed, 5 failed, 179 skipped.
  - `identity.spec.ts` invitation instructions (desktop) and `character-sheet.spec.ts` at 150 %
    (mobile) passed when run alone.
  - `legal.spec.ts` "the signed-out landing links to both pages" (tablet and mobile) passed alone,
    twice; it also failed in block N's full run.
- After the security and review fixes: `offline-shell.spec.ts` 38 of 38 at 390 and 820 px with 6
  workers; `identity.spec.ts` and `table-screen.spec.ts` passing.
  With 15 workers two tests stopped at the first page load ("Cargando…" before any offline step)
  and passed on the rerun.
- Security review: no blocking finding. Fixed: admin-supervised campaigns are not kept; a record
  must match its campaign id; nothing is requested or offered with kept data; a start without
  signal no longer clears the kept campaigns.

## UI review

- First round: CHANGES_REQUIRED.
  - Sections that are not modules (DM home, members, session, a character sheet) were titled
    with the campaign name or the wrong module.
  - "Vista jugador" was offered with a kept campaign, and said there were no players.
- Fixed: the offline title uses the document title's route mapping; the Player view switch is
  hidden while the campaign comes from the device.
- Second round: CHANGES_REQUIRED. The table screen (`/tabletop-table`) was titled "Page not
  found" (its document title online too), and the English DM home differed in case from its tab.
- Fixed: `/tabletop-table` is titled "Mesa" / "Tabletop" (also its document title), with the page
  margin it lacks; the DM home uses the same copy as its tab.
- Third round: PASS.
- Minor notes left:
  - the English table screen's document title says "Table" while its title says "Tabletop";
  - offline, the table screen offers no way back but the browser's;
  - Escape does not close an empty player picker (also online);
  - a Player reloading on a disabled module sees its title.

## Not tested

- A real phone: the offline worker and `localStorage` on iOS Safari (which may purge storage after
  7 days without use) and Android.
- An account switch in the browser (unit test only) and a tampered `localStorage` value in the
  browser (unit test only).
- Realtime with a kept campaign id against hosted Supabase (no subscription is opened with kept
  data).
