# RYT-094: creatures come from the campaign's content packs

Date: 2026-11-23 (block F). On 2026-11-22 the owner chose the recommended options on the block F
options page:

- P1 A: every creature pack works like the SRD.
- P2 A: the bestiary sends the DM to Content, and hiding replaces removing.
- P3 A: a source filter per pack, and the pack is named on list rows when several packs are
  enabled.
- P4 A: a retryable error, never the bundled creatures.

Decision record: [ADR 051](../../decisions/051-campaign-content-packs.md), section "Creatures
from packs".

## What changed

- `supabase/migrations/20261219120000_pack_creatures.sql`:
  - `get_campaign_creature_packs` returns the campaign's creature packs, with the pinned version,
    whether each is enabled and its hidden keys.
  - `get_campaign_creature_pack` returns one pack's index rows, or its stat blocks and trait
    library in one language, at the pinned version. The response is capped at 8 MB.
  - Creatures from packs other than the SRD are stored as `<ref>--<key>`, where `ref` is the first
    8 hex digits of the pack id. This applies to the existing `srd_id` columns, board tokens,
    creature images and the storage rule.
  - `add_combatants`, `save_combatant_template` and `set_creature_srd_image` accept only references
    to a pack that the campaign has. Creature keys are limited to 70 characters.
- `src/features/combat/ui/creatures.ts`: the catalogue now loads, for each pack the campaign has,
  its index and its stat blocks in the interface language. They are cached for the session by
  pack and version. The list composes the campaign's own creatures, its campaign versions and the
  enabled packs, without hidden creatures (`domain/campaign-bestiary.ts`).
- Bestiary:
  - "Paquetes de criaturas" and "Elegir en Contenido" lead to Content.
  - "Ocultar en esta campaña" replaces "Quitar de esta campaña", and there is no confirmation.
  - The source filter has one segment per pack, or a list once there are several packs.
  - Rows name their pack ("SRD" for the SRD) when more than one pack is enabled.
  - An unreachable library shows only its error with Retry.
- Adding combatants and encounter ideas lead to Content when the campaign has no creature pack.
- `docs/security.md`: "Pack creatures (RYT-094)".

## Scope decisions

- The CR baselines are a rules table, so they stay bundled until rules come from packs (RYT-165).
  The creatures themselves always come from the library.
- The campaign bestiary tables (`campaign_srd_bestiary`, `campaign_srd_removed`) remain the record
  of the SRD creatures and stay in step through the RYT-162 triggers. The app no longer calls
  their RPCs.

## Acceptance

| Criterion | Evidence | Result |
| --- | --- | --- |
| A campaign with the SRD creatures pack shows the same creatures in the bestiary, combat and encounter builder, loaded from the library | `tests/e2e/bestiary-official.spec.ts`: 330 creatures from the pack RPCs. Production smoke: 330 rows, 330 stat blocks and 48 traits. The combat and encounter builder specs pass on the pack fixture | Met |
| Hidden creatures and campaign versions apply wherever a creature is listed, added or suggested | `src/features/combat/domain/campaign-bestiary.test.ts`; the spec (hide, campaign version, back to the pack's version); `tests/database/pack-creatures.test.ts` (campaign version flagged in the update review) | Met |
| An unreachable library shows a retryable error and never falls back to bundled data | Spec: "an unreachable library shows a retryable error" (no rows, no empty list, Retry recovers) | Met |
| 390 and 820 px, both themes and languages, keyboard and Escape, axe; independent UI review | Spec matrix in ES and EN, Hearth and Parchment, at 390 and 820 px with axe. Captures are in `docs/evidence/RYT-094/` | Met |

## Hosted rollout (2026-11-23)

The same LF file was applied in each project and checked by the md5 and length of the stored
statements (15150 bytes, md5 `0e05561405dd3588f53f7ccee91bf6fc`).

- **Before the apply:**
  - No pack ref collisions in `public` or `pre`.
  - No creature keys over 70 characters.
  - No stored `--` references.
- **Staging:**
  - Three `_srd_reference` checks are in place.
  - `add_combatants`, `save_combatant_template`, `set_creature_srd_image`, the token check and
    the storage rule are patched.
  - anon cannot execute the RPCs.
- **Production and PRE:**
  - The same checks pass in both `public` and `pre`.
  - The PRE functions call `pre_private.creature_reference_ok` and do not reference `public`.
- **Production smoke (rolled back), as the DM of an existing campaign:**
  - The campaign has 1 pack, the SRD, with 330 rows.
  - The Spanish stat blocks are 616 KB.
  - Version 2 was refused, and an outsider was refused in `public` and `pre`.
- **Advisors:** only the existing pattern of authenticated security definer RPCs; no new kind of
  finding.

## Checks

- `npm run test:db`: every suite passes, including `pack-creatures.test.ts`.
  `pack-creatures.test.ts` covers:
  - denials for anon, outsiders, Players and the DM of another campaign;
  - stale and unused packs, and packs no longer offered;
  - references in fights, campaign versions, tokens and images;
  - the SRD in `<ref>--` form and unused packs, refused;
  - the 70-character key limit.
- `npm run test:e2e`: the first full run had 38 failures in unrelated specs (identity, legal,
  casting, character sheet). The run took 21.7 minutes against the usual 10.5, because database
  suites ran at the same time. Every one of those specs passes when rerun with less load. The
  RYT-094 spec passes 13 tests, with 3 matrix runs skipped by design.

## Security review

There were no High findings.

- **M1 (fixed):** a `<ref>--<key>` reference is accepted only for a pack the campaign has, and the
  SRD is accepted only as its bare key.
- **M2 (fixed):** a pack read is capped at 8 MB. A cap on pack size at publish time is not in
  place yet.
- **L1 and L2:** checked in production before the apply.
- **L3:** Players see the pack ref on tokens without an alias.
- **L5 and L6:** RYT-163 must make these reads and the browser cache follow the per-campaign offer.

L3, L5 and L6 are documented in `docs/security.md`.

## Not tested

- The browser against hosted Supabase: the e2e specs use the fixture backend, and PGlite is not
  hosted Supabase.
- WebKit/iOS and screen readers.
- A real custom pack with incomplete entries: the "could not be read" note is covered only by the
  parser.

## UI review

An independent UI review ran two rounds.

1. **Changes required.** With the library unreachable, the error showed together with an empty
   list and its filters. The header link weighed as much as "Nueva criatura". The empty state
   repeated its title.
2. **PASS** on the source fingerprint `d66cb246…`.

Open minor notes:

- After Retry, focus returns to the top of the page, because the shared error card leaves.
- A campaign without packs whose own creatures fail to load would show the empty state beside
  the error. This was seen in the code only.
