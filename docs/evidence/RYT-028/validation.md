# RYT-028 verification

Date: 2026-11-03. Branch `worktree-agent-a36f2c17bb8ec1cfb`.

## Changes

- Removed the equipped-items list and help text under the paper doll; unequip stays in the slot drawer.
- The Player preview ("view as player") is now editable in the satchel and the character sheet:
  `canEdit` no longer depends on `playerPreview`. This supersedes the RYT-026 note that the preview
  stays read-only (the RYT-026 acceptance remains historical). The Party page preview gate is unchanged.
- Removed the DM storeroom shortcut button from the satchel (and its empty state) and the
  "View and change equipment" link from the character sheet. The storeroom is reached from the
  DM Command Center.
- `html { scrollbar-gutter: stable; }` in `src/app/styles.css` so the page width no longer jumps
  when a module appears or loses a vertical scrollbar.
- Removed the unused `catalogue.equipmentHelp` and `catalogue.openEquipment` i18n keys.

## Automated checks

| Check | Result |
| --- | --- |
| `npm run check` | Pass |
| `npm run test:e2e` first run | 240 passed, 3 failed (`inventory.spec.ts` forge test, selector for the removed storeroom link) |
| `npx playwright test inventory.spec.ts` after rewriting that test | 21 passed |

E2E tests updated (not skipped): `campaign-items.spec.ts` (sheet equipment link and equipped-list
unequip buttons now go through the slot drawer) and `inventory.spec.ts` (storeroom opened via
`?panel=items`).

## Not verified

- Rendered 390px and tablet screenshots were not captured (dev server uses PRE credentials).
- Independent `ui-ux` review is pending, so the ticket stays in `review`.
- The scrollbar-gutter fix was not measured in a real browser with overflowing and non-overflowing pages.
