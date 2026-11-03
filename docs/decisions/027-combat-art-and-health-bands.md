# ADR 027: combat tokens, private combat images and health bands

Date: 2026-11-03. Status: proposed for `RYT-043` (review). Builds on ADR 014 (character portraits),
ADR 017 (private item images), ADR 024 (combat projection) and ADR 026 (roster). If another delivery
takes number 027 first, renumber this file on merge.

## Context

The user asked for better combat art: character portraits and creature images, and enemy health a
Player can read at a glance. Until now a creature showed a bar that filled 100/70/35% for the
descriptive status, which looked precise although it was not. Portraits already existed
(`character_sheets.portrait_path`, private bucket `character-portraits`, owner or DM upload), but
other Players could not read them, and bestiary creatures had no image at all.

## Decision

### Tokens

- Every combatant is drawn as a token, the base of a miniature: round for the party, a rounded
  square for allies, a hexagon for enemies and a square keep for the lair. The rim takes the side's
  colour; the shape keeps side readable without colour. The acting combatant's rim turns to the
  accent and glows; a defeated token turns grey; a token hidden from Players (DM only) has a broken
  rim.
- The image is the character's portrait or the creature's bestiary image, cropped to the shape.
  Without an image, or when it fails to load, an engraved monogram (up to two initials, "G3" for
  "Goblin 3") in the heading face stands in; it is decorative (`aria-hidden`).
- Images next to a printed name have empty alt text; where the image is the subject (the DM detail)
  it is described ("Image of Goblin 2").
- Tokens appear in the initiative order, the table banner (large for who acts now, small for who
  is next), the DM turn bar, the DM detail and the end-of-combat recap.

### Health bands

- `get_combat_state` adds `hp_band`: `unhurt`, `wounded` (over half), `bloodied` (over a quarter),
  `critical` (a quarter or less, "near death"), `down` and `unknown`. `hp_status` keeps its four
  values so a client deployed before the migration keeps parsing the projection.
- Where exact hit points are not visible (creatures for Players and the table, teammates who do not
  share), health is a seal with one glyph per band (heart, heart minus, droplets, cracked heart,
  heart off or skull, eye off) followed by the band's name. Near death is the only filled seal. There
  is no bar, so nothing looks more precise than it is. Exact hit points (DM, own character, sharing
  teammates, revealed creatures) keep the proportional bar with numbers and the band word.

### Creature images

- `combatant_templates.image_path` holds a private object in the new bucket `creature-images`
  (`{public|pre}/{campaign}/{template}/{uuid}.{webp|png|jpg}`, 1 MB, image types). The DM attaches it
  with `set_combatant_template_image(campaign, template, revision, path, request)`: DM only, campaign
  lock, idempotent request id (`private.combat_requests`), revision check, path prefix of the own
  environment, campaign and template, and the object must exist. Live encounters with creatures from
  that template are bumped so they refetch.
- `encounter_combatants.template_id` remembers the template an NPC was added from (composite key with
  `campaign_id`, `ON DELETE SET NULL (template_id)`). The image follows the template, so a new image
  shows in a running fight; deleting a template only clears the link. Ad hoc creatures use the
  monogram. Existing combatants have no template link (no backfill by name).
- The bestiary card's token is the upload control: tapping it (or Enter/Space on its focus) opens
  the file picker; a camera seal on the rim marks the action. The client crops to a 512 px WebP
  square, uploads, then attaches. Unreadable files and failed saves are explained next to the token.

### Who reads which image (storage policies, global for PROD and PRE)

- `creature-images`: the campaign DM reads, uploads and deletes under the campaign prefix. An active
  member reads only the image attached to a template that a **visible** combatant of a **non-draft**
  encounter was added from. Hidden combatants are absent from the Player and table projections, and
  their template image is unreadable unless another visible combatant uses the same template.
  Unattached uploads are DM-only.
- `character-portraits` reading is widened: besides the owner and the DM (unchanged), an active member
  reads the **current** portrait of a character that fights visibly in a non-draft encounter of the
  campaign. Older portrait objects and uploads stay owner/DM only; writes are unchanged.
- The routers `private.creature_image_access` and `private.portrait_read_access` dispatch by object
  prefix to `private` or `pre_private` helpers (`can_view_creature_image`, `can_view_portrait`), as
  `private.item_image_access` does. Signed URLs last five minutes for creatures and one hour for
  portraits; the client refuses paths from the other environment and shows the monogram.

### Migration and environments

`20261107120000_combat_media.sql`: the application DDL runs on `public` and, through a guarded
`pre_admin.remap` block, on a PRE that has combat but not this change. The storage routers, bucket
and policies are global. PRE received the remapped DDL during the delivery; the global storage part
was rehearsed on the hosted database in a rolled-back transaction and is applied with the production
migration by the integrator.

## Consequences

- Players see portraits of teammates in combat even when those teammates do not share live vitals:
  a portrait is not play state. Reserve and archived characters never fight, so they stay private.
- A deleted template leaves orphaned objects in `creature-images` (as item images do); cleanup is a
  separate retention task.
- Hosted Storage with real signed URLs and two signed-in accounts is not exercised by the PGlite
  tests, the SDK fixture or the rolled-back rehearsal (see the RYT-043 validation report).
