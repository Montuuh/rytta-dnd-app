# RYT-001 / RYT-002 production readiness

Date: 2026-10-28 (Europe/Madrid). Verdict: NOT READY for production publication.

The code passes the local release checks. Deployment configuration and real two-account
acceptance are still outstanding. This assessment did not commit, push, publish, enable
Pages, change repository variables or modify production Auth configuration.

## Source and validation

- Local and remote `main` still point to `50b3df03f71dd11a51caeab7f0bb239860b3a600`
  (First commit: structure). The current delivery is in uncommitted working-tree changes.
- Reviewed UI digest remains
  `6bc82848d71c005333324b9318761b2757c56815b7ce31295b970a25831af958`.
- A fresh temporary copy of the current tracked/untracked source was validated without
  replacing the active workspace's dependencies or disturbing the user's local server.
  Private environment files were initially excluded; only the already-validated public
  frontend configuration was copied for the separate production-mode build.
- `npm ci`: PASS (123 packages installed, 0 reported npm audit vulnerabilities). Husky
  installation was intentionally disabled in this temporary non-Git checkout; source
  checks were executed explicitly. An npm audit result is not a security certification.
- `npm run check`: PASS, 34 tests across five files, type/lint/contracts and build.
- `npm run test:e2e -- --workers=4 --output=test-results/release-readiness`: 73 passed,
  2 intentional non-mobile drawer skips, no failures. These browser cases use explicit
  demo/Auth/REST fixtures rather than real signed-in Google accounts.
- A separate Supabase-mode build with `/rytta-dnd-app/` base passed. Its phone smoke
  passed root/direct-hash reloads, asset-base validation, zero browser errors and zero
  HTTP responses >=400. Screenshot: `release-production-sign-in-mobile.png`.
- Current `npm run check:ui-review`, `npm run format:check` and ignored `.env.local`
  checks passed. Independent UI approval remains current; no rendered source changed.

## Confirmed production blockers

1. GitHub repository `Montuuh/rytta-dnd-app` reports `has_pages: false`. The Pages
   configuration endpoint initially returned 404; repository metadata corroborated that
   Pages is disabled. The repository is public and the connected account has admin access,
   but no configuration was changed by this assessment.
2. Repository Actions variables are empty. The existing publishing workflow defaults to
   `VITE_DATA_MODE=demo`; `.env.local` is ignored and never supplies GitHub Actions values.
   Production requires `VITE_DATA_MODE=supabase`, `VITE_SUPABASE_URL` and the public
   `VITE_SUPABASE_PUBLISHABLE_KEY`. The workflow derives the asset base from configure-pages.
3. The proposed Pages URL `https://montuuh.github.io/rytta-dnd-app/` is not currently an
   accepted return target in hosted Auth. A new Google authorization preflight requested
   that exact URL; a read of only that flow's `referrer` field showed fallback to
   `http://localhost:5173/`. Set the deployed Site URL / allowed redirect to the actual
   final frontend URL before publication, then verify the full return path. The preflight
   only created temporary Auth flow state; no account or campaign was created.
4. Full real-account acceptance remains outstanding: a DM invites a second Google account,
   the Player accepts, their authorized campaign view is verified, and revocation removes
   access. SQL role tests and HTTP fixtures do not establish this JWT/PostgREST path.

The user confirmed one completed local Google login. A read-only count found one Google
identity in hosted Auth. This is positive local evidence, not two-account or deployed-URL
verification. No personal account details, browser tokens or private keys were accessed.

## Scope and remaining release evidence

This release slice is identity/campaign membership, not a complete playable companion.
Character creation and character-targeted invitations (ADR 004 / RYT-003) remain planned.
Cross-connection last-DM concurrency, real iOS Safari and backup/restore remain unverified
as documented in the hosted connection report. RYT-001/RYT-002 remain in review.

The Supabase migrations are already applied; a frontend publication must not reapply or
reset them. Publish only a user-authorized, committed revision after the blockers above
are resolved, then verify the actual Pages URL and Google callback. Frontend rollback
should use the previous known deployed revision (there is currently no Pages deployment);
database correction uses a forward migration, never a production reset.
