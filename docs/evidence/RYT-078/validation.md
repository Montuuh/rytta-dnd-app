# RYT-078 verification: one username per account

Delivery of 2026-11-09 on `main`. The user asked to design and implement a username and to decide
between one per account and one per campaign. Decision and options: [ADR 036](../../decisions/036-account-username.md).
Design flow: [design-flow.md](design-flow.md).

## What changed

- **Decision:** one username per account. Characters already name people inside a campaign; the
  username names the person behind them, the same in every table.
- **Database** (`supabase/migrations/20261113120000_profiles_username.sql`): `public.profiles`
  (RLS on, no client grants, unique on `lower(username)`, 3–24 `[A-Za-z0-9_]`, reserved names),
  `get_my_username`, `username_available`, `set_my_username`, and `private.member_name` used by
  `list_campaign_members` and `get_character_history` (signatures and grants unchanged).
- **Interface:** "Your username" first in the Settings drawer; a hub card while the account has
  none (suggestion from the email, "Use this name", "Later" for the session, a focused
  confirmation after saving); the username above the email in the account menu and in the
  Profile button's accessible name.

## Database environments

| Step | Result |
| --- | --- |
| Hosted history before | Matched the repo (last: `sheet_play_lock_history`); no `profiles` in `public` or `pre` |
| PRE rehearsal (remapped DDL only, `execute_sql`) | `pre.profiles` with RLS, no table grants, anon cannot execute, `pre.list_campaign_members` uses `pre_private.member_name`; `public` untouched |
| PRE behaviour (transaction rolled back by an exception) | set → `Rehearsal_078`, get → same, own name available, `Admin` → `Username reserved`, direct `select` on `pre.profiles` → permission denied |
| PROD (`apply_migration profiles_username`) | `public.profiles` RLS on, no table grants, anon cannot execute the three RPCs, `private.member_name` not executable by clients, both readers use it; 0 rows; PRE skipped by its guard |
| Advisors (security) | Only the expected INFO notices: RLS without policies on `profiles` (access is through RPCs) and security-definer RPCs executable by `authenticated`, as for every Rytta RPC |

Hosted records the migration as version `20261109223330`, as earlier deliveries are recorded at
their apply time.

## Checks

| Check | Result |
| --- | --- |
| `npm run check` | Pass: typecheck, lint, architecture, docs, AI contracts, 48 files / 340 unit and SQL tests, build |
| `tests/database/profiles.test.ts` (PGlite) | 6 pass: anon denied every RPC and the table; validation, case-insensitive uniqueness, reserved names; no direct row access for a signed-in user; members list shows the username to the campaign DM and refuses the Player, an outsider and another campaign's DM; fallback Google name → username in the sheet history; PRE mirror with separate rows and anon denied |
| `tests/database/pre.test.ts` | The ETL now copies 39 tables (adds `profiles`) |
| `src/features/auth/domain/username.test.ts` | Rules and email suggestions |
| `tests/e2e/username.spec.ts` (identity projects, 390 / 820 / 1440) | 12 pass: prompt, suggestion, too short, reserved while typing, taken, available, `aria-describedby`, axe in the error and available states, focused confirmation, Close and Later return focus to the heading, Later holds on reload, Settings current/invalid/available/saved with focus kept on the button, load error with a keyboard retry that keeps focus and then focuses the field |
| `npm run test:e2e` | Final run on the reviewed source: 530 passed, 0 failed, 55 skipped (matrix limits). An earlier run concurrent with the ui-ux browser review had 4 mobile failures in `combat.spec.ts` / `glossary.spec.ts` (not touched here) that passed alone (48/48) and in the final run |

Screenshots: `hub-prompt-identity-{desktop,tablet,mobile}.png`, `settings-identity-{desktop,tablet,mobile}.png`.

## UI review

Independent `ui-ux` review: [review.md](../ui-review/ryt-078/review.md). Round 1 CHANGES_REQUIRED
(R78-1 save button lost focus, R78-2 load error without retry, P3s), round 2 CHANGES_REQUIRED
(R78-5 the retry unmounted itself, R78-6 load error colour), round 3 **PASS** on source
`32abd5de2e2270de7ab9876cf29401a3c51fceab1a7ea6e2243cfeff8074eef9`; `npm run check:ui-review` passes.

## Not tested

- Hosted Supabase end to end through the browser (PGlite and the HTTP fixture stand in; the
  hosted RPCs were verified with SQL only).
- A real screen reader, WebKit and Firefox.
- Two people taking the same name between the availability check and the save (the unique index
  decides; the RPC answers `Username taken`).
