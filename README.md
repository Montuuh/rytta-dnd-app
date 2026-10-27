# Rytta · The table companion

A mobile/tablet companion for in-person, homebrew D&D campaigns.
TypeScript + React + Vite, Mantine UI and Supabase. This repository contains the
architecture and scaffold; gameplay modules remain planned.

The interface defaults to Spanish and dark mode. Select English or light mode in the
header or Settings; preferences persist on this device. UI changes require independent
review by the [ui-ux agent](docs/ui-review.md).

## Start locally

Use Node 24.13+ (24.x) and npm:

```sh
npm ci
npm run dev
```

Open Vite's printed URL. No credentials are needed: the default is a labelled,
read-only demo. Module links navigate to planned delivery boundaries. Nothing is
saved and no Supabase connection is made in demo mode.

## Included

- Responsive Mantine shell, mobile drawer, route focus, error boundary and Pages-safe hash routes.
- Campaign domain contract, demo/Supabase adapters, Zod validation and TanStack Query.
- SQL migration for campaigns, membership, characters and resources, RLS and atomic campaign bootstrap.
- PostgreSQL policy tests, Vitest, Playwright/axe, CI and an explicit Pages publishing workflow.
- Producer backlog, ADRs, security model, repo skills, role definitions and hooks.

Authentication screens, invitations and gameplay remain backlog work. Supabase mode
is an integration foundation, with an explicit signed-out error until RYT-001.

## Commands

```sh
npm run check           # Types, lint, architecture/docs contracts, unit/SQL tests, build
npm run test:e2e        # Production subpath checks in phone/tablet/desktop
npm run format         # Format source and docs
npm run format:check
npm run test:db         # PostgreSQL policies without Docker
```

Before the first browser run: `npx playwright install chromium`.
Git hooks are installed by npm ci; CI repeats the checks independently.

## Configure and navigate

Copy .env.example to .env.local and follow [backend setup](docs/development.md).
All VITE_ values reach the browser: use only a public publishable key.
Set VITE_DATA_MODE=supabase only when testing the real adapter. Invalid configuration
fails closed; it never silently falls back to samples.

```text
src/app/                 Composition, providers, routing and theme
src/pages/               Route-level views
src/features/campaigns/  First vertical module: domain, query and adapters
src/shared/              Generic API, validation and UI primitives
supabase/                Local config, migrations and scoped agent guidance
tests/                   PostgreSQL policies and browser checks
docs/                    Product, architecture, backlog, ADRs and evidence
.agents/skills/          Reusable project workflows
.codex/agents/           Producer, frontend, backend and reviewer roles
.codex/hooks.json        Read-only session context hook
.cursor/rules/           Optional editor adapters to canonical guidance
```

Start with the [documentation index](docs/README.md).
Invoke `$rytta-producer` to prepare the next delivery from the
[backlog](docs/backlog/items.json). [Deployment instructions](docs/deployment.md)
cover GitHub Pages and Vercel. No remote backend or site has been provisioned.
