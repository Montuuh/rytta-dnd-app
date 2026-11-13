# RYT-027 verification

Date: 2026-11-02. a feature branch, rebased on `main` at `d76cb3a`
(after RYT-005 shops and RYT-026 campaign items). Decision record:
[ADR 018](../../decisions/018-dm-command-center-storeroom.md).

## Automated checks

| Check | Result |
| --- | --- |
| `npm run check` (typecheck, lint, contracts, unit tests, build) | Pass |
| `npm run test:e2e` (all projects, 2 workers) | 237 passed |
| The UI review check | Pass (round 2 PASS) |

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

Round 1 (source `70f8fe8`): `CHANGES_REQUIRED`, recorded in `reviewer/review.md`. Fixes:

- F1 (blocking): focus was lost after overlays opened from a ⋯ menu. Menu actions now run
  after the menu has closed and returned focus to its button. The storeroom also remembers the
  visible trigger and returns focus there when Give, Edit or Add to shop closes. A regression
  test opens Give from a grid tile menu, presses Escape and expects the ⋯ button to be focused.
- F2: Clear search is 44px and returns focus to the search box.
- F3: the selected Command Center tab scrolls into view on phones (deep links).
- F4: giving an existing item now says "Entregado a …" instead of "creado", in neutral wording.
- F5: the give drawer names the characters it could not serve and marks served chips with a
  check.
- F6: "New item for Arin" is the drawer title and the preselected recipients appear first.
  Closing returns focus to the visible trigger, or to New item when the opener (a Party menu
  item) no longer exists.
- F7:
  - Phone rows include the price in the meta line.
  - Names wrap to two lines instead of being cut.
  - The gold value has a gap before its pencil.
  - Unused `party.*` keys are removed.
  - The documented row height now says 64px.
  - Not done (pre-existing, outside RYT-027): Shops "New shop" is 39px tall on phones.

After the fixes: `npm run check` passes, and campaign items plus inventory pass 126/126 (run
twice). Round 2 (source `79c32c5`): independent `PASS`. Follow-ups that don't block, left open:
R2-1, phone list rows can still truncate the price at the end of the meta line (grid and editor
show it); R2-2, a `?create=` link followed while already on the storeroom does not reopen the
editor (the Party menu path works). The round 2 manifest recorded source digest
`2318ddec7b37988537525bcf42ad6447a101b5be9b1b21c21062c77f4d163638`.

### Follow-ups R2-1 and R2-2 (rounds 3 and 4)

- R2-1: phone list rows show the price as its own `.store-value` element (with `data-empty`),
  no longer appended to the ellipsized meta text.
- R2-2: `ItemStore` follows changes of the `?create=` parameter (state adjusted during render;
  oxlint rejects setState in effects), so a link followed inside the storeroom opens "New item
  for". Closing still removes the parameter.
- Round 3 (fingerprint `1a53992e…edfcf`): independent `CHANGES_REQUIRED`.
  - R3-1, blocking: a right-hand price column left about 85px for names at 150% text, and
    `overflow-wrap: anywhere` split words. Fix: the price sits on the meta line
    (`.store-row-line`), so the name keeps the full width; names use `break-word`.
  - R3-2: after a `?create=` link, the editor's own focus restore won over the storeroom's.
    Fix: `DefinitionEditor` takes `returnFocusToOpener` (default true). The storeroom passes
    false and returns focus to the visible trigger, or to New item after a link.
- e2e (`campaign-items.spec.ts`):
  - R2-1 at 390px, 100% and 150% text, checks that:
    - the price is not in the meta text, is not clipped and sits before ⋯;
    - every name spans the full row body, with the price below it;
    - the no-value state is marked; overflow, axe and 44px targets pass.
  - R2-2 follows the link twice from inside the storeroom with focus in search. Each time it
    checks the "Nuevo objeto para Arin" title, the preselected chip, Escape, URL cleanup and
    focus on New item.
  - Both new tests failed against the old source before the fix.
- Checks: `npm run check` passes (105 tests, build). `campaign-items.spec.ts` passes 48/48.
  Full `npm run test:e2e`:
  - Round 3 run: 242 passed and 1 failed with `net::ERR_NO_BUFFER_SPACE` on `page.goto`, a
    Windows network error. That test passed when rerun on its own.
  - Final run: 243/243 passed.
- Round 4 (fingerprint `467fd49cad05275dd983de3f56163545eba0608cf85237f723cd2afd0002a459`):
  independent `PASS`, recorded in `reviewer/review.md` and in the manifest. Optional, not
  blocking: a shorter phone no-value marker would leave more room for meta at 150%.
