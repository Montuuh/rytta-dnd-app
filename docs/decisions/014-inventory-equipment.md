# ADR 014: Inventory, equipment, use/undo and portraits

## Status

Accepted for `RYT-004`.

## Context

The Drive brief ("Aplicación Rol › Objetos / Equipo") asks for every owned item as an
icon with quantity and a collapsible explanation, "Usar" plus "Recuperar/Deshacer" for
usable items, a weight bar following D&D encumbrance, and an equipment screen with slots
and the character's picture. The user asked for a distinctive UX that avoids typical
buttons. Decisions recorded with the user on 2026-10-31:

- Encumbrance: 5e tiered variant — STR×5 encumbered (−10 ft), STR×10 heavily
  encumbered (−20 ft, disadvantage), STR×15 maximum.
- Both DM and Player add items. Players cannot price items or inflate DM/shop stacks.
- Undo: a Player undoes their own quantity events for 10 minutes if the stack has not
  changed since; a DM undoes any quantity event without a time limit.
- Equipped armor and shield compute AC; equipped weapons produce attack lines; SRD 5.2
  equipment seeds templates; characters get an uploaded portrait.

## Decision

1. **Data.** `item_definitions` (campaign catalog with category, icon key, rarity, weight
   in tenths of a pound, DM-only `value_gp`, slot kind, validated properties and origin
   dm/player/srd), `inventory_items` (stacks with source dm/player/shop, quantity and an
   optional equipment slot; equipped rows always hold one unit; a partial unique index
   keeps one item per slot) and `inventory_events` (immutable ledger with compensating
   undo links). `character_sheets.portrait_path` stores the portrait object path.
2. **Writes are RPCs only.** `save_item_definition`, `grant_item`, `use_item`,
   `remove_item`, `equip_item`, `unequip_item`, `undo_inventory_event` and
   `set_character_portrait` lock the campaign, authorize through
   `private.can_play_character`, check stack revisions, deduplicate request ids in
   `private.inventory_requests` and audit in the same transaction. Direct table writes
   are revoked; reads follow the character (stacks, ledger) or the definitions a member
   holds or created.
3. **Economy guard.** Player definitions are `origin = player` with no price; Players
   only add their own definitions, into `source = player` stacks. RYT-005 resale will read
   `source`, so player-added items never mint gold.
4. **Equipment.** Equipping splits one unit into its own row; unequipping merges it back
   into a matching stack. Two-handed weapons block the off hand. Equipment changes and
   sheet saves recompute `armor_class` server-side (armor base + capped DEX, shield bonus,
   10 + DEX unarmored) unless the build sets `acOverride`; the recompute does not bump the
   sheet revision, so open edits do not go stale. Attack lines (ability, proficiency,
   dice, versatile, range) are derived in the client and assume proficiency.
5. **Undo.** Only grant/use/remove events are undoable; equip/unequip are reversed by the
   opposite action. Undo is once-only and rejected when the stack revision moved after the
   event ("nothing contradicts it").
6. **Portraits.** One private bucket `character-portraits` holds
   `{public|pre}/{campaign}/{character}/{uuid}.{webp|png|jpg}` (1 MB, image types only).
   Storage policies call `private.can_access_portrait`, which dispatches to the PROD or PRE
   authorization helper by prefix through dynamic SQL so the PRE ETL can replace
   `pre_private` without storage dependencies. Clients center-crop to 512 px WebP and read
   through one-hour signed URLs.
7. **UX.** Satchel grid of leather-stitched tiles with wax-seal quantities and rarity
   pips; a "Balanza" meter notched at the encumbrance thresholds; a parchment item card
   with a hold-to-use wax seal (keyboard and assistive technology activate immediately);
   an undo fuse ribbon for the 10-minute window; a paper doll of sockets around the
   portrait medallion with a socket picker, live AC medallion and attack lines; a ledger
   timeline with undo seals; a DM storehouse and "forge" with SRD templates, an icon grid
   and portrait "give to" targets. Icons are Lucide (ISC); SRD 5.2 data is CC-BY-4.0 with
   attribution.
8. **Visibility.** The module follows `player_modules`; DMs can open implemented modules
   before enabling them for Players and see a hint while they are hidden.

## Consequences

- Inventory is authoritative in PostgreSQL with auditable, reversible quantity changes.
- Deferred: drag-and-drop from satchel to sockets (the picker is the path on every
  device), portrait crop editing, encumbrance for Large creatures, weapon proficiency
  rules, ammunition tracking per attack and realtime (RYT-013).
