# Production configuration follow-up

Date: 2026-10-28 (Europe/Madrid). The user authorized configuring the outstanding
production prerequisites, including the previously listed commit/push work. The user
explicitly deferred the second-real-account DM/Player validation.

## Completed external configuration

- Enabled GitHub Pages for `Montuuh/rytta-dnd-app` using GitHub Actions (`build_type=workflow`).
  Its configured URL is `https://montuuh.github.io/rytta-dnd-app/`.
- Set repository Actions variables `VITE_DATA_MODE=supabase`, `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_PUBLISHABLE_KEY` from the already-verified public frontend configuration.
  No private key, database password or Google Client Secret was transmitted or committed.
- In the Supabase dashboard, changed Site URL to the exact Pages base including its
  trailing slash and added that exact allowed redirect. Preserved the existing local
  URLs and added `http://127.0.0.1:4182/` for the current local preview.
- Verified the saved dashboard state and captured `supabase-production-urls.png`.
  The existing redirect without a trailing slash was preserved, alongside the corrected URL.
- Repeated a production-targeted Google authorization preflight. It redirected to Google;
  the matching temporary Auth flow now stores `https://montuuh.github.io/rytta-dnd-app/`
  as its `referrer`, replacing the previous fallback to localhost. No account was created
  and no consent was approved by this probe.

## Validation and remaining boundary

The previously recorded fresh-install release check still applies to the unchanged rendered
source: 34 unit/SQL tests, 73 browser tests with 2 intentional skips, production-subpath
build/smoke and an independent UI/UX PASS. Current format, diff and UI snapshot checks pass.
This configuration task changes no interface source or database schema.

The earlier deployment-configuration blockers in `release-readiness.md` are resolved.
That report remains the historical pre-configuration assessment. The actual source revision
is identified by the accompanying Git commit/history; local environment files remain ignored.

The two-real-account invitation/acceptance/revocation test remains pending at the user's
request. RYT-001/RYT-002 therefore remain in review. Production publication is a separate
manual `Publish Pages` workflow dispatch; enabling Pages and pushing source alone do not
dispatch that workflow. No successful public deployment or full production Google callback
is claimed in this report. No production migration, paid resource or external message was sent.

Subsequently the user explicitly authorized publication. The successful deployment and real
Google callback are recorded separately in [deployment evidence](pages-deployment.md).
