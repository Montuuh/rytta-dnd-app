# RYT-149 — Item card: using comes first, discarding moves out of the way

The owner approved the options page on 19 November 2026: discard folds under the seal (B), a result line with undo sits under the seal (A), and a More actions menu in the card header holds Discard, Offer in trade and Give. Give is a one-sided trade that the receiver accepts. No backend change was made.

## What changed

- The use area leads. "Gasta 1 de N" / "Spends 1 of N" sits above the hold-to-use seal, and the seal's behaviour is unchanged. Items with numeric rations or water also show what one unit gives. The item schema has no structured healing value, so a potion's healing stays in its description.
- The discard amount, All and Discard fold into a "Descartar…" disclosure under the seal (`aria-expanded`, `aria-controls`). Opened, it shows the RYT-125 stepper capped at the stack and an outlined danger Discard button. Discarding is a two-step action: open the row, then press Discard N. The ten-minute undo stays available afterwards. The DM card keeps its amount field, Give N more and Edit item.
- After a use, a result line under the seal reads "Usaste 1. Te quedan N" / "Used one, N left", with Undo and a fuse showing the undo window. It replaces the old undo block at the top of the card. The line is hidden while an error is shown, so a failed use never appears successful.
- The More actions menu (named, 44px trigger next to close) holds Discard…, Offer in trade to… and Give to…. Offer and Give appear when the viewer acts as the card's character, has trading partners and the stack is not equipped. The menu lists the campaign's active Player characters other than the owner, as returned by `get_trade_state`. Choosing one sends the existing trade invitation. Once the partner opens the trade, `set_trade_offer` places this stack with the chosen quantity. Give also seals the giver's side, so the receiver only has to accept. When Offer and Give do not apply, the card has no menu and only shows the Discard disclosure. This covers the DM card and a Player without trading partners.
- Focus: choosing Discard… lands on the amount field. Offer and Give land on the panel heading, and Cancel or sending returns focus to More actions. Escape closes the menu first and then the card.

## Activation paths

- Keyboard Enter, hold, and assistive-technology activations (clicks without a pointer press) each spend one unit.
- A short pointer tap arms "Usar ahora" / "Use now" as the approved seal design does. That explicit control then spends one unit.
- Two activations before the stack reloads spend one unit. A guard skips a second use against the same stack revision. A failed use clears the guard, so the next activation can retry, and a double activation on retry still spends one unit.

## Verification

- `npm run check`: typecheck, lint, architecture and documentation contracts, 1,107 unit tests, and the production build all passed.
- Browser specs `tests/e2e/inventory.spec.ts` and `tests/e2e/trades.spec.ts` ran at 390 px and 820 px with touch: 27 passed. One case is intentionally limited to 390 px.
  - New inventory case: a double activation sends one `use_item` request. Hold spends one, and Undo restores one. A failed use shows the error without a result line. A double-activation retry sends exactly one request and succeeds. The discard controls stay hidden until the row is opened.
  - New trades case: Arin opens the menu, which lists three items and passes axe. Discard… focuses the amount, and Escape closes only the menu. Arin then gives two potions to Bea. The card shows the waiting line. When Bea opens the trade, the offer holds exactly that stack and quantity with no gold. Arin's side is already sealed, and Bea's single acceptance completes the trade.
  - The existing cases cover the discard cap, Spanish and English, Hearth and Parchment at 150% text with reduced motion, axe, overflow and 44 px targets.
- Captures in this folder: 390 px Hearth Spanish and 820 px Parchment English for the card, the menu, the Give panel, the open Discard row and the result line. One more shows the DM card at 820 px in Hearth Spanish.

## Not covered

- Offer in trade end to end. It shares the Give path without sealing the giver's side.
- Declined or expired invitations while an offer waits. The waiting request is dropped when the invitation ends, but no browser case covers it.
- Real phones and real screen readers.
- The offer is placed by the giver's open app when the partner accepts. If the giver closes the app first, the trade opens empty and items can be added in the trade window as before.
