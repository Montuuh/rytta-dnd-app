# Deployment and rollback

## GitHub Pages

The frontend is static; Supabase is a separate backend. Hash routes avoid rewrite support.

The current repository has Pages enabled with GitHub Actions and public Supabase variables
configured. Production Auth URLs are also configured. See the
[configuration follow-up](evidence/RYT-001-002/production-configuration.md). The initial
frontend is published at https://montuuh.github.io/rytta-dnd-app/ with a verified Google
callback and session reload; see [deployment evidence](evidence/RYT-001-002/pages-deployment.md).
The second-account test is deferred by the user. Pushes to main trigger publication automatically;
verify public behavior after each deployment and review backend compatibility before pushing.
The steps below also serve as setup instructions for new environments.

1. Create/connect a GitHub repo and push only when requested.
2. Settings → Pages: choose GitHub Actions.
3. Keep VITE_DATA_MODE=demo for the architecture preview. For future live data, set
   repository variables VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY and
   VITE_DATA_MODE=supabase. Never use secret/service-role keys.
4. Push the intended revision to main, or dispatch the Quality workflow manually. Its `checks`
   job and the four `e2e` shards run in parallel; the `deploy` job runs only on main after both
   pass, so a failing check never publishes.
5. The deploy job takes base_path from configure-pages, builds dist and publishes it.
6. Verify public assets/favicon, refreshed /#/inventory, mobile navigation and browser errors.
   Real-data releases additionally require staging Auth/RLS tests.

No database migration runs from the Pages workflow. The workflow also permits manual dispatch and defaults
to demo. Hosted two-account authentication/invitation tests must pass before live campaign use.

## Supabase production

Provision separately. Apply reviewed migrations with the CLI process, configure providers,
Google sign-in and exact Auth redirect URLs, then test anon/player/DM/outsider accounts.
See [Google and Supabase setup](setup-google-supabase.md). In-app invitations need no SMTP.
Secrets stay server-side. Storage policies and Realtime setup are later tickets.
Set backup/restore ownership and retention before real campaigns.
PKCE callbacks return to the deployed base URL with query parameters; never implicit fragments.

## Releases with a paired migration

Some database changes ship in two parts: an additive part applied ahead of time and a part the
deployed frontend cannot follow, applied together with the frontend release. Latest case
(ADR 043, RYT-104/105/107), completed on 2026-11-16: part 1
`20261120120000_items_decimal_catalogue_proposals.sql` (hosted version `20261116002653`) and
part 2 `20261121120000_items_player_authoring_close.sql` (hosted version `20261116081923`) are
both applied to production. Release order for a paired migration:

1. Confirm the hosted history has part 1 and not part 2, and that `private.money_scale()`
   returns 0 in production.
2. Push the frontend to main and wait for the Quality workflow to deploy it.
3. Apply part 2 right after the deployment finishes. Between the two steps the new frontend
   runs on whole gold (a typed cent amount is refused, never rounded) and the API still lets
   Players create items; no data is lost.
4. Verify `money_scale()` is 2, a Player receives `Forbidden` from `save_item_definition`, and
   the basic catalogue imports with cent prices. Retire the PRE rerun step in
   [PRE environment](pre-environment.md).

Before part 2, do not merge item definitions in production: a `merge` ledger row cannot be
parsed by the previous frontend. After part 2, rolling back to the previous frontend is not
safe: it parses gold as integers and cannot read cent amounts or `merge` rows. Fix forward
instead; a corrective migration can return both switches to their part-1 values but does not
remove amounts already stored with cents.

## Vercel fallback

Vite preset, npm ci, npm run build, output dist, base /. Same hash routes work without
rewrites. Set public environment variables and allowlist the stable domain in Supabase.
Preview domains need an explicit auth policy. No Vercel project is provisioned now.

## Rollback

Frontend: dispatch the last known-good revision, then verify public URL/data compatibility.
Database: forward corrective migrations; never delete applied migrations or reset production.
Use tested backups before destructive changes. Prefer expand/contract schema changes.
