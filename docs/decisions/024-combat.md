# ADR 024: shared combat, role projection and the table display

Date: 2026-11-03. Status: accepted for `RYT-007`, `RYT-036`, `RYT-037` and `RYT-038`. Builds on
ADR 013 (character vitals), ADR 014 (idempotent RPCs and compensating undo) and ADR 020 (party
live sharing). Analysis: [combat design](../combat-design.md).

## Context

The planned combat module must give the DM a fast initiative and hit point console, give each
Player the own turn and character controls on their device, and give the shared screen a view
with no DM secrets. Character play state already lives in `character_vitals`; the sheet edits it.

## Decision

- **One source of truth.** Characters join an encounter by reference. Their HP, temporary HP,
  death saves and conditions are read from and written to `character_vitals` in the same
  transaction as the combat event. NPCs, monsters and the lair keep their state in
  `encounter_combatants`. Concentration, defeat and legendary actions are combat state.
- **Tables** (`20261104120000_combat.sql`): `encounters`, `encounter_combatants`,
  `encounter_effects`, `encounter_events` (log with before/after snapshots), `combatant_templates`
  (bestiary) and `private.combat_requests` (idempotency). All carry `campaign_id` with composite
  foreign keys. One live encounter per campaign (partial unique index).
- **Reads.** RLS lets members read non-draft `encounters` rows (which carry no secrets) and only
  DMs read the other tables. Players receive everything else through `get_combat_state`, a
  `security definer` role projection: own character in full, teammates per `shares_live`, NPC HP
  as a descriptive status unless revealed, no hidden combatants, NPC AC, DM notes, secret effects
  or private events. `as_table` returns the same projection without own data, for the DM too.
- **Writes.** 21 mutation RPCs (plus three reads), `security definer` with an empty search path, executable by
  `authenticated` only, each locking the campaign row and replaying request ids. HP changes are
  server-side deltas (multi-target in one transaction). Turn changes require the expected active
  combatant. The DM runs every operation; a Player acts only on the own character (initiative,
  HP, conditions, concentration, death saves, own effects, undo of own events, ending the own
  turn). Undo restores the before snapshot only if the target still matches the after snapshot.
- **Realtime.** Only `encounters` joins the publication. Every mutation, and a trigger on
  vitals, sheets and resources of characters in a live encounter, increments its revision;
  clients invalidate and refetch the projection. Polling (4 s live, 15 s idle), focus and
  reconnect refetch remain the fallback; stale data is labelled "last known".
- **Initiative.** Players type their own totals; the server rolls d20 + bonus for creatures with
  `random()` (one roll per shared group). Ties: bonus, then a DM order (`order_key`).
- **Attribution.** Damage counts as dealt by whoever held the turn when it was applied. This is
  explicit on the summary; there is no attacker picker in this delivery.
- **DM preview.** A DM previewing a Player sees a presentation-only transform of the DM data
  (`previewAsPlayer`); the server still authorizes as the DM.
- **PRE.** The migration mirrors itself into an existing PRE with `pre_admin.remap`. Helpers with
  row-typed parameters are remapped with an empty search path so their types point to PRE.

## Consequences

- The sheet and the combat screen always agree; an HP change from either bumps the encounter.
- The campaign lock serializes combat with inventory, shops and trades; acceptable for one table.
- No grid, attack resolution or bundled monsters. Exhaustion remains a DM resource.
- Hosted realtime delivery is verified separately from the PGlite and fixture tests (see the
  RYT-007 validation report).

## Numbering note

This delivery first used the IDs RYT-035..037 and ADR 023. `main` assigned both to the review-fixes
delivery in the meantime, so the combat tickets are now RYT-036..038 and this record is ADR 024.
The migration `20261104120000_combat.sql` was already applied to PRE and production. Migrations are
append-only after deployment, so its header and the table comments keep the provisional IDs: read
RYT-035 as RYT-036 (bestiary), RYT-036 as RYT-037 (tools) and RYT-037 as RYT-038 (table display).
