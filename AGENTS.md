# Rytta agent contract

Build a mobile/tablet companion for in-person, homebrew D&D. Read `docs/README.md`,
`docs/architecture.md` and the relevant ticket in `docs/backlog/items.json` first.
This repository is a foundation; planned modules are not implemented features.

## Working agreement

- Talk to the user in Spanish. Keep code, documentation and identifiers in English.
- Inspect `git status` and existing changes before editing. Own a named ticket and paths.
- The producer maintains priority, dependencies, acceptance criteria and evidence.
- Work on the requested delivery only. The user authorizes necessary Supabase changes and
  non-destructive production migrations within that delivery without a separate approval.
  Check the target, existing data, permissions and migration history; validate and report results.
  No autonomous release, paid service creation, destructive import or external messages.
- Delegate only when the user authorizes it; role files do not authorize spawning.
- Standing user authorization: invoke `ui-ux` after every interface change, including
  translations, theme, layout and interaction changes.
- Do not edit the legacy sibling `../rytta`; use it only as a reference.
- Keep durable decisions in ADRs and backlog evidence, not chat history alone.

## Database environments

- Local development and localhost previews use `pre`; hosted production uses `public`.
  The runtime selector is authoritative; do not add a browser-controlled schema override.
- `pre_private` contains PRE helpers, audit internals and idempotency state. Auth is shared.
- Use `npm run pre:plan` before `pre:sync`. Existing PRE refreshes require `--replace-pre`
  and retain a complete server-side backup. ETL is public/private to pre/pre_private only.
- Test database changes in PRE, then apply reviewed production migrations within the task.
  Never promote PRE data into PROD or use public RPCs for local application testing.

## Engineering rules

- TypeScript strict; `app` composes, `pages` render, `features` own domain/data,
  `shared` contains generic infrastructure. Use feature public entrypoints.
- Use Mantine and its accessibility primitives before inventing widgets.
- Touch-first, minimum 44px interactive targets, keyboard/focus/Escape support.
- Demo content stays explicit and isolated. Never represent demo as persisted/live.
- PostgreSQL RLS is authoritative. UI role checks are presentation only.
- Never ship service-role keys or private DM fields in browser data/cache.
- Purchases/use/undo require transactional RPCs, idempotency and authorization;
  do not implement read-modify-write transactions in browser code.
- Validate external data; no raw HTML rendering. Never copy unlicensed rules/assets.

## Validation

- `npm run check`: typecheck, lint, architecture/docs contracts, unit/SQL tests, build.
- `npm run test:e2e`: production subpath navigation, browser errors, axe, mobile/tablet.
- Capture changed UI at 390px and tablet size, inspect screenshots and keyboard flow.
- Database changes require denial tests for anon, outsider, player and cross-campaign DM.
- PGlite tests are not hosted Supabase integration. Report untested layers explicitly.
- Mark Done only with acceptance evidence. Never hide initial failures or skipped checks.
- UI deliveries require an independent `ui-ux` verdict after implementation and checks.
  Fix blockers and request focused re-review. Never self-approve; unavailable review
  stays pending. See docs/ui-review.md for source snapshot validation.

## Reusable workflows

Repo skills live in `.agents/skills/`. Codex role definitions live in `.codex/agents/`.
See `docs/ai-workflow.md` for invocation, hooks, runtime trust and handoff templates.

Author commits as Montuuh <dmontufo@gmail.com>. Do not add Co-Authored-By or other Claude attribution trailers.
