# RYT-027 verification

Date: 2026-11-02. Branch `claude/ecstatic-clarke-dz03w7`, rebased on `main` at `d76cb3a`
(after RYT-005 shops and RYT-026 campaign items). Decision record:
[ADR 018](../../decisions/018-dm-command-center-storeroom.md).

## Automated checks

| Check | Result |
| --- | --- |
| `npm run check` (typecheck, lint, contracts, unit tests, build) | Pass |
| `npm run test:e2e` (all projects, 2 workers) | 237 passed |
| `npm run check:ui-review` | Pending the independent ui-ux verdict |

The first focused run (campaign items, identity, characters, inventory, shops) had 17 failures.
All were selectors bound to the replaced UI:
- the `Objetos de campaña` heading and the item cards;
- the `Personaje` select in the give drawer;
- the `Cola de revelaciones` steps;
- nav order;
- a shop-row regex that now also matches the new `Editar objeto: …` button.

They were rewritten, not skipped. One real defect was found and fixed: the storeroom notice
close button was below 44px.

New e2e coverage (`campaign-items.spec.ts`):
- A new item created for a character from the Party menu lands in that satchel. This covers the
  `?create=` deep link, the preselected chip, the status text and the URL cleanup.
- Storeroom filters, the no-results state, Clear filters, and the grid view that persists across
  a reload.
- A shop stock row opens the shared editor and saves the definition.

`identity.spec.ts` now checks the nav order, the absence of a revelations tab, the storeroom tab
deep link (`?panel=items`) surviving a reload, and that "Leave campaign" is hidden outside
Members.

## Rendered evidence

- Before: `before/items-d.png`, `before/items-m.png`, `before/party-dm-d.png`,
  `before/party-pl-d.png`. In the last two, the Player card is narrower than the DM's.
- After: `store-m.png`, `store-t.png`, `store-d.png` (storeroom tab), `members-d.png`,
  `party-dm-m.png`, `party-dm-d.png`, `party-pl-m.png`, `party-pl-d.png` (same width as the
  DM), `shop-d.png`.

## Not covered

- Real iOS Safari and Android devices, and hosted Supabase. All data comes from the e2e HTTP
  fixtures.
- Creating one item for several characters, with a partial grant failure, is covered by code
  and by the idempotency design, but not by an e2e case.
- No database or RLS changes are part of this ticket.

## Independent UI/UX review

Pending.
