---
name: rytta-release
description: Verify and prepare a Rytta static frontend release for GitHub Pages or Vercel. Use for release readiness and deployment work, not ordinary feature implementation.
---

Read `docs/deployment.md`, the requested delivery and git status. Confirm intended base path and data mode.
Run `npm run check:ui-review`; require an independent current PASS before publishing UI changes.
Run `npm ci`, `npm run check` and `npm run test:e2e`. Inspect the Pages-subpath build, direct hash routes,
mobile/tablet captures, browser console and failed network requests. Separate backend integration evidence.
Check only public configuration is exposed. Preserve foreign changes; stage only owned paths if requested.
Prepare a release summary with source revision, checks, migrations and rollback steps.
Commit, push, publish or migrate production only when the user has authorized that action.
After authorized deployment, verify the actual public URL and report deployment evidence separately
from local preview. A workflow file alone never means the app is deployed.
