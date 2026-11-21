# Offline shell and connection state

RYT-128 (offline shell) and RYT-013 (realtime and recovery). Design chosen by the owner on
2026-11-21 from the options page: a connection line under the header (P1 A), the app with an
offline placeholder when a screen cannot load (P2 A), and a short confirmation when the connection
returns (P3 A).

## Offline shell

- The build writes `sw.js` next to `index.html` (`scripts/lib/service-worker.mts`, plugin
  `offlineShell` in `vite.config.ts`). Its scope is the build's base path (`/` on Cloudflare Pages,
  `/rytta-dnd-app/` in the browser tests).
- What it keeps: `index.html`, the manifest and the build files under `<base>assets/` (hashed),
  plus the brand, icon and empty-state images. The first visit hands over the files it loaded
  before the worker took control; later ones are kept as they are fetched.
- What it never keeps: anything from another origin (Supabase data, Auth, Storage, Realtime),
  `version.json`, legal pages, art and any request with a query string. No private campaign data
  is stored by the worker; the app's own session storage is unchanged.
- Navigations to the app go to the network first; without signal the cached `index.html` opens
  and the screens show the offline line and placeholders.
- One cache per build (`rytta-shell-<build id>`). A new deploy installs a new worker that waits;
  the version notice's Reload asks it to take over (bounded to 3 s) and the old caches are deleted
  when it activates. Navigations never come from the cache while online, so a stale shell cannot
  load.
- Development servers never register the worker. Browser tests block it except
  `tests/e2e/offline-shell.spec.ts`.

### Disabling it

- One device: open the site with `?no-sw` (for example `https://rytta.pages.dev/?no-sw`); every
  registration of the site is removed. Clearing the site data in the browser does the same.
- Everyone: remove the `offlineShell` plugin and the `registerOfflineShell` call in `src/main.tsx`,
  and publish a `sw.js` that unregisters itself:
  `self.addEventListener('install', () => self.skipWaiting()); self.addEventListener('activate', () => self.registration.unregister())`.

## Connection state

- `src/app/use-connection.ts` follows the browser's online and offline events. The line under the
  header (`ConnectionStrip`) says offline, reconnecting, "connection back · up to date" (3 s) or
  "could not update" with Retry. A polite live region announces each change once.
- "Could not update" means the backend does not answer: after reconnecting, if a query on screen
  failed or the refetch has not settled within 6 s, a request to `/auth/v1/health` decides. A
  screen's own error (no access, one failing call) is shown by that screen, not by the line.
- After a failed refetch, the campaign list, the invitations and the campaign shell (name and
  navigation) keep what they had. Offline, or with the backend unreachable, the line is the only
  message; any other failure shows its error above the kept data.
- When the network returns, every query on screen is fetched again. Realtime channels re-subscribe
  by themselves and refetch on `SUBSCRIBED`. Coming back to a hidden tab refetches stale queries
  (TanStack Query focus refetch, 30 s stale time).
- Nothing that changes data is re-sent: mutations use `networkMode: 'always'`, so an action pressed
  without signal fails at once with its own message.
- Changing account clears the query cache and removes every realtime channel; screens are keyed by
  user and campaign, so their channels close with them.
- Published realtime tables (same list in `public` and `pre`): `campaign_roll_signals`,
  `encounter_signals`, `rest_requests`, `tabletop_live`, `trades`. RLS decides what each member
  receives (RYT-119 evidence).
