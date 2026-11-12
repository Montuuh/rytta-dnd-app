# ADR 039: each campaign has its own bestiary; the DM downloads the official one

Date: 2026-11-12. Status: accepted for RYT-089. Amends ADR 028 (SRD bestiary) and ADR 030 (bestiary
art: the DM's image per SRD creature stays per campaign).

## Context

Until now every campaign listed the 330 SRD 5.2.1 creatures from its first day, bundled in the app
and read-only, next to the campaign's own creatures. "Personalizar" copied an SRD creature into a new
campaign creature ("based on Wolf"), so both lived in the list. The user asked for a bestiary per
campaign: the DM imports the official one with a button, changes to creatures are per campaign and
the official bestiary never changes from a campaign. The options were weighed on a published options
page (2026-11-12); the user chose:

1. Link, not copy: the campaign records which official creatures it uses.
2. One button downloads everything, after a question with the count.
3. Editing an official creature edits it in place: the campaign keeps its own version.
4. Existing campaigns start without the official bestiary, like new ones.
5. The campaign's bestiary rules everywhere: the list, adding creatures to a fight and the encounter
   builder's candidates and suggestions.
6. The DM can remove one official creature or all of them, and download them again.

## Decision

### Data (migration `campaign_bestiary`)

- `campaign_srd_bestiary (campaign_id)`: the campaign downloaded the official bestiary.
- `campaign_srd_removed (campaign_id, srd_id)`: official creatures removed afterwards; their key
  points at the download row, so removing the whole official bestiary removes them too.
- `combatant_templates.srd_override`: the campaign's version of the official creature `srd_id`, at
  most one per campaign and creature (partial unique index). Templates with `srd_id` and no override
  (the older "based on" copies) stay campaign creatures.
- DM-only reads under RLS; writes only through `set_srd_bestiary(campaign, action, srd, request)`
  ('download' clears the removals, 'remove', 'remove_all'; campaign lock, idempotent request id) and
  `save_combatant_template` (a version needs the creature in the campaign's bestiary and no version
  yet: 'Already modified'; a version keeps its creature). Removing a creature, or all, deletes its
  campaign versions; the app asks first. `get_srd_bestiary` returns the state.
- The official catalogue, its art and its two languages stay bundled and are never written.

### Interface

- A campaign without the official bestiary and without creatures shows one invitation (title, the
  download button, the SRD count); with creatures of its own, a line above them. Search and filters
  appear once there is something to search.
- The download asks with the count and reports it. Once downloaded, an "Official bestiary" menu
  beside "New creature" brings back removed creatures or removes the whole official bestiary (with
  the number of campaign versions it deletes). The official tab of the filters appears only then.
- An official creature's stat block offers "Edit" instead of "Customise": saving a change creates
  the campaign version (saving it untouched does not), which is listed in the creature's place and
  marked "Modified", in the official tab too. Its stat block shows one note, "Modified in this
  campaign", with "Restore the official version" beside it; its menu and an official creature's
  menu offer "Remove from this campaign". The open stat block follows the creature into its
  version and back, and keeps focus on its Edit button.
- Questions that delete a campaign version say first that its changes cannot be recovered.
- Everything that lists creatures uses the campaign's bestiary. An official creature already in a
  fight keeps its stat block after it is removed from the campaign.

## Consequences

- Existing campaigns lose the SRD list until their DM downloads it (the user's choice); their own
  creatures, "based on" copies, SRD images and fights are untouched.
- Official corrections and new art reach every campaign that downloaded the bestiary; a campaign
  version keeps the stat block saved when it was edited.
- A deleted version's image object stays in the private bucket, as for any deleted campaign creature
  (follow-up: let the storage router delete orphaned template images).
- Not covered: choosing a subset by type or CR, bringing back one removed creature on its own, and
  copying a version into an independent creature (Duplicate still works on the version).
