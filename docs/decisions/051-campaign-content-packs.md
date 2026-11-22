# ADR 051: campaigns choose content packs

Date: 2026-11-22. Status: accepted. Amends ADR 040 (content library) and generalises ADR 039
(campaign bestiary) to every kind of game data.

## Context

The content library (ADR 040, RYT-092/093) stores packs of game data with versions, visibility
and editors; super admins hold every editor right (RYT-153). The owner wants the super admin to
manage downloadable packs, such as the SRD and their own, for creatures, spells, classes and
subclasses, rules and items. Each DM then downloads the packs a campaign uses. The options were
weighed on a published options page and the owner chose every recommendation (2026-11-22).

## Decision

1. **Pinned versions.** A campaign uses a pack at the version it downloaded. When a new version is
   published the DM sees what changes (new, changed and withdrawn entries) and decides when to
   update. Withdrawn entries leave the campaign only when it updates.
2. **Whole packs per kind, with hidden entries.** The DM enables a pack for a kind (for example
   "SRD 5.2.1 · Creatures") in one step and can hide single entries; hidden entries leave every
   list and search of the campaign.
3. **One Content section** in the DM Command Center lists the available packs by kind. Every
   module (bestiary, combat, encounter builder, spells, character creation and level up, glossary,
   storeroom and shops) reads what the campaign enabled there.
4. **Campaign versions.** Editing an entry that comes from a pack stores the campaign's own version
   and leaves the pack unchanged, as the campaign bestiary does today. The DM can return to the
   pack's version, and an update says when it touches an entry the campaign changed.
5. **Custom packs are public or private.** A public pack is offered to every DM; a private one only
   to the campaigns its owner adds (for content from books they bought).
6. **The manager stays the content library**, reached from the Library tab of Administration:
   packs, kinds and entries with drafts and "Publish version".
7. **First kinds:** creatures, spells, classes with subclasses and features, rules and conditions,
   and items. Species and backgrounds come later.

The campaign's own homebrew (glossary entries, items and creatures the DM creates) stays the
campaign's and is not part of any pack.

## Delivery

- RYT-162: campaign content (pinned versions, update review, hidden entries, campaign versions)
  and the Content section; existing campaign bestiary downloads become the SRD creatures pack.
- RYT-163: private packs offered to chosen campaigns.
- RYT-094: creatures read from the campaign's packs (bestiary, combat, encounter builder).
- RYT-164: spells and class content read from packs (sheet, creation, level up, casting).
- RYT-165: rules and conditions read from packs (glossary and automatic term links).
- RYT-166: items as a pack kind (editor form, the basic items as a pack, storeroom and shops).
- RYT-167: the bundled catalogues leave the repository once every reader has moved.

## Consequences

- A published pack version never changes a running game until its DM accepts the update.
- The app needs the network for game data; pack content is cached by version.
- Pack entries keep stable keys across versions so campaign versions, hidden entries and updates
  can follow them.
