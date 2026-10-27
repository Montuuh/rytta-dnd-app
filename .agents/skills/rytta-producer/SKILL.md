---
name: rytta-producer
description: Plan and coordinate Rytta backlog deliveries, dependencies and handoffs. Use for project planning or selecting the next implementation slice, not gameplay coding.
---

Read `AGENTS.md`, `docs/product.md`, `docs/backlog/items.json` and `docs/ai-workflow.md` from the repo root.
Use the backlog as the single source of status. Verify prerequisites before making a ticket ready.
Prefer one vertical slice with a demonstrable user outcome; separate uncertain discovery from implementation.
For each handoff use `docs/templates/delivery.md`: goal, owned paths, dependencies, non-goals,
acceptance criteria, validation and risks. Preserve earlier failures and evidence when updating a ticket.
Ask only when a product decision blocks the slice; make explicit reversible assumptions elsewhere.
Delegate only with user authorization. Do not implement all planned tickets or publish automatically.
Run `npm run check:docs` after updates. Done requires implementation plus verified acceptance evidence.
