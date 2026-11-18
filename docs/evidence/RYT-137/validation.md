# RYT-137 - frontend notes

Screenshots in this folder are captured by the dice specs with `RYT_EVIDENCE=1` at 390px and
820px, in Hearth (`default`) and Parchment, in Spanish and English.

## Deliberate change: `combat-menu-danger`

The "Remove from combat" item of the DM row menu and of the combatant's DM menu no longer uses
Mantine's `color="red"`. It uses the theme's own `--danger` colour (class `combat-menu-danger`),
because the default red failed AA contrast on Parchment (3.28:1) once the menu was audited. The
item reads the same in Hearth and Bard; it loses the reddish hover background Mantine gave it.

## Known residuals (security review)

- The initiative modifier is declared by the client (the server rolls the d20; it does not know
  the sheet's bonus). The DM can read the expression of a roll.
- A DM re-roll sent straight to `reset_initiative_roll` for a hidden combatant is stored with the
  campaign's roll visibility. The frontend never offers it for a hidden combatant.

## Known, out of scope

- Mantine's menu: after Escape, pressing Enter on the menu button sometimes does not move focus
  into the reopened menu (existing behaviour, seen on the row menu before this delivery). The
  focus tests that reopen the menu wait for the items before choosing one.
- The combat error toast is translucent (`combat.css`); it is ticketed separately.
- Realtime is tested with a fake client only (`rolls-hub.test.ts`, which models the real client
  handing out a channel that is still being removed). The e2e fixtures run without realtime, so
  polling and the refetch triggers (a refused action, a changed combat state) are what they
  exercise.

## Local validation

| Check | Result |
|-------|--------|
| `npm run check` | 1105 unit and database tests, build clean |
| Dice, rest and combat browser specs | 275 passed at mobile, tablet and desktop |

Database coverage is in `tests/database/one-roll-per-fight-and-rest.test.ts` (public and PRE):
the roll link, a refused second roll that writes nothing, replay by request id, a new fight or a
spent roll allowing one new roll, the DM clear and re-roll, the one-roll state read, and denials
for anon, outsider, Player and cross-campaign DM. Browser coverage is the `RYT-137` specs in
`tests/e2e/dice.spec.ts`.

## Reviews

- Security review: safe to apply. Residuals are listed above (client-declared initiative
  modifier; a DM re-roll on a hidden combatant through a direct RPC call stored with campaign
  visibility) plus one pre-existing pattern: the lock is taken before the authorization check.
- Code review: ready after three rounds.
- Independent UI review: PASS on source snapshot
  `0c8584ebb861d659177b522655eb672065f938de041fe0b88b71e6679196dd87` after three re-reviews. Focus
  kept 32 of 32 times on the keyboard sequence that used to fail; detail panel 8 of 8.

## CI and release

- PR 22 merged to `main` as `00d6167`; on the PR, checks and the four browser test shards passed.
- https://rytta.pages.dev serves build `00d616789cdd-…` (checked 2026-11-18).

## Migration `20261204120000_one_roll_per_fight_and_rest.sql`

PRE lives in the production project, so PRE and `public` received the same DDL in the same apply.
The staging project was the earlier gate.

| Target | Recorded version | Stored statement | MD5 |
|--------|------------------|------------------|-----|
| Staging | `20261118144355` | same text | `665b1e7cfb28f112535adb8378ad9146` |
| Production (public and PRE) | `20261118204603` | 61589 bytes | `665b1e7cfb28f112535adb8378ad9146` |

The MD5 equals the committed file.

### Method

The committed text was staged server-side in 12 chunks; the MD5 of every chunk and of the whole
text was verified on the server. It was then executed in one block that re-checked the MD5 and
that no app-mode campaign had a live encounter or an open rest, and that dropped the staging
schema in the same block.

### Pre-checks (passed)

PostgreSQL 15 or later; constraint and key names as expected; nothing half-created; the old
function versions in place; no long-running transactions.

### Post-checks (passed)

- 6 new columns (public and PRE), 6 constraints, 10 indexes; the two one-roll indexes are unique
  and partial.
- The trigger is enabled on public and PRE.
- All nine functions are security definer with an empty `search_path`; `anon` has no execute;
  `authenticated` executes only the six public RPCs; `service_role` has none.
- Function definitions are MD5-identical to staging for public and private.
- RLS and policies unchanged; realtime publication unchanged; the prune job is active.
- 0 linked rolls right after the apply.
- Security advisor: the three new RPCs appear only as the expected "security definer function
  executable by authenticated" notices; no search-path or RLS finding.

## Acceptance

| Criterion | Evidence |
|-----------|----------|
| Second app roll refused whatever the log size; replay returns the first | Database tests (refusal, replay, busy fight), browser specs for initiative and hit dice |
| Only a campaign DM clears or re-rolls; after a clear the Player rolls once again | Database tests (DM only, live encounter only), browser specs for the row menu, detail menu and rest panel |
| Denial tests for anon, outsider, Player, cross-campaign DM | `tests/database/one-roll-per-fight-and-rest.test.ts` |
| Sheet, initiative and hit dice read the server state; refusal shows a reason and no number | Browser specs and the screenshots in this folder |
| Applied in PRE, then production, with catalog and advisor checks | Staging first, then one apply on the production project covering PRE and public, checks above |
| 390px and 820px, Hearth and Parchment, English and Spanish, keyboard and Escape, axe, UI review | Screenshots in this folder, axe and focus specs, UI review PASS above |

## Not verified

- Real realtime: the shared subscription is tested with a fake client only.
- Concurrency with parallel connections on hosted PostgreSQL.
- Real screen readers and WebKit.
- Owner smoke test with real sessions.

## Status

Done: every acceptance criterion has evidence, all three reviews are recorded, the migration is
applied and verified, merged and live. Follow-ups: RYT-140, RYT-141, RYT-142 and RYT-143.
