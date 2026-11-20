# RYT-151 — One primary action per screen

The owner approved the options on 19 November 2026: selection is accent ink with a rail or underline on a light tint, never the fill (P3 A), and the filled action on each screen is the one used at the table (P4 A).

## What changed

- Shared selection tokens and classes in `src/app/styles.css`: `--app-select-tint`, `--select-rail`, `--select-underline`, the pressed `.category-chip` (accent outline and a check instead of its glyph), `.ink-segments`, `.ink-seg`, `.select-toggle` and `.tabular`. The command-centre tabs use a rail in vertical lists and an underline on the tablet tile grid. The selected shop uses a rail.
- Item storeroom: Distribute loot is filled and New item is outlined. Manage catalogue stays a quiet link. Give and Add to shop moved into each row's named actions menu at every width.
- Members: Invite player is filled. Set level N is outlined, always shown, and enabled only when the stepper differs from the campaign level. After saving, focus returns to the heading.
- Shops: Add item is filled and New shop is outlined. Stock and Pending orders read as one ink segment. The ledger count is light.
- Combat: the only fill is the fight-flow action (Start, Next turn). Adding the party and adding a creature are outlined. The target-selection toggle, the In progress badge, the acting initiative well and spent uses no longer use the fill; a spent use shows a check instead of a cross. Removing an effect is a red text button (Remove) instead of a bare cross. Bench rows show the Add verb. The console tabs and the creature form segments are underlined. Initiative carries a visually hidden label. Amount results and temporary hit points carry their unit (PG/HP).
- Bestiary: New creature is outlined, so Add to encounter in the stat block is the only fill. The source segment is underlined. Checked type tiles use the tint and ink. Row meta uses tabular figures.
- Session preparation, Dice and the table screen already met the rules; the table screen's initiative already had tabular figures and a hidden label.

## Evidence

Before captures (Spanish) are in `before/`, and after captures (Spanish and English) are in `after/`. Every screen was captured at 390 and 820 pixels in Hearth and Parchment from the e2e fixture backend: items, members, shops, prepare, dice, bestiary (viewport only), combat, console and table. The before capture of the DM console was taken with the original combat styles.

## Verification

- `npm run check` passed, including typecheck, lint, architecture, docs, 1,107 unit and database tests, and the production build.
- New browser test: the storeroom and shops show exactly one filled text-bearing element in `main` (Distribute loot, Add item). The open tab carries an inset rail, the pressed filter shows its check, and the stock and orders segment marks the current view and opens the ledger. The party-level test checks that Set level is outlined and disabled after saving, and that focus returns to the heading.
- The full Playwright suite ran on separate ports alongside other sessions: 1,349 passed. Every failure came from load, trace files deleted during the run, or the sign-in test that expects port 4174. Rerun alone, the identity and character sheet specs passed except that port-bound test (194 passed). The two combat assertions on the initiative well now expect its accessible text ("Iniciativa 18").
- The independent interface review returned CHANGES_REQUIRED on the first pass. The blocker was the filled In progress badge on the encounter list. It also flagged underline versus rail on the console tabs, unmarked segments, light buttons that looked like selection, and bare row icons in the storeroom. After those fixes, the second pass returned PASS: axe was clean, targets were 44px, keyboard and Escape worked, and 150% text did not overflow, at 390 and 820 in both themes.

## Open points

- Shops: the Stock segment sits right above the Stock heading, and Pending orders repeats the ledger tab without its count (minor).
- Session preparation and Dice have no filled action. The rule is read as "at most one".
- The target-selection toggle changes its label as well as its pressed state, and Escape does not leave selection mode. This predates the ticket.
