# Architecture

## Shape

A modular React SPA with a managed Supabase backend. One package keeps operations simple;
feature boundaries prevent a return to a browser monolith.

```mermaid
flowchart LR
  Phone[Phone / tablet] --> SPA[React + Mantine on Pages]
  SPA --> Query[TanStack Query]
  Query --> Adapter[Feature repository]
  Adapter --> Demo[Explicit demo]
  Adapter --> Auth[Supabase Auth SDK]
  Adapter --> API[PostgREST / RPC]
  API --> DB[(Postgres + RLS)]
  DB -. future .-> RT[Realtime invalidation]
  RT -. future .-> Query
  SPA -. future .-> Media[Private Storage]
```

Google sign-in, PKCE callback handling and the campaign hub are implemented. The Rytta
Supabase project has the initial schema and hosted SQL/API probes pass. The user confirmed
one completed local Google sign-in, corroborated by a Google identity in hosted Auth.
Two-account access flows and the deployed callback remain unverified; fixtures do not prove them.
Dashed connections are future tickets.

## Boundaries

- app: providers, router, layout, theme and navigation composition.
- pages: route views; no SDK calls or domain rules.
- features/name/domain: pure contracts, validation and invariants.
- features/name/data: external adapters and error mapping.
- features/name/api.ts: query/mutation options and use cases.
- features/name/index.ts: public API for other modules.
- shared: generic API client, config and UI primitives.

Shared cannot import features/app/pages. Features cannot import app/pages. Cross-feature
imports use index.ts. The architecture script checks literal static/dynamic imports;
it is a guardrail rather than a complete dependency parser. Add feature directories only
when implementation starts; navigation entries do not justify empty module scaffolding.

## State and lifecycle

React owns interaction state; TanStack Query owns remote state; the server owns truth.
Mantine Form is available for upcoming forms. No second global state store is needed yet.
Zod validates external data at adapter boundaries.

The campaign adapter is selected by explicit configuration. Demo mode loads samples and
never contacts Supabase. The real adapter checks session presence, propagates cancellation,
validates responses and surfaces retryable errors. Session presence is not authorization:
the database verifies JWT identity and RLS.

Auth subscribes to identity changes and clears/cancels private queries before showing a
different identity. Keys include user and campaign IDs. Do not persist private query caches.
Realtime later invalidates authorized keys; reconnect/foreground refetches authoritative
data. Stale, connecting and offline states must be visible. No offline mutation queue yet.

## Routing and auth

HashRouter supports deep reloads on Pages without rewrites; Vite base handles assets.
Browser tests run at /rytta-dnd-app/. For OAuth/magic links use PKCE with an exact allowed
base URL. The auth adapter consumes and scrubs the query-string callback before private
route rendering. SDK URL auto-detection is disabled to avoid duplicate exchanges.
Do not combine implicit-flow fragments with hash routing.

## Backend extension

Current schema: campaigns, campaign_members, campaign_invitations, characters and
character_resources. RPCs create campaigns, list authorized data, invite/respond/revoke
and change membership. Client membership writes remain closed. Each membership mutation
locks the campaign row; the last active DM is protected. Inactive membership preserves
characters while RLS denies access. Creator attribution has no permanent privileges.

Future domains: item definitions, inventory, equipment, merchants/stock, quests,
encounters/participants, glossary, media, maps/routes, strongholds and relationships.
Owned records carry campaign_id; cross-record FKs include campaign_id.
Economic operations use server prices, transactional locking/revision checks, idempotency
keys, audit history and compensating undo. Never mutate whole-campaign JSON snapshots.
Prefer SQL RPC for transactions; Edge Functions are for secrets/external services.

## Quality and operations

Strict TypeScript, Oxlint, Prettier, Vitest, PGlite policy tests and Playwright/axe.
Git hooks provide feedback; CI repeats gates. Deployment is explicit. No service worker:
offline support first needs update, privacy and conflict policies.
