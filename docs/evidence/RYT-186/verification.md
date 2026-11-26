# RYT-186 verification: routes without `#/`

Date: 2026-11-26. Decision: [ADR 061](../../decisions/061-path-routing.md).

## External integrations

| Integration | Check | Result |
| --- | --- | --- |
| Cloudflare Pages (`rytta.app`) | `curl` of `/campaign/abc/party`, `/glossary/rule.long-rest`, `/settings` against the deployed site | 200 with the app's `index.html` (single-page fallback; the build has no top-level `404.html`) |
| Cloudflare Pages static legal pages | `curl` of `/privacy` and `/privacy/` | `/privacy` answers 308 to `/privacy/`, which serves the static policy; the Google consent screen keeps its URL |
| Old host `rytta.pages.dev` | `curl -I https://rytta.pages.dev/campaign/x?a=1` | 301 to `https://rytta.app/campaign/x?a=1`: path and query kept; the browser keeps a `#/` fragment and the app rewrites it |
| Supabase Auth redirect allowlist | `node scripts/verify-supabase-public.mjs https://rytta.app/` | PASS, with and without `?sb_flow_id=`. Callbacks still land on the base URL, so the allowlist needs no change |
| Google OAuth client | same script: the authorize redirect goes to `accounts.google.com` with `redirect_uri` = the Supabase callback | PASS; the Google client never sees app routes |
| Local callbacks | same script for `http://localhost:5174/`, `http://127.0.0.1:5173/`, `http://localhost:5173/` | 5174 and 127.0.0.1:5173 PASS. `http://localhost:5173/?sb_flow_id=*` is rejected: an existing gap in the Auth URL configuration, not caused by this change (owner action in Authentication > URL Configuration) |

## Automated checks

| Check | Result |
| --- | --- |
| `npm run check` | PASS: typecheck, lint, architecture and docs contracts, 158 files / 1356 unit tests, build |
| `tests/e2e/routing.spec.ts` (new) | PASS at desktop, tablet and mobile: `./#/privacy` opens `/privacy` in place; `?from=invite#/glossary?q=fuego` keeps both queries; a deep path survives reload and Back |
| `tests/e2e/character-sheet.spec.ts` RYT-186 test (new) | PASS: "Discard and leave" opens the link in the same document, with no browser leave prompt |
| `tests/unit/service-worker.test.ts` | PASS: app routes (including glossary ids with dots) are answered by the shell offline; files and static legal pages stay network only |
| `src/shared/lib/app-path.test.ts` (new) | PASS: route/address conversion, legacy rewrite, other hosts in the hash never leave the origin |
| Full `npm run test:e2e`, first run | 1888 passed, 31 failed: specs still expecting `#/` URLs, and specs whose `page.goto` relied on a hash change keeping in-memory state (the DM's Player view). Fixed with path expectations and an in-app navigation helper (`tests/e2e/fixtures/navigate.ts`) |
| Full `npm run test:e2e`, final run | 1917 passed, 208 skipped, 2 failed at identity-desktop only (`identity.spec.ts:380`, `quick-switcher.spec.ts:183`); both pass 3/3 with `--repeat-each=3` in isolation: load flakes |

## Production release

Released with the next-to-main pull request #42 (merge commit `fb47c9cc`, all CI checks and the
four browser-test shards green), 26 November 2026. `https://rytta.app/version.json` reports build
`fb47c9ccbbc3`.

| Check on rytta.app | Result |
| --- | --- |
| `/`, `/campaign/abc/party`, `/glossary/rule.long-rest` | 200 with the app |
| `/privacy`, `/privacy/` | 308 to `/privacy/`, then the static policy |
| `/sw.js` | the new worker, with the app-route branch |
| Browser: `https://rytta.app/#/privacy` | lands on `https://rytta.app/privacy` with the policy heading, no console errors |
| Browser: `https://rytta.app/#/glossary` | lands on `https://rytta.app/glossary` |
| Hosted migrations | production history includes every local migration up to `admin_access_campaign_reads`; this ticket adds none |

Not covered: a real Google sign-in on production after the release (agents cannot complete it;
the allowlist and OAuth configuration checks above pass), and the old-domain redirect with a
`#/` fragment in a real browser.
