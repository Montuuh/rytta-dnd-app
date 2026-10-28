# PRE environment and bulk ETL

Rytta uses one Supabase project (`ekscdsmniukuxqjixapu`) with separate application schemas:
production `public` / `private`; development `pre` / `pre_private`. Auth users, providers,
sessions, project URL/keys and compute are shared. There is no additional paid project.
This does not bypass Google authentication or create an independent security boundary.

## Local frontend

Keep `.env.local` ignored, with the existing public project URL/publishable key and:

```dotenv
VITE_DATA_MODE=supabase
VITE_BASE_PATH=/
```

Run `npm run dev`. Runtime selection uses `pre` for the Vite development server and
localhost/127.0.0.1/IPv6 loopback previews, and `public` for the hosted production build.
A build opened locally also uses PRE. No VITE_ schema setting can redirect localhost to
PROD. Confirm SDK REST requests carry `Accept-Profile: pre` for reads and
`Content-Profile: pre` for writes. Auth requests have no database profile and remain shared.
Keep the local port's callback URL in the existing Auth redirect allowlist.

The active local URL is `http://localhost:5174/`, now registered in Supabase Authentication
→ URL Configuration → Redirect URLs, together with `http://localhost:5174/?sb_flow_id=*`
for the SDK's PKCE correlation query. Production has its corresponding exact base and
`https://montuuh.github.io/rytta-dnd-app/?sb_flow_id=*` variant. The Site URL stays the
production Pages base. If
the local port or base path changes, add its exact callback URL to that list; otherwise
Supabase falls back to production. Include the same query variant for each new base.
Start on a fixed port with
`npm run dev -- --port 5174 --strictPort`. A different hostname such as 127.0.0.1 requires
its own allowed URL. Do not add broad host wildcards or change the shared Site URL to PRE.

`npm run check:supabase` checks localhost:5174 and production callbacks, including the
SDK's PKCE correlation query. For a different base use
`npm run check:supabase -- http://localhost:5174/`. This public-only smoke checks allowlist
behavior with an invalid token; it does not complete Google sign-in or create a session.

Production Pages environment variables remain unchanged. Do not test local mutations
through `public` RPCs. Schema evolution is still reviewed migration SQL: rehearse against
PRE, validate grants/RLS, apply the production migration within the authorized delivery,
then refresh PRE when appropriate. The ETL never promotes PRE rows into PROD.

## Script commands

Use Node 24.13+ and a Supabase **Management API personal access token** with database-write
permission, set only in the terminal as `SUPABASE_ACCESS_TOKEN`. A publishable/secret SDK key
is not a Management API token. Never store the token in VITE_, tracked files, browser code
or command-line arguments. There is no need for Docker or a database password.

```powershell
npm run pre:plan
npm run pre:sync
npm run pre:sync -- --replace-pre
npm run pre:restore -- BACKUP_UUID
```

`pre:plan` only reports the proposed table copies and row counts in a read-only repeatable
read transaction. `pre:sync` creates a first PRE; it refuses to replace an existing one.
`--replace-pre` is explicit and retains the complete previous PRE schemas in PostgreSQL,
with application-role usage revoked, before making a fresh copy. `pre:restore` restores
one registered backup and keeps the current PRE as another backup. No tables are dropped.
External views/foreign keys depending on PRE block replacement/restore rather than silently
changing those dependencies. Reports go to ignored `.tmp/pre-etl/`; backup IDs identify
server-side schema/data backups, not downloaded files. Clean up old backups only through
a separately requested retention operation. They occupy space in the shared database.

For a token-free alternative, render the exact reviewed SQL and execute it through the
existing trusted database administrator/MCP connection or Dashboard SQL Editor:

```powershell
npm run pre:plan -- --print-sql
npm run pre:sync -- --replace-pre --print-sql
npm run pre:restore -- BACKUP_UUID --print-sql
```

The registry `supabase/environments.json` pins the project and schema names. The script
accepts no arbitrary source, target, project or SQL. Maintenance functions in pre_admin
are SECURITY INVOKER, owner-only, and not exposed through PostgREST. Browser roles cannot
execute refresh, inspect backups or access snapshots. Do not grant them those privileges.
The CLI has no automatic retry: after a timeout/unknown response, inspect the database
before repeating a refresh. Successful API reports contain counts and backup IDs, not data.

## Copy contract

The source is the live public/private schema, not a hand-maintained table list. A stable
snapshot copies ordinary application tables and their rows, PK/unique/check constraints,
indexes, defaults, foreign keys, functions, RLS/policies, table/column/function grants and
user triggers, remapping qualified references to PRE. Data is inserted before foreign keys
and triggers are installed, preserving original audit rows without generating duplicates.
PRE helpers only authorize against PRE membership. Shared `auth.users` UUIDs remain intact.
Auth sessions/provider tokens/signing keys, Storage objects, Realtime publications, cron
and project configuration are not cloned by this application-table ETL.

Unsupported views, sequences/identity, partitions, foreign tables, generated columns or
application-defined types cause preflight failure; extend and test the copier explicitly
before using those objects. Functions requiring an unsupported dependency fail atomically.
This intentionally avoids claiming general-purpose Supabase-project backup coverage.

The first hosted copy contains six public tables and one private idempotency table.
Maintenance migrations install the copier and expose PRE after creation. Local/empty
instances can apply all migrations before copying; `pre:sync` reruns the exposure SQL once
PRE exists. The authenticator role override preserves any existing role list and otherwise
starts with public/graphql_public, appending pre. Future schema exposure changes must
update that override too; Dashboard settings alone may be shadowed. Rollback of exposure
is a reviewed role-setting change, not dropping the PRE schemas while still exposed.

## Recovery and verification

Every refresh is one transaction. A failure restores the old PRE and never commits partial
data. A successful replacement keeps a registered full schema+data backup. Restore by its
UUID, then verify counts and roles. Test new PRE changes before switching the frontend.
Backup schemas are administrative recovery artifacts; their function bodies are intended
to work after restoring the original pre/pre_private names, not as runnable environments.

Run `npm run check`, `npm run test:db` and `npm run test:e2e`. The tests cover anon,
outsider, Player and DM, PRE-only writes/audit, table row equality, explicit replacement,
full backup restore, unsupported/external dependencies and development/production routing.
Hosted SQL assertions are run in a transaction and rolled back; they do not replace a
real two-account Google/Auth/PostgREST end-to-end check.

References:

- https://supabase.com/docs/guides/api/using-custom-schemas
- https://supabase.com/docs/guides/auth/redirect-urls
- https://supabase.com/docs/reference/api/v1-run-a-query
- https://supabase.com/kb/troubleshooting/pgrst106-the-schema-must-be-one-of-the-following-error-when-querying-an-exposed-schema
