# Delivery RYT-120: a Player with an absent character can leave a campaign

Status: review (2026-11-17). Found during RYT-115 (see its follow-ups).

## Outcome

`change_campaign_member` refused a Player leaving while their character was absent
(`Character absent`), because the release of the character hit
`private.characters_absence_rules`. Migration `20261129120000_absent_character_leave.sql` lets
the former owner release their absent character in that same transaction; every other non-DM
write to an absent character is still refused. The released character stays absent, so it does
not reappear in the active party lists, and the audit trigger records the leave.

## Scope and ownership

`supabase/migrations/20261129120000_absent_character_leave.sql` and
`tests/database/absent-leave.test.ts`. No frontend change: the existing leave action now
succeeds.

## Acceptance

| Criterion | Result |
| --- | --- |
| A Player whose character is absent can leave; the character is released as for a present character and no history is lost | Met. Database tests, and a hosted PRE check in a rolled-back transaction: the Player left without error and the character was back in the pool, still absent |
| Denial tests for anon, outsider, Player and cross-campaign DM still pass; no one can remove another member through this path | Met (`npm run test:db`, 306 passed). `change_campaign_member` is not replaced |
| PRE migration and tests pass before the reviewed production migration; production verified afterwards | Met with a limit: an independent security review judged it safe to apply; applied to production and mirrored to PRE on 2026-11-17 (hosted version `20261117075346`). The behavioural check ran on PRE only; production data was not touched |

## Checks

- `npm run test:db`: 306 passed.
- Hosted PRE check in a transaction rolled back afterwards, as above.
- Production: migration history shows `20261117075346`; no behavioural write was made.

## Untested and remaining

- No leave by a real Player with an absent character has been exercised in production.
- The migration file and its tests are in the uncommitted working tree; committing them is part
  of the release checklist in RYT-122. No frontend release is needed for the fix to work.
