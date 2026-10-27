---
name: rytta-feature
description: Implement a scoped Rytta React feature using the project boundaries and Mantine UI. Use for frontend deliveries or UI fixes, not database-only work.
---

Read the assigned backlog item, `src/AGENTS.md`, `docs/architecture.md` and `docs/design-system.md`.
Inspect current behavior and git changes. Keep domain rules out of page components.
Use a feature public API, an adapter and TanStack Query for remote data. Parse external boundaries with Zod.
Compose existing Mantine widgets. Provide touch equivalents for hover, useful focus order and error recovery.
Do not substitute mock mutations for backend operations. Label demonstration content visibly.
Verify the slice with focused tests and `npm run check`. For rendered changes run `npm run test:e2e`,
inspect phone/tablet screenshots and test keyboard, Escape, 150% text and reduced motion.
Check both themes and languages. Invoke `ui-ux` after implementation; the user authorized
this standing review requirement. Supply the scope and actual rendered/test evidence.
Follow `docs/ui-review.md`, fix blockers and obtain focused re-review. Record the independent
verdict rather than approving your own work.
Return modified paths, observed results and missing coverage to the producer; do not invent completion.
