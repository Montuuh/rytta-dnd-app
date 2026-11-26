# RYT-128 — Offline shell: a reload without signal opens the app

Date: 2026-11-21. Delivered with RYT-013 (block B). Design from the options page answered by the
owner on 2026-11-21: connection line under the header (P1 A), the app with an offline placeholder
(P2 A), a short confirmation when the connection returns (P3 A). How it works and how to disable
it: [docs/offline-shell.md](../../offline-shell.md).

## What changed

- `scripts/lib/service-worker.mts` and the `offlineShell` plugin in `vite.config.ts` write `sw.js`
  for each build: navigations to the base path go to the network first and fall back to the cached
  `index.html`; build files under `<base>assets/` and the brand, icon and empty-state images are
  served cache first; everything else (other origins, `version.json`, queries) is left alone.
- `src/shared/lib/offline-shell.ts` registers it in production builds only, hands the worker the
  files loaded before it took control, and lets a waiting worker take over (bounded to 3 s) before
  the version notice reloads.
- `/sw.js` is served with `Cache-Control: no-cache` (`_headers`).
- A screen that cannot load offline shows "Esta pantalla necesita conexión" with Retry; secondary
  sections show one quiet line.

## Acceptance

| Criterion | Evidence | Result |
| --- | --- | --- |
| After one online visit, an offline reload of the production subpath opens the app shell with the offline line | `tests/e2e/offline-shell.spec.ts` "a reload without signal…" at 390 and 820 px: header, offline line and placeholder visible | Met |
| Only static build files and the shell are cached; no API, Auth, Storage or private data | Same test lists every cached URL: same origin, under `/rytta-dnd-app/`, no query string, none of `supabase.co`, `/rest|auth|storage|realtime/v1/`, `version.json`; `tests/unit/service-worker.test.ts` covers the routing decisions | Met |
| A new deployment is picked up through the version notice, without a stale shell or a forced reload | "the version notice reloads into the new build with the worker in place": Reload completes in under 5 s and the page stays controlled; navigations never come from the cache while online; a new worker waits until asked | Met |
| Scope matches the production subpath; disabling documented | Worker scope is the build base (`/` on Cloudflare, `/rytta-dnd-app/` in tests); `?no-sw` and a self-unregistering worker in `docs/offline-shell.md` | Met |
| 390 and 820 px offline and online, axe clean; independent UI review | axe clean in every state of the spec, including EN/ES and the default and Parchment themes at 390 px; independent UI review PASS on 2026-11-21 after two rounds of changes (RYT-013 evidence) | Met |

## Checks

- `npm run check`: passed (typecheck, lint, architecture, docs, unit and database tests, build).
- `npm run test:e2e`: final run 1459 passed, 147 skipped, 1 intermittent failure unrelated to the
  worker (see RYT-013 evidence). An earlier run had 6 failures from a page-wide `role="status"`;
  the announcer now uses `aria-live="polite"` without the role.
- The full suite runs with service workers blocked except `offline-shell.spec.ts`, so caching never
  changes what another spec sees.

## Not verified

- A real phone on the deployed site (iOS Safari and Android Chrome), including installing the app
  to the home screen. Tests ran in Chromium against the local production build.
- The update path across two real deployments on Cloudflare Pages: the test simulates a newer
  `version.json` with the same build.

## Privacy wording applied (2026-11-26)

The browser storage section of the privacy policy now names the app's own files kept for opening
without a connection (`legal.privacy.local.l4`), approved by the owner on 26 November 2026. See
the RYT-147 record for the checks.
