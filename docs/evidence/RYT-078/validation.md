# RYT-078 verification: one username per account

Delivery of 2026-11-09 on `main`. The user asked to design and implement a username and to decide
between one per account and one per campaign. Decision and options: [ADR 036](../../decisions/036-account-username.md).
Design flow recorded with the review.

## What changed

- **Decision:** one username per account. Characters already name people inside a campaign; the
  username names the person behind them, the same in every table.
- **Database** (`supabase/migrations/20261113120000_profiles_username.sql`): `public.profiles`
  (RLS on, no client grants, unique on `lower(username)`, 3–24 `[A-Za-z0-9_]`, reserved names),
  `get_my_username`, `username_available`, `set_my_username`, and `private.member_name` used by
  `list_campaign_members` and `get_character_history` (signatures and grants unchanged).
- **Interface:** "Your username" first in the Settings drawer; a dialog after every sign-in, on any
  page, while the account has none (suggestion from the email, "Use this name", "Later" or Escape
  until the session ends, a focused confirmation after saving; amended 2026-11-10 from a hub card); the username above the email in the account menu and in the
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
| `npm run check` | Pass: typecheck, lint, architecture, docs, 48 files / 340 unit and SQL tests, build |
| `tests/database/profiles.test.ts` (PGlite) | 6 pass: anon denied every RPC and the table; validation, case-insensitive uniqueness, reserved names; no direct row access for a signed-in user; members list shows the username to the campaign DM and refuses the Player, an outsider and another campaign's DM; fallback Google name → username in the sheet history; PRE mirror with separate rows and anon denied |
| `tests/database/pre.test.ts` | The ETL now copies 39 tables (adds `profiles`) |
| `src/features/auth/domain/username.test.ts` | Rules and email suggestions |
| `tests/e2e/username.spec.ts` (identity projects, 390 / 820 / 1440) | 18 pass: the dialog after sign-in with a neutral suggestion, too short, reserved while typing, taken, available, `aria-describedby`, axe on the whole dialog in error, available and saved states, saved title with focus on Close and focus on the page after; the dialog on a campaign route; it waits for the Settings drawer and keeps focus after it closes; Later and Escape hold on reload and a new sign-in asks again; an account with a username is never asked; Settings current/invalid/available/saved with focus kept on the button; load error with a keyboard retry |
| `npm run test:e2e` | Final run on the reviewed source (sign-in dialog): 536 passed, 0 failed, 55 skipped (matrix limits). An earlier run concurrent with a UI review browser review had 4 mobile failures in `combat.spec.ts` / `glossary.spec.ts` (not touched here) that passed alone and in later runs |

Screenshots: `dialog-identity-{desktop,tablet,mobile}.png`, `settings-identity-{desktop,tablet,mobile}.png`.

## UI review

Independent UI review: the review report. Round 1 CHANGES_REQUIRED
(R78-1 save button lost focus, R78-2 load error without retry, P3s), round 2 CHANGES_REQUIRED
(R78-5 the retry unmounted itself, R78-6 load error colour), round 3 PASS. The sign-in dialog amendment: round 4 CHANGES_REQUIRED (R78-7 focus escaped
behind the dialog when it opened as Settings closed), round 5 **PASS** on source
`bb6896e118b06ac90fd4271ad7a470efee23743d67c17a780a6d6f2923819696`; the UI review check passes.

Open P3 notes: the overlay leaves the ~15 px scrollbar gutter uncovered at 820 px; "Later" is
kept per browser tab (`sessionStorage`), so a new tab of the same session asks again.

## Not tested

- Hosted Supabase end to end through the browser (PGlite and the HTTP fixture stand in; the
  hosted RPCs were verified with SQL only).
- A real screen reader, WebKit and Firefox.
- Two people taking the same name between the availability check and the save (the unique index
  decides; the RPC answers `Username taken`).
