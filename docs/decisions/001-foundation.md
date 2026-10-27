# ADR 001: Companion foundation

Date: 2026-10-27. Status: accepted for the scaffold.

## Context

In-person homebrew D&D, mobile/tablet companion, old browser monolith. Requested stack:
TypeScript/Vite/React/Supabase. Preferred static host: Pages. Scope: architecture.

## Decisions

1. Single-package modular SPA: feature public APIs/adapters without monorepo overhead.
2. Mantine is the only UI kit. Compared with shadcn/Tailwind, it provides complex widgets
   with less locally owned component maintenance. Theme uses focused CSS.
3. TanStack Query for server state, React for interaction, Zod for external boundaries.
   No duplicate state/form toolkit or full offline engine.
4. HashRouter and configurable Vite base for Pages. PKCE callback belongs to the auth slice.
5. Supabase Auth/Postgres/RLS and SQL RPC transactions; Edge Functions only for secrets/integrations.
6. Minimal relational foundation, later tables per ticket. No mutable whole-campaign blob.
7. Explicit demo adapter; backend errors never silently switch to samples.
8. Versioned agents/skills/rules/checks, no runtime LLM feature or automatic publishing.

## Consequences

Pages remains viable; backend provisioning is separate. Mantine is a dependency but
reduces custom widget burden. Offline/concurrency need future work. PGlite is fast RLS
coverage, not a substitute for Supabase integration. The scaffold cannot yet host real games.
