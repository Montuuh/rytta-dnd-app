# ADR 053: library entries carry their own picture

Date: 2026-11-23. Status: accepted. Extends ADR 051 (campaigns choose content packs).

## Context

The owner wants to view and change the pictures of records from the content library (RYT-172).
Until now pictures were bundled with the app (SRD creatures, classes, item categories) or uploaded
by a DM inside one campaign (creature and item images). The options were weighed on the block P
options page and the owner chose every recommendation (2026-11-23).

## Decision

1. **Which entries (P1 A).** Creatures, items and classes: the kinds the app already illustrates.
   Subclasses are drawn nowhere, so the editor offers them no picture (the server accepts one).
   Spells, rules, species and feats keep their icons.
2. **Stored with the version (P2 A).** An entry names its picture in `data.index.image`, an object
   of the private `pack-images` bucket at `<env>/<pack id>/<uuid>.<webp|png|jpg>` (2 MB). It is part
   of the entry's data, so it is published with the pack and a campaign sees it when its DM updates
   the pack. Replacing or removing a picture never deletes the object: earlier versions may name it.
3. **Editor (P3 A).** The entry shows the picture the app will show and its origin (uploaded to the
   pack, the app's painting, its category's painting, or none), Change through the square editor and
   Remove; the list shows a 40 px thumbnail.
4. **Who (P4 A).** Content editors (super admins included) upload, as they edit entries. Editors
   and the pack owner read every picture of the pack, drafts included; anyone else reads only
   pictures a published version names, of a public pack or of one offered to their campaign.
5. **Which wins (P5 A).** The campaign's own upload, then the pack picture, then the app's painting,
   then the category painting or icon. Campaign members read their campaign's pictures through
   `get_campaign_pack_images`, at the versions the campaign pins.

## Consequences

- Uploaded objects accumulate (no deletion through the API); content editors are trusted accounts
  and the bucket has a size limit. A cleanup of objects no version names can come later.
- Shop items now carry their `basic_key` (the pack item they came from) so shop tiles can show it.
- Players receive class and subclass pictures, the pictures of items their campaign's storeroom
  holds and those of public packs' creatures, never of hidden entries; the DM receives all of the
  campaign's. A Player sees a creature picture only where they already see its bundled art
  (tabletop tokens without a public alias).
