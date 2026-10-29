# RYT-021 release preflight

Date: 2026-10-29. User explicitly requested publication after the implementation review.

Target: `Montuuh/rytta-dnd-app`, `main`, GitHub Pages at
https://montuuh.github.io/rytta-dnd-app/. The current workflow deploys pushes to main.
Runtime configuration: Supabase mode, the existing public project URL and publishable key.
Hosted production selects `public`; loopback browser tests select `pre`.
No database migrations, data changes or paid resources are needed for this UI release.

## Fresh validation

- `npm ci`: PASS, zero reported vulnerabilities. First attempt failed with Windows EPERM
  because the old RYT-020 review preview on port 4180 held the Rolldown binding open.
  Stopped that specifically identified preview and repeated successfully.
- `npm run check`: PASS, including 55 unit/SQL tests, strict types, lint, contracts and build.
- `npm run check:ui-review`: PASS for the unchanged independently reviewed source digest
  `c7da5ca8b841f0dd92aa9f72499dd3ed65c57b58bf2becc03bb055210f835dc1`.
- `npm run test:e2e -- --output=.tmp/ryt021-release-e2e --workers=4`: 129 passed, no skips.
- `npm run format:check` and `git diff --check`: PASS.
- Git HEAD and origin/main matched `a879f8e34eeba175d95fd2774ea7b3a64726d99c`
  before this delivery commit. Its last Publish Pages run succeeded.

## Deployment and rollback

Pushed as `9df13044e944a1bb95c97f04eb49147b517edc48`. Quality run
https://github.com/Montuuh/rytta-dnd-app/actions/runs/40881337760 and Publish Pages
https://github.com/Montuuh/rytta-dnd-app/actions/runs/40881337718 both succeeded.
Post-deploy public verification is recorded in [pages-deployment.md](pages-deployment.md);
local smoke artifacts remain under ignored `.tmp/ryt021-release/`.

Rollback: restore `a879f8e34eeba175d95fd2774ea7b3a64726d99c` through the same
quality/deployment checks, then re-verify the public URL. No database rollback is required.
