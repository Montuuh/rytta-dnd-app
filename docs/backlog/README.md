# Producer backlog

[items.json](items.json) is the canonical queue; do not duplicate status elsewhere.

Tickets record stable ID, priority, owner, scope, dependencies, sources, acceptance and
validation. Done requires existing evidence paths. check:docs validates fields, references
and dependency cycles.

Milestone 0 is the foundation. Milestone 1 is identity, membership, resources, inventory
and merchants. Later milestones add session/reference tools and campaign-world features.
Reliability and release readiness are mandatory before a live group release.

The producer can split tickets into smaller stable IDs while preserving source trace
and dependencies. Brainstorming is not a commitment to include everything in the first release.
