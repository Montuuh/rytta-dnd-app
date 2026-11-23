# RYT-164 and RYT-165: spells, class features and rules come from the campaign's packs

Date: 2026-11-23 (block I). The owner chose the recommended options on the block I options page.
The decision record is [ADR 051](../../decisions/051-campaign-content-packs.md), section "Spells,
class features and rules from packs".

- P1 A: spells, class features and rules come from packs now. Class and subclass mechanics stay
  in the app and move to packs later (RYT-168).
- P2 A: a hidden entry is no longer offered, but characters that already have it keep it.
- P3 A: the glossary outside a campaign reads the published SRD; the demo keeps the bundled sample.
- P4 A: without the library, the sheet keeps working and rule texts offer a retry. Character
  creation and level up wait for the library.

## What changed

- **Migration** `supabase/migrations/20261220120000_pack_rules.sql`:
  - `get_campaign_rule_packs` and `get_campaign_rule_pack` are open to every active member of the
    campaign. They return the spells, classes and rules packs at the campaign's pinned versions,
    with the hidden ids, shaped as the glossary reads them.
  - `get_srd_rule_pack` returns the published SRD to any signed-in account.
  - Glossary ids:
    - The SRD keeps the ids that characters already store.
    - Other packs use `<kind>.<ref>--<key>`.
  - Each read is capped at 8 MB, and the size is checked before the answer is built.
- **Glossary** (`src/features/glossary`):
  - The glossary layer reads from the campaign's packs, from the published SRD, or from the demo
    sample (`ui/glossary-source.ts`).
  - Hidden entries, and entries of packs that are turned off, stay readable by id. They are left
    out of lists, search, term links and the library picker.
  - The definition sheet now has a Retry button on its error.
- **Characters**:
  - Progression keeps a hidden class feature on characters that have it and adds it to nobody new.
  - Finishing a new character waits for the library, with a retryable message.
- **Content panel**:
  - It now offers the Spells, Class features and Rules categories.
  - The classes category is relabelled "Rasgos de clase" / "Class features".
  - The Review and Browse buttons of each pack name the category in their accessible label.
- **Backlog**: RYT-164 now covers spells and class features. The new ticket RYT-168 covers classes
  and subclasses as pack data.

## Acceptance

| Criterion | Evidence | Result |
| --- | --- | --- |
| RYT-164: a campaign with the SRD packs offers the same class features and spells as before | E2E specs run on the SRD served as packs: level-up, casting, character sheet and creation, and the full suite (1528 passed). Production smoke: 339 spells read by a Player | Met |
| RYT-164: hidden entries are not offered; existing characters keep what they chose | `tests/e2e/pack-rules.spec.ts`: a hidden spell stays on the sheet and leaves the library. Progression keeps hidden features (`progression.ts`) | Met |
| RYT-164: no silent fallback; the sheet keeps working, creation and level up wait | `pack-rules.spec.ts`: offline sheet, then definition Retry. Creation waits through `character-creation.tsx`; level up already waited | Met (blank sheet wait and retry in `pack-rules.spec.ts`) |
| RYT-165: the glossary and term links show the same SRD rules, plus homebrew | E2E: the glossary spec passes on packs (838 entries). Production: 211 rules from the SRD pack | Met |
| RYT-165: hidden entries leave the glossary and stop linking | `pack-rules.spec.ts`: 837 entries with a condition hidden, and it is no longer found | Met |
| Denials, hosted apply, UI review | `tests/database/pack-rules.test.ts` (anon, outsider, inactive member, other campaign, helper grants); hosted results below | Met |

## Hosted rollout (2026-11-23)

The same LF file was applied in each environment: 8471 bytes, md5
`0d20b1f7ee83bdb612e311daf3fe78d8`.

- **Staging:** md5 and length match. anon cannot execute the RPCs, and `authenticated` cannot
  execute the helpers.
- **Production and PRE:** md5 and length match. The PRE functions exist and do not reference
  `public`.
- **Smoke test** (rolled back), as a real Player of an existing campaign:
  - 3 SRD packs (spells, classes, rules);
  - 339 spell rows; the Spanish bodies weigh 392 KB;
  - the standalone SRD rules: 211;
  - an outsider is refused in `public` and in `pre`.

## Checks

- `npm run check`: 1199 tests pass.
- `npm run test:e2e`: the full suite was run alone, with 1528 passed, 163 skipped and 0 failed.

## Security review

No High findings.

- M1 (an unpaginated read built whole): the size is now checked on the entries before the answer
  is built. Reads stay unpaginated, and there is no cap on pack size at publish time yet.
- L1: tests now assert that nobody but the RPCs can run the helpers.
- L2: packs that are turned off are served too, and this is documented in `docs/security.md`.
- L3 to L5 remain as notes: caches outlive the campaign scope; adapters parse in `queryFn`; there
  are test gaps for admin access, pinned against newer versions, and drafts.

## Not tested

- The browser against hosted Supabase.
- WebKit/iOS and screen readers.
- A custom pack with non-SRD spells on a character.

## UI review

An independent UI review ran three rounds and ended in PASS on the source fingerprint `257c4f86…`.

1. **Changes required.**
   - The quick build and the blank sheet were stuck without the library.
   - Retry in the definition sheet lost focus.
   - The wizard's wait notice vanished without saving.
2. **Changes required.**
   - The error text promised that the character would finish by itself, which was untrue in two
     paths.
   - Retry in the new wait notice lost focus.
3. **PASS.**

The remaining notes:

- In the quick build, an empty name would send focus to a disabled button when the library
  returns.
- The empty "no packs published" text in Content is unchanged.

