# Verified GitHub Pages deployment

Date: 2026-10-28 (Europe/Madrid). The user explicitly requested push and Publish Pages.

## Published revision

- Public URL: https://montuuh.github.io/rytta-dnd-app/
- Frontend revision: `cb63763412e74b078eeaa587a4327396946e9962`.
- Publish Pages workflow: https://github.com/Montuuh/rytta-dnd-app/actions/runs/40603833157
- Workflow result: success; both build and deploy jobs completed successfully.
- The requested push reported Everything up-to-date; remote main matched the frontend
  revision before workflow dispatch. The pre-push gate again passed 34 unit/SQL tests,
  type/lint/contracts and production build.

## Deployment and public verification

- The workflow ran a fresh npm install, full check, current independent UI/UX snapshot
  validation, browser tests, Pages-base build, artifact upload and production deployment.
  The browser suite covers 73 passing cases and 2 intentional non-mobile drawer skips.
- The live public URL returned HTTP 200. Six referenced JavaScript/CSS/favicon assets
  returned successful responses under `/rytta-dnd-app/`.
- The published entry contains the expected Supabase project URL and public Publishable
  configuration. No private credential markers were found in that entry. Only browser-safe
  configuration was supplied to the build; no database or Google secret was published.
- Opened the actual public site in Chrome. The Google sign-in screen rendered and a direct
  `/#/settings` reload remained usable. Public signed-out capture: `pages-public-sign-in.png`.
- Completed the existing user's Google sign-in from the public app with the same account
  already used locally. The browser returned to the exact Pages base with no callback code
  remaining in the address, loaded the authorized campaign hub and retained the session
  across reload. No campaign or invitation was modified for this check.
- No application-origin console errors were observed after the authenticated reload.
  The authenticated screenshot stays in ignored local `test-results/` because it contains
  private account/campaign details; it is not committed to this public repository.

## Boundaries and follow-up

The second-real-account DM/Player invitation/acceptance/revocation test remains explicitly
deferred by the user. RYT-001/RYT-002 stay in review rather than being marked Done. Real iOS
Safari, independent-connection concurrency and backup/restore remain unverified. Character
creation/assignment from ADR 004 remains planned for RYT-003.

GitHub emitted non-failing hosted-runner notices about older Action Node runtimes being
forced onto Node 24 and the ubuntu-latest migration. They did not fail this workflow.
No database migration or paid resource was created by this frontend deployment.

Documentation may advance main after publication to record this evidence; the deployed
frontend revision above remains authoritative. These documentation-only changes do not
require publishing another frontend build. Frontend rollback uses an explicitly selected
previous known-good revision; database corrections use forward migrations, never resets.
