# Producer backlog

[items.json](items.json) is the canonical queue; do not duplicate status elsewhere.

Tickets record stable ID, priority, owner, scope, dependencies, sources, acceptance and
validation. Done requires existing evidence paths. check:docs validates fields, references
and dependency cycles.

Each ticket includes `recommendedModel.id` (`gpt-6-astra` or `gpt-6.1-sol`) and
`recommendedModel.reasoningEffort` (`low`, `medium`, `high`, `xhigh` or `max`).
These are planning recommendations, not automatic runtime overrides or records of which
model completed past work. The producer revisits them when splitting or changing scope.

Current allocation uses Astra with high effort for architecture, campaign authorization,
transactional economy, map-design tradeoffs, realtime recovery and integrated release review.
Sol with high effort covers auth integration, combat UI, private media, stronghold ledgers,
import discovery and cross-cutting appearance/localization work. Sol with medium effort
covers the bounded journal, glossary and crafting/relationships discovery tickets.

This allocation is project judgment informed by [official model guidance](https://learn.chatgpt.com/docs/models)
(checked 2026-10-27), not a task-specific benchmark. Start with these settings and adjust
when observed results warrant it; maximum effort is not the default.

Milestone 0 is the foundation. Milestone 1 is identity, membership, resources, inventory
and merchants. Later milestones add session/reference tools and campaign-world features.
Reliability and release readiness are mandatory before a live group release.

The producer can split tickets into smaller stable IDs while preserving source trace
and dependencies. Brainstorming is not a commitment to include everything in the first release.
