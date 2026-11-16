# Delivery RYT-102: default trackers and options paid from a resource

Status: review (2026-11-16; the first acceptance criterion is partly met, see the end of this
record). Decision record: ADR 045. Shared checks and untested layers of the
integration are in [RYT-104 validation](../RYT-104/validation.md).

## Outcome

The sheet seeds trackers for limited-use class, SRD subclass, species and origin-feat features,
marks once-per-turn features, and lists options that spend a parent resource (Flurry of Blows,
Patient Defense and Step of the Wind from Focus; Channel Divinity options) as their own entries
with glossary text.

## Scope and ownership

`src/features/characters/domain/{resources,progression,rules,sheet,srd,creation,history}.ts`,
`src/features/characters/ui/sheet/**` (new `resources-block.tsx`), glossary content and
`scripts/glossary/{class_features,origin_features}.py`. No backend or migration change.

## Acceptance

| Criterion | Result |
| --- | --- |
| A unit test lists every limited-use class, subclass, species and feat feature and fails if one lacks a tracker | Partly met. `resources.test.ts` audits class and SRD subclass resources against the SRD, covers species and feats, requires every tracker and option to link an existing glossary entry and keeps every class, subclass, species and background within 30 trackers at level 20. There is no single test that enumerates the SRD text and fails on a missing feature |
| Goliath picks a Giant Ancestry, gets only that tracker (PB uses, long rest); Large Form from level 5 | Met (unit test). The choice is stored in `build.choices` and made on the sheet, not in the creation wizard |
| Once-per-turn features reset at the start of the next turn and on rests | Changed by decision: a light mark cleared by "New turn" on the sheet or by any rest; no server-side per-turn reset. Acceptance amended in the backlog |
| Monk options as separate entries spending Focus, refused when empty; Channel Divinity options the same way | Met (unit tests for cost, refusal, limits and uses given back) |
| Sync adds missing trackers once, keeps spent uses and does not restore removed trackers | Met (unit tests; a dropped species option removes its trackers) |
| 390px and 820px, both themes, both languages, keyboard and Escape, axe; independent UI review PASS | Met. Character-sheet specs passed; independent UI review PASS on the current source in round 2 (shared record in RYT-104) |

Recorded limits: Metamagic options and Font of Magic conversions are not implemented (planned as
RYT-110); the Giant Ancestry choice is made on the sheet, species options in the creation wizard
are planned as RYT-111; the tracker cap stays at 30 with a notice of how many defaults were left
out.

## Verification

`npm run check` and the full `npm run test:e2e` run on the reviewed source as listed in the
RYT-104 record. After two small sheet follow-ups the character-sheet spec was rerun: 33 passed.

## Handoff and review

Independent UI review round 1 found three major issues in this ticket's surfaces: the
once-per-turn mark read backwards, focus fell to the document body after "new turn", and spend
options at zero uses looked active. All were fixed; round 2 passed (details in the RYT-104
record).

No initial check failure specific to this ticket was reported. Untested: real Player use during
a session, screen readers, iOS Safari.

Remaining before Done: the first acceptance criterion is only partly met. The tests audit class
and SRD subclass resources against the SRD by sampled cases and cover species and feats, but no
test enumerates every limited-use SRD 5.2.1 feature and fails on a missing tracker. Either add
that test or record a decision that amends the criterion to the audit-based coverage.
