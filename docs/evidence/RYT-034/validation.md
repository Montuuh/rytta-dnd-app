# RYT-034 verification

Date: 2026-11-03. A worktree branch, merged with `main` at `5f742cb`
(RYT-028..033 included). Decision record: [ADR 022](../../decisions/022-player-trades.md).

Migration: `supabase/migrations/20261103150000_player_trades.sql` (additive: two tables, one
widened check constraint, RPCs, guarded realtime publication and PRE mirror). **Not applied to
hosted Supabase (PRE or PROD)**; rehearse on PRE, then apply to production.

## Automated checks

| Check | Result |
| --- | --- |
| `npm run check` (typecheck, lint, contracts, 159 unit/SQL tests, build) | Pass |
| `tests/database/trades.test.ts` (PGlite, 6 tests) | Pass |
| `tests/database/pre.test.ts` | Initially failed: the ETL dry-run table count moved 21 → 23; assertion updated |
| `tests/e2e/trades.spec.ts` (identity desktop/tablet/mobile, two browser contexts) | 6 passed |
| Full e2e suite on a temporary config (ports 4773/4774, deleted afterwards) | 304 passed, 2 skipped, 3 failed |
| Independent UI review | Pending (not available during implementation) |

The 3 failures are the `identity.spec.ts` Google sign-in tests that assert the literal
`127.0.0.1:4174` callback; they fail only because the temporary config serves on 4774.

## SQL coverage (`tests/database/trades.test.ts`)

- Full flow: invite, partner state, accept, offers on both sides, confirmation, any change clears
  both confirmations, stale revision rejected, double confirmation, atomic completion (quantities,
  merge into the receiver's existing loose stack, net gold), `trade_in`/`trade_out` ledger rows
  readable by each Player for their own character and by the DM for both, `trade_completed` and
  `character_resources:UPDATE` audit rows, history and `recent` state. No DM item value leaks.
- Validation: insufficient gold and quantity, another character's stack, fractional, duplicate
  and more than 8 lines, negative gold, equipped item; failed attempts write nothing.
- Atomicity: a stack used or a balance lowered after the partner confirmed makes the final
  confirmation fail and nothing moves.
- Lifecycle: one active trade per character (both roles), decline (initiator sees it in `recent`),
  invitation expiry, open-trade inactivity expiry, cancel by either side, cancel idempotency.
- Denials: anon (permission denied on RPCs and tables), outsider, DM of another campaign
  (campaign id swap and foreign character), Player acting for another character or inviting an
  unassigned one, non-participant Player (no rows through RLS, every RPC Forbidden), partner
  editing the initiator side, removed member, direct writes by Player and DM. The campaign DM
  reads the trade and acts only as a previewed assigned character.
- PRE mirror: migrations up to RYT-032, ETL copy into PRE, then this migration. `pre.trades`
  exists, a full trade completes in PRE, PRE functions authorize only against PRE membership and
  carry no `public.`/`private.` references.

## e2e coverage (`tests/e2e/trades.spec.ts`, mocked RPCs shared by two contexts)

- Arin invites Bea from her teammate card; Bea gets a centered dialog with focus on "Abrir el
  trueque", a countdown timer, Escape postpones to a focused dock, the dock reopens it.
- Both windows open; Arin adds two potions through the picker and sets gold; Bea sees the slot and
  gold, adds her dagger and accepts; Arin sees the acceptance; Arin changes gold and Bea's
  acceptance is cleared with a visible notice; both accept; both see the completion summary;
  server gold and inventories match; history shows the trade. No page errors.
- Decline (initiator gets a notice), the character picker, picker bottom sheet on phones, Escape
  closes the picker then minimizes the window to the dock, cancel (partner gets a notice), Bea in
  English with the light theme.
- Axe (WCAG 2.1 AA) on invitation, window, picker and summary; 44px dialog buttons; no horizontal
  scroll. Realtime is stubbed closed in e2e, so these runs exercise the polling fallback.

Screenshots (390px `-mobile`, 820px `-tablet`): `invite`, `invite-en-light`, `window-empty`,
`window-en-light`, `picker`, `window-partner-accepted`, `window-unlocked`, `done`, `history`.

## Not tested

- Hosted Supabase: migration not applied; Realtime `postgres_changes` delivery with RLS, Auth and
  PostgREST against the real schema are untested. PGlite has no `supabase_realtime` publication,
  so the publication branch only ran as a skipped guard.
- Two real devices/accounts; iOS Safari; screen readers beyond accessible-name assertions.
