# ADR 047: hosting on Cloudflare Workers static assets

Date: 2026-11-17. Status: accepted for RYT-116. Supersedes the GitHub Pages hosting described in
`deployment.md` and assumed by ADR 007 ("the hosted production build selects public").

## Context

The frontend is static and was published on GitHub Pages under `/rytta-dnd-app/`. The launch
audit (finding M-4) showed two limits of that host: every Pages project of the account shares
one origin, so any script on a sibling project can read the Supabase session in `localStorage`,
and Pages cannot send response headers, so there is no Content Security Policy and nothing
forbids framing the app. Large static art (about 40 MB) also gets only short default caching.

## Decision

Publish the web on Cloudflare as a Worker with static assets, connected to the repository
(`wrangler.jsonc`: the Worker name `rytta-dnd`, assets from `dist`, single-page fallback, no
Worker code and no secrets). The file sets `workers_dev: true` and `preview_urls: false`
explicitly, so a deploy does not depend on how the dashboard toggles stand; preview URLs stay off
until a preview configuration that uses the staging backend exists.
The site lives at the root of its own origin; `VITE_BASE_PATH` stays unset.

The build writes `dist/_headers`, which Cloudflare applies to the assets:

- A Content Security Policy generated from the built `index.html` and the backend URL: the
  inline boot script is allowed by its SHA-256, the Supabase origin is the only remote origin
  (https and wss), `'wasm-unsafe-eval'` is there for the 3D dice, `worker-src blob:` for the dice
  worker and `style-src 'unsafe-inline'` for Mantine's runtime styles.
- `frame-ancestors 'none'`, `nosniff`, a strict referrer policy, a permissions policy that denies
  camera, microphone, geolocation and payment, HSTS and `same-origin-allow-popups`.
- Caching: hashed `/assets/*` immutable for a year; the unhashed art, bestiary, tabletop, icons
  and vendor files for a week with a day of stale-while-revalidate; `/`, `index.html`,
  `version.json` and the manifest `no-cache`, so the update notice keeps working.

Zod's validator compiler is switched off in the browser (`src/shared/lib/zod-jitless.ts`),
because its `new Function` probe is a reported violation under a policy without `'unsafe-eval'`.

An end-to-end spec serves a root-path build with the generated headers and fails on any policy
violation across the main journeys, with controls proving that foreign origins, inline scripts
and eval are blocked.

## Consequences

- The session is no longer shared with other sites; clickjacking and injected foreign scripts
  are blocked by the browser, not only by code review.
- Art replaced under the same file name can look stale for up to a week in browsers that cached
  it; rename the file, or accept the delay. Hashing art file names would allow immutable caching
  and is a separate change.
- Variables are read at build time: set them as build variables of the Worker. Preview builds
  must use the staging Supabase project.
- Supabase Auth and the Google OAuth client need the new site URL before sign-in works there.
- GitHub Pages keeps working from the same workflow until its deploy job is disabled; running
  both leaves two production sites and two session origins, so disable it once Cloudflare is live.
- The policy cannot be verified on the real host from the repository; check the response
  headers of the deployed site once (see `deployment.md`).

## Update 2026-11-18: Pages project instead of a Worker

The first deployment ran as a Worker with static assets and proved the headers and the sign-in
flow. Its free address carries the account name, and the owner chose not to buy a domain yet, so
the site moved to a Cloudflare Pages project named `rytta` (https://rytta.pages.dev). Nothing else
in this decision changes: same build, same generated `_headers`, same policy, no server code.
`wrangler.jsonc` is removed because Pages needs no configuration file for a static output
directory; the Worker is retired once the new address is confirmed. A custom domain can be
attached to the Pages project later without another move.
