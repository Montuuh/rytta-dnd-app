# AI development workflow

## Guidance and roles

AGENTS.md is canonical, with scoped frontend/backend/docs instructions. Optional
.cursor/rules files point to the same guidance. Native Codex roles use
.codex/agents/*.toml following current official docs; Cursor .md agents are not assumed
to be interchangeable. Roles inherit model/effort settings.

- Producer: scope, sequencing, dependencies, acceptance and evidence.
- Frontend: one UI slice, Mantine and browser verification.
- Backend: schema, permissions, transactions and denial tests.
- Reviewer: read-only correctness/security/accessibility findings.
- UI/UX: mandatory independent interface review with PASS, CHANGES_REQUIRED or BLOCKED.

Role definitions do not run agents or authorize delegation. With user authorization,
assign non-overlapping paths and one integrator. Backlog presence is not permission
to launch all implementations.

The user has given standing authorization for `ui-ux` reviews after interface changes.
This scoped exception is now part of AGENTS.md, the frontend skill and producer/frontend
roles. Follow [UI review](ui-review.md); CI checks the verdict and source fingerprint.
This is an agent-workflow trigger, not an unattended background process or a shell hook
that can spawn an AI model. Other delegation still requires authorization.

## Skills

Repo workflows live in .agents/skills:

- $rytta-producer: refine a dependency-ready delivery.
- $rytta-feature: implement and verify a frontend slice.
- $rytta-supabase: backend ownership/transaction semantics.
- $rytta-release: verify and prepare an explicitly requested release.

Example: “Use $rytta-producer to prepare RYT-001, without implementing it.”
Or ask to use the producer role. No global settings/skills are modified.

## Delivery states

planned → ready → in_progress → review → done. blocked requires a reason and unblock condition.
Ready means prerequisites and acceptance are clear. Review requires observed verification.
Done requires evidence paths. docs/backlog/items.json is the only status source; do not
duplicate it in markdown tables. Use docs/templates/delivery.md. Run npm run check:docs.

## Hooks and gates

- .codex/hooks.json: SessionStart reads local backlog and emits context. No repository
  writes, prompt logging, network traffic or follow-up loops.
- .husky/pre-commit: types, lint and architecture/documentation contracts.
- .husky/pre-push: full local check including SQL tests/build.
- CI repeats checks and adds browser/axe/format verification.

Codex lifecycle hooks require a compatible host plus project/hook trust. Current Codex
requires review of new definitions; this scaffold does not bypass that flow or claim
activation from a successful script test. Inspect Hooks settings after opening this repo.
Node must be on PATH. commandWindows targets PowerShell; the POSIX command uses the same
git-root substitution. npm ci installs Git hooks; they are bypassable, so CI is the gate.

## Handoff

Use docs/templates/delivery.md. Report changed paths, criteria, commands/results, captures,
initial failures/corrections, untested layers and remaining decisions. Never equate sample
content with live data or a local build with a deployment.
