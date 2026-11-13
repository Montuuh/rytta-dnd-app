# RYT-031 verification

Date: 2026-11-03. A worktree branch, fast-forwarded to `main` at
`36ec84c` (RYT-028..030 merged). Decision record: [ADR 020](../../decisions/020-party-live-sharing.md).

Migration: `supabase/migrations/20261103130000_party_live_sharing.sql` (additive). **Not applied
to hosted Supabase (PRE or PROD)**; it must be rehearsed on PRE and then applied to production.

## Automated checks

| Check | Result |
| --- | --- |
| `npm run check` (typecheck, lint, contracts, 115 unit/SQL tests, build) | Pass |
| `npx vitest run tests/database` (PGlite, 64 tests incl. 5 new) | Pass |
| RYT-031 e2e (`characters.spec.ts -g RYT-031`, identity desktop/tablet/mobile) | 12 passed |
| Full e2e suite on a temporary config (ports 4273/4274, deleted afterwards) | 258 passed, 3 failed |
| Independent UI review | Pending (not run during implementation) |

The 3 failures are `identity.spec.ts` Google sign-in tests that assert the literal
`127.0.0.1:4174` callback; they fail only because the temporary config uses port 4274.
They were not re-run on the default ports (held by parallel runs).

## SQL coverage (`tests/database/party-sharing.test.ts`)

- Player sees own character plus shared, assigned teammates; each row has exactly the live
  columns, and the payload contains no gold/water/rations or build notes. Base `characters` and
  `character_resources` reads stay owner-only.
- Non-shared and unassigned characters are hidden from other Players; the hidden owner still
  sees its own row.
- DM sees all characters with `shares_live`; only real toggles are audited (one
  `characters:UPDATE` with before/after `shares_live`).
- Denials: anon (permission denied), outsider, Player toggle, cross-campaign DM (other campaign
  id or foreign character), removed Player, direct `update` on `characters` by Player and DM.
- PRE mirror: migrations up to RYT-030, ETL copy into PRE, then this migration. `pre.characters`
  gains the column, `pre.get_party_overview` / `pre.set_character_live_sharing` work against PRE
  membership only and carry no `public.`/`private.` references.

## e2e coverage (`tests/e2e/characters.spec.ts`, RYT-031 tests)

- Player: own full card plus "Compañeros" section; Bea's live card shows HP 9/24, +3 temporary,
  AC shield 16, exhaustion 2/6, conditions list; Cato (not shared) absent; no teammate gold.
  axe clean, no horizontal scroll, all buttons >= 44px, overview re-polled within 15 s.
- DM: per-card toggle with `aria-pressed`, tooltip on focus, keyboard Enter toggles and keeps
  focus, RPC payload checked, "Oculto al grupo" note on hidden cards.
- DM sheet: "Historial" opens a drawer titled "Historial de Arin" with resource diff and the
  sharing change; Escape closes and returns focus. Player sheet has no history control.

## Screenshots (390px and 820px)

`party-player-mobile.png`, `party-player-tablet.png`, `party-dm-mobile.png`,
`party-dm-tablet.png`, `sheet-history-mobile.png`, `sheet-history-tablet.png`.

## Not tested

- Hosted Supabase (PostgREST/Auth) integration and the real PRE: PGlite only.
- `npm run db:types` was not run (no local Supabase); `src/shared/api/character-functions.ts`
  carries the reviewed RPC contract overlay.
- Light theme, English and 150% text were not captured for the new views (Spanish dark only).
