# Delivery RYT-105: Players search the campaign catalogue and propose new items

Status: done (2026-11-16; part 2 applied to production with the release). Decision record: ADR 043. Database rollout, shared checks and
untested layers are in [RYT-104 validation](../RYT-104/validation.md).

## Outcome

A Player adding an item searches first and picks an existing item; otherwise they propose one
(name, description, weight, suggested price, optional second language). The DM reviews each
proposal: accepts it with edits, gives an existing item instead or rejects it with a note. The
DM merges duplicate definitions. Player-made items reach a satchel only through the DM.

## Scope and ownership

RPCs `search_campaign_items`, `propose_item`, `list_item_proposals`, `cancel_item_proposal`,
`resolve_item_proposal`, `merge_item_definitions` and the `item_proposals` table (part 1); the
Player authoring switch (part 2); `src/features/inventory/ui/{player-add-item,proposal-shelf,
proposal-review,merge-items,pick-list}.tsx` and their tests.

## Acceptance

| Criterion | Result |
| --- | --- |
| Player search returns only items visible to that Player | Met (SQL tests): live basic items, own creations and items their characters carry; `value_gp` only for basic items |
| A proposal adds nothing until accepted or merged; rejecting tells the Player in the app | Met. The Player reads the status and the DM's note on the proposal shelf (no push notification) |
| Accepting or merging twice with the same key grants once; edits before accepting are stored | Met (SQL tests). Accept and merge need an explicit quantity; the accepted definition belongs to the DM |
| Merging moves inventory, listings and trade references without losing quantities, then removes the duplicate | Met with recorded rules: the duplicate is archived (history stays readable), closed order lines are repointed, and the merge is refused while open orders or live trades reference the duplicate |
| A Player can no longer create a campaign item through the UI or the API | Met. UI and API: closed in production since part 2 (2026-11-16) |
| Denial tests for anon, outsider, Player and cross-campaign DM | Met on PGlite |
| PRE before production | Met; part 2 applied to production on 2026-11-16 |
| 390px and 820px, both themes, both languages, keyboard and Escape, axe; independent UI review PASS | Met. Browser specs passed; independent UI review PASS on the current source in round 2 (shared record in RYT-104) |

## Verification

As in the RYT-104 record; proposal, merge and search cases are in
`tests/database/items-economy.test.ts`, browser flows in `tests/e2e/inventory.spec.ts` and
`tests/e2e/campaign-items.spec.ts`.

## Handoff and review

Security findings fixed before the hosted apply: DM ownership of accepted proposals, frozen
Player edits of DM-touched items, explicit quantities and bounded proposal lists (20 pending and
100 per 24 hours per character; closed history capped at 50). Known and accepted: a merge
performed in production before the release would write a ledger kind the deployed frontend
cannot parse. Known and accepted: Players can read `value_gp` of definitions they carry
directly from the table; column-level protection is planned as RYT-109.

Independent UI review round 1 found that focus fell to the document body after proposal step
changes (major); it was fixed and round 2 passed (details in the RYT-104 record).

Part 2 (`20261121120000_items_player_authoring_close.sql`) was applied to production on 2026-11-16
(hosted version `20261116081923`) right after the pull request merged, and the frontend deployed
from main with the Quality workflow green. Verified in production: `money_scale()` returns 2,
Player authoring is closed, `anon` and `authenticated` cannot execute either switch and the 88
existing item definitions are unchanged.
Not exercised in production with a real Player account: the `save_item_definition` refusal,
which is covered by the SQL tests and by PRE.
