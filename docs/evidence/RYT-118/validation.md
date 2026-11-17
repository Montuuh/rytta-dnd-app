# Delivery RYT-118: Table view tokens show class emblems

Status: review (2026-11-17). Every acceptance criterion is met on the current tree, including
the hosted migrations and the independent UI review. Not Done: the work is not committed or
released (RYT-122).

## Outcome

Migrations `20261126120000_table_view_class_key_alias_mask.sql` (hosted `20261117063556`),
`20261127120000_tabletop_alias_mask.sql` (hosted `20261117063639`) and the combat leave mask in
`20261128120000_account_deletion_prepare_combat_leave_mask.sql` (hosted `20261117063840`) were
applied to production and mirrored to PRE on 2026-11-17; baseline row counts were unchanged.

- `class_key` is part of the masked combat projection and drives the Table view and map token
  fallback art.
- Alias masking is closed in combat: for an aliased character, other Players and the Table view
  get no portrait, class, vitals or character reference, and events of combatants hidden at
  removal are filtered.
- Alias masking is closed on the map: `get_tabletop` returns the alias as label and no character
  reference.

## Acceptance

| Criterion | Result |
| --- | --- |
| Class key for player combatants; nothing revealing hidden combatants or private data; denial tests | Met in SQL tests and in the hosted PRE actor check d (RYT-119) |
| Player tokens show the class emblem; tokens without a class keep initials | Met in browser specs |
| 390px and 820px, both themes, both languages, keyboard and Escape, axe; independent UI review PASS | Met. Round 1 CHANGES_REQUIRED (shared with RYT-115, 8 findings, all resolved); round 2 PASS |

## Accepted residuals

Documented in `docs/security.md`: an aliased character can be inferred by elimination, and a
token's id, colour and size stay the same when an alias starts.

## Verification

Every migration had an independent security review with the verdict safe to apply;
`npm run test:db` 292 or more passing. Final run on the current tree, 2026-11-17:
`npm run check` passed (627 unit and database tests, build), format check clean,
`npm run test:e2e` 680 passed, 59 skipped, 0 failed.

## Not verified

Realtime delivery to subscribed clients, the production build, real touch devices and screen
readers.
