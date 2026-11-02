# RYT-026 independent UI/UX review — round 2

Verdict: **CHANGES_REQUIRED**

Source fingerprint: `41acbdd34ad181c7cbf3020181ee5a6abc8f0a939b9ce0e9b5ee5102406b794e`.

## Fixed from round 1

At 390px and 820px, keyboard activation of direct unequip retains focus on the
remove button when the request fails, and focuses the empty body socket after
successful retry. AC changes from 14 to 13. Independently reproduced with the
rebuilt application and HTTP fixtures.

## Remaining finding

- **P2 — Partial shop addition loses keyboard focus.**
  `src/features/shops/ui/stock-list.tsx:541`, Spanish/dark, 390px and 820px.
  Select two items and press Enter on Add 2 items. If the first succeeds and the
  second fails, the pending selection and inline error correctly remain, but
  focus is BODY. The loading button is disabled natively, losing focus before
  the error arrives. Keep a focusable busy control with a guarded handler or
  restore focus to the retry control/inline error after failure.

The pending item alone remains selected; retry sends the same request ID for
that item, succeeds and closes the drawer. Both error states have zero axe
A/AA violations. The mobile 150% screenshot also shows the duplicate global
error toast temporarily overlapping the drawer action area; the inline error
already provides persistent feedback.

Evidence: `recheck.mjs`, `round2-results.json`,
`round2-390-shop-partial-error.png`, `round2-820-shop-partial-error.png`,
`round2-390-unequip-error.png`, `round2-390-unequip-success.png`,
`round2-820-unequip-error.png`, `round2-820-unequip-success.png`.

Visually inspected the mobile partial-error and tablet unequip-success captures.
The scope and fixture limitations in `review-round1.md` continue to apply.
