# ADR 023: full review fixes, compact page heads and locked planned modules

Date: 2026-11-03. Status: proposed for `RYT-035`. Builds on ADR 012 (module visibility),
ADR 015 (bottom navigation) and ADR 021 (class themes).

## Context

A full frontend and UI/UX review of every DM and Player screen at 1366px, 820/1180px tablets
and a 390px phone found functional bugs and layout problems: Shops was labelled "Coming soon"
in the module switches, a DM could enable planned modules and Players then saw navigation
items to placeholder pages, the DM price modifier said "discount for you", one quick resource
step blocked every character's steppers, character changes refetched every campaign, phone page
heads pushed content below the fold and red subtle buttons rendered almost white in dark mode.

## Decision

- One module catalogue (`src/features/campaigns/ui/module-catalog.ts`) feeds navigation, module
  pages and the DM switches. Only `implemented` modules can be enabled or become destinations;
  a planned key already stored on a campaign is ignored by navigation and can still be switched
  off. The More drawer stays for when more than five destinations exist.
- `PageHead` (`src/shared/ui/page-head.tsx`) is the page heading: h1, a one-line lede, primary
  actions and the `RefreshControl` on one band. Phones keep the band compact.
- Quick resource steps use `useResourceAction`: an optimistic cache update with the predicted
  revision, queued per character through a TanStack mutation scope, and one refetch of the
  campaign scope when the queue drains. A stale result refetches the server truth and shows a
  dismissible alert. Character mutations invalidate the campaign scope, not every query of the
  user.
- `usePhone` / `useWide` read the media query on the first render so overlays mounted on open
  never paint their desktop variant on phones. CSS phone rules use `max-width: 47.99em` and
  `61.99em` so they never overlap Mantine's `min-width: 48em/62em` rules.
- Mantine red light, subtle and outline variants map to the contrast-tested `--danger` token.
- Live sharing is a labelled `Switch` ("Visible al grupo") instead of an icon-only toggle.
- Settings shows the installation section only in demo mode (demo stays explicit) and offers
  a Back button when reached from inside the app.
- Request ids come from `newRequestId()`, which falls back to `getRandomValues` outside secure
  contexts (a tablet opening a LAN preview over http).

## Consequences

No database change. A planned module cannot be previewed by Players until it ships. The More
drawer is currently unreachable with three implemented modules and is not covered by e2e.
