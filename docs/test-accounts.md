# Test accounts

Email and password sign-in (RYT-157) makes disposable accounts possible without Google. They are
used for hosted checks that need a real session: realtime delivery, Storage uploads, concurrent
requests and account deletion.

## What exists

`scripts/test-accounts.mjs` writes SQL that creates confirmed email accounts in the shared Auth
project. It never connects to Supabase and never prints the password.

- The password and the inbox live only in `.env.local` (`RYTTA_TEST_PASSWORD`,
  `RYTTA_TEST_INBOX`). A missing password is generated and appended.
- Each account is `<inbox local part>+<label>@<inbox domain>`, so every message reaches the owner's
  inbox. Accounts carry `raw_user_meta_data.rytta_test_account = true`; the SQL refuses to change
  an existing account without that mark.
- Default labels: `pre-dm`, `pre-player`, `pre-outsider`. `--seed-pre` adds the PRE campaign
  "Mesa de pruebas" owned by `pre-dm` with `pre-player` as a Player, created through the PRE
  application functions. `--disposable` adds one `disposable-<timestamp>` account for a deletion
  check.

Auth is shared by PRE and production, so a test account can also sign in on production. It has no
production data unless a check creates some; the production test accounts are the owner's own
Google accounts.

## Use

1. `node scripts/test-accounts.mjs --seed-pre --out <scratch>/test-accounts.sql`
2. Apply the file as the project owner (database connector or SQL editor), then delete it: it holds
   the password hash.
3. Sign in with the email form on a local dev server. Each port keeps its own session, so the DM
   can use `localhost:5173` and the Player `localhost:5174` (both allowed as Auth redirect URLs and
   Turnstile hostnames). Local development reads the `pre` schema.

## Removing them

Delete a test account from Auth (dashboard or `delete from auth.users where ...` as the owner) or,
for a production deletion check, through the app's own account deletion. Foreign keys to
`auth.users` cascade or set null (migration `20261125120000_account_deletion_export`).
