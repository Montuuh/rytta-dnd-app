# ADR 061: routes are plain paths

Date: 2026-11-26. Status: accepted for `RYT-186`. Changes decision 4 of
[ADR 001](001-foundation.md) (HashRouter for Pages). No database change.

## Context

The scaffold used hash routes (`/#/campaign/<id>/party`) because the first static host had no
rewrite rules: a reload on a deep path would have answered 404. Production now runs on
Cloudflare Pages at the root of `rytta.app` ([ADR 055](055-own-domain.md)). The project has no
top-level `404.html`, so Pages treats it as a single-page application and answers every unknown
path with `index.html` (checked on 26 November 2026: `/campaign/abc/party`,
`/glossary/rule.long-rest` and `/settings` answer 200 with the app). The old `rytta.pages.dev`
project redirects with the path and query kept, and browsers keep the fragment across a redirect.
The owner asked on 26 November 2026 to drop the `#` when it is no longer needed.

## Decision

1. **Browser paths under the Vite base.** `BrowserRouter` with the base as basename
   (`/` in production, `/rytta-dnd-app/` in the browser tests). `src/shared/lib/app-path.ts`
   turns routes into addresses and back for the few raw links outside the router (the table
   screen's new tab, the fatal error screens) and for the unsaved-changes guards, which now hand
   a route to the router instead of assigning `window.location` (a full load would also have
   raised the browser's leave prompt after the person had already agreed).
2. **Old addresses keep working.** Before the app renders, an address whose fragment starts with
   `#/` is replaced in place (`history.replaceState`, no extra history entry) by the same route
   as a path; query parameters of both parts are kept. Fragments that are not routes (the skip
   link, provider `#access_token=` fragments, which the auth adapter still rejects) are left
   alone. The rewrite never leaves the app's origin.
3. **Sign-in is unchanged.** OAuth, confirmation and reset links still return to the base URL
   with a query-string PKCE code, so the Supabase Auth redirect allowlist (the base URL and its
   `?sb_flow_id=*` variant) and the Google OAuth client, whose redirect URI is the Supabase
   callback, need no change. The page to return to is now remembered from the path.
4. **Offline.** The offline worker answers navigations to any app route under the base network
   first and, offline, with the cached `index.html`. Only the base path's response is stored, so
   a deep path or a static page never replaces the cached shell. Files and the static legal pages
   stay network only.
5. **Static legal pages stay.** `/privacy/`, `/terms/` and `/en/...` remain the documents for
   crawlers and the Google consent screen. In the app, `/privacy` and `/terms` are routes;
   opening them directly on Pages follows its trailing-slash redirect to the static page, which
   holds the same text and a link back to the app.

## Consequences

Addresses are readable and shareable without `#`. Any future host must answer unknown paths with
`index.html` (Pages: keep no top-level `404.html`; other hosts need a rewrite). The local header
server used by the browser tests (`scripts/serve-with-headers.mjs`) mimics the Pages fallback and
trailing-slash redirect.
