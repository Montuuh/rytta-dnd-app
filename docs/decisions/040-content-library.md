# ADR 040: game data is downloaded from a content library

Date: 2026-11-13. Status: accepted for RYT-092 to RYT-094. The user accepted every recommendation of the options
page (2026-11-13).

## Context

The SRD bestiary, rules, spells and class features are bundled in the app as generated JSON
(ADR 025, ADR 028). Campaigns link the bundled bestiary (ADR 039). The user wants game data served
by an endpoint instead of static files in the repository, a manager to create and change that data
by hand, and the DM to download only what each campaign uses. The SRD is the first content; much
more will be added later.

## Decision

- **Packs and entries.** A content pack is a source (for example SRD 5.2.1) with titles in English
  and Spanish, edition, license and attribution, visibility, owner, draft or published state and a
  version. Its entries have a kind (creature, rule, condition, spell, class feature, subclass, ...),
  a key unique per pack and kind, names in both languages and validated JSON data.
- **Endpoint.** Supabase RPCs under RLS: list the readable packs with counts per kind, and return the
  published entries of one kind with the pack version. Clients download again only when the version
  changes. Anon is refused.
- **Editors.** Writing is limited to content editors, a platform role granted outside the
  repository. Writes go through RPCs with revision checks and idempotent request ids; publishing
  bumps the version.
- **Visibility.** Public packs (the SRD) are readable by any signed-in user. Private packs, for
  content from books the owner bought, are readable only by their owner and editors, and later by
  the campaigns where the owner enables them; they are never offered to other DMs.
- **Manager.** A Content library page opened from the account menu, only for editors: packs,
  entries and editor in three columns on a laptop; a form per kind with a JSON tab; English and
  Spanish side by side, one language being enough; changes are drafts until a version is published
  with a summary; bulk import from a Rytta JSON file with a dry-run report; a one-time upload of the
  bundled SRD 5.2.1.
- **Rollout.** RYT-092 builds the endpoint, RYT-093 the manager and the SRD upload, RYT-094 moves the
  app from bundled JSON to the library and removes the bundled catalogues. Creature art stays bundled
  until a separate decision.

## Consequences

- The repository stops shipping game data once RYT-094 lands; the SRD keeps its CC-BY-4.0
  attribution in the pack.
- The app needs the network for game data; public pack content may be cached on the device.
- Campaign selection of packs and entries (the generalisation of ADR 039) is a later ticket.
