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

## Creatures from packs (RYT-094, 2026-11-22)

Owner choices from the block F options page, all the recommended ones:

- P1 A: every creature pack works like the SRD (bestiary, fights, board, own image, campaign
  version). Stored references name the pack: `<ref>--<key>`, the SRD keeping its bare key.
- P2 A: the bestiary sends the DM to Content to choose packs. "Remove" becomes "Hide in this
  campaign" (undone from Content), and "remove all" is the pack's switch.
- P3 A: the source filter lists each enabled pack (a list once there are several), and list rows
  name their pack when more than one is enabled.
- P4 A: an unreachable library shows a retryable error and never falls back to the bundled SRD.
  Pack versions are cached for the session; offline copies are a later decision.

The CR baselines (a rules table) stay bundled until rules come from packs (RYT-165).

## Spells, class features and rules from packs (RYT-164, RYT-165, 2026-11-23)

Owner choices from the block I options page, all the recommended ones:

- P1 A: spells, class features and rules (the glossary-shaped kinds the SRD pack has) come from
  the campaign's packs now. The mechanics of the classes and subclasses stay in the app until
  RYT-168 models them as pack data.
- P2 A: a hidden entry is no longer offered (choices, glossary, term links). Characters that
  already have it keep it on their sheet.
- P3 A: the glossary outside a campaign reads the published SRD pack. The demo keeps the bundled
  sample.
- P4 A: without the library the sheet keeps working from the character's stored data, and rule
  texts offer a retry. Character creation and level up wait for the library.

## Consequences

- A published pack version never changes a running game until its DM accepts the update.
- The app needs the network for game data; pack content is cached by version.
- Pack entries keep stable keys across versions so campaign versions, hidden entries and updates
  can follow them.
