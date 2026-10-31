# RYT-004 Validation Evidence

## Summary

Inventory, equipment, use/undo and portraits (ADR 014):

- `item_definitions`, `inventory_items` and `inventory_events` with RPC-only writes
  (`save_item_definition`, `grant_item`, `use_item`, `remove_item`, `equip_item`,
  `unequip_item`, `undo_inventory_event`, `set_character_portrait`), campaign locks,
  revision checks, request-id idempotency and an immutable ledger with compensating undo.
- Players add only price-free definitions into `source = player` stacks; Players undo
  their own grant/use/remove events for 10 minutes when the stack is unchanged; DMs undo
  any quantity event.
- Equipment slots with ring pairs and two-handed weapons; equipment and sheet saves
  recompute `armor_class` server-side unless the build sets a manual override; the sheet
  shows attack lines from equipped weapons.
- 5e variant encumbrance (STR×5/×10/×15) in the "Balanza" meter, SRD 5.2 equipment
  templates (CC-BY-4.0) in the forge, and private character portraits.
- UI: satchel grid with wax-seal quantities and rarity pips, parchment item card with a
  hold-to-use seal, undo fuse ribbon, paper doll with socket picker, AC medallion and
  attacks, ledger timeline, DM storehouse and forge with portrait "give to" targets.

## Local verification

- `npm run test:db`: 7 files, 46 tests pass. `tests/database/inventory.test.ts` covers DM
  grant and Player use, idempotent replay, stale revisions, insufficient quantity, undo
  within the window, once-only undo, Player denial on DM events and after 10 minutes, DM
  undo afterwards, undo conflicts after later changes, Player pricing and DM-stack
  inflation denial, player-sourced stacks, non-usable items, denial for anon, outsider,
  peer Player, cross-campaign definitions, inactive Player and direct table writes, slot
  rules, two-handed conflicts, AC recompute (13 → 16 → 18 → 16 → 13) and split/merge of
  stacks on equip/unequip. `pre.test.ts` expects 15 cloned tables and passes the ETL suite.
- Unit tests: `src/features/inventory/domain/inventory.test.ts` (encumbrance thresholds,
  carried weight, slot rules, AC and attack math, SRD template validity, undo window).
- `tests/e2e/inventory.spec.ts`: satchel, card, keyboard use, undo fuse and focus return
  in es/dark and en/light at 150% text with axe, 44px targets and no overflow; equipping
  through the card and paper doll with AC and attack updates and picker focus return;
  hold-to-use needing a sustained press; DM forge from an SRD template with give-to;
  hidden module for Players; portrait upload. 21/21 pass on 1440, 820 and 390 px.
- Full gates: `npm run check` passes (typecheck, lint, architecture, docs, AI contracts, 14
  unit/SQL files with 83 tests, build); `prettier --check` passes; `npm run test:e2e` passes
  171/171 (7.5 min) across desktop, tablet, mobile and the identity projects, run with the
  preinstalled Chromium through a local config shim.

## Hosted Supabase (`ekscdsmniukuxqjixapu`)

- PRE first: the migration (without the shared storage block) was applied to
  `pre`/`pre_private` through `pre_admin.remap`. Rolled-back probe: `pre_rpcs=8 policies=3
  outsider=Forbidden qty_after_undo=2 direct=permission denied player_price=Forbidden`.
- PROD: applied migration `inventory_equipment`. Rolled-back probe:
  `storage_policies=3 bucket=character-portraits public=false limit=1048576 policies=3
  anon=permission denied outsider=Forbidden outsider_portrait=false dm_portrait=true
  qty_after_undo=2 direct=permission denied`.
- Security advisors: only the accepted patterns (intentional `security definer` RPCs,
  private idempotency tables with RLS and no policies, Auth leaked-password protection).

## Not verified

- Real Storage uploads and signed URLs against hosted Supabase (the browser suite mocks
  the Storage HTTP contract; hosted policies were probed through SQL).
- Two real Google accounts; realtime (RYT-013; polling every 20 s); iOS Safari.
- Drag-and-drop from satchel to sockets and portrait crop editing are deferred (ADR 014).

## UI review

Independent `ui-ux` review (report: `reviewer/review.md`, screenshots alongside):

1. Initial review: CHANGES_REQUIRED. Blocker: the undo fuse covered item-card controls at
   150% text. Majors: focus dropped to the body after some actions, action errors were
   hidden behind open drawers, the hold-to-use seal lacked an announced hint and a touch
   fallback, and forge icon names were untranslated keys. Plus minors.
2. Re-review 1: CHANGES_REQUIRED; blocker and three majors resolved, focus still dropped
   after using the last unit. New minor: controls disabled while pending lost focus.
3. Re-review 2: **PASS** for source fingerprint
   `e76b77ede18426bee14338dbfdae2d51c1e28a488aba8745621181f6b0dee435`, recorded in
   `docs/evidence/ui-review-current.json`.

Accepted follow-ups (non-blocking): after an in-card undo the strip disappears and focus
falls to the body (Tab stays inside the dialog); the in-card undo strip pushes the seal
down after the first use, so a repeated tap in the same place misses; the DM header lists
every planned module on 390 px phones (shared layout, outside RYT-004). The reviewer did
not use a real screen reader, a physical device or the Player-POV read-only fixture.
