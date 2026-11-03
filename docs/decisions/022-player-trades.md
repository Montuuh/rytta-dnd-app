# ADR 022: player trades with a two-sided offer and double confirmation

Date: 2026-11-03. Status: proposed for `RYT-034`. Builds on ADR 014 (inventory ledger and
idempotency), ADR 016 (server-side gold moves) and ADR 020 (party live sharing).

## Context

At the table, Players hand each other potions, gear and coins. Until now only the DM could move
gold (`set_character_resources`) or grant items, so a hand-over meant asking the DM. The user
asked for a World of Warcraft style trade window: one Player invites another, the receiver gets a
centered popup, both place items and gold, both accept, and the result is recorded.

## Decision

- Two tables, read-only through the Data API: `trades` (participants, status
  `invited/open/completed/cancelled/declined/expired`, `revision`, offered gold per side, one
  confirmation flag per side, expiry, completion `summary`) and `trade_offer_items` (stack,
  side, quantity; up to 8 stacks per side). RLS lets the owners of both characters and the
  campaign DM read a trade; nobody writes directly.
- Six `security definer` RPCs with a fixed search path, executable by `authenticated` only:
  `invite_trade`, `respond_trade_invite`, `set_trade_offer`, `confirm_trade`, `cancel_trade`
  and `get_trade_state`. Mutations reuse the RYT-004 guard (`private.inventory_begin`): campaign
  row lock, `private.can_play_character` and request-id replay. The campaign lock serializes
  trades with inventory, shop and resource writes, so no per-row lock ordering is needed.
- The actor always names the acting character. Players act for their own assigned character; a
  DM can act only for an assigned character it can play, which is the RYT-028 Player preview.
  Unassigned characters never trade.
- Every offer change increments `revision` and clears both confirmations. A confirmation must
  name the current revision, so a stale screen cannot accept an offer it has not seen. When both
  sides have confirmed, `private.trade_complete` re-validates every stack (owner, not equipped,
  quantity) and both balances, moves units into the receiver's loose stack of the same
  definition and `source`, applies net gold with the RYT-005 `private.move_gold`, writes
  `trade_in` / `trade_out` inventory events for both characters and a `trade_completed`
  character event per side. Any failure raises and rolls the whole confirmation back.
- A confirmation that arrives after the trade completed on the same revision returns the
  completed result (double confirmation is idempotent). Retries with the same request id replay.
- One active trade per character (RPC check plus partial unique indexes). Invitations expire
  after 2 minutes; open trades after 10 minutes without changes. Mutations sweep expired rows;
  reads report the effective status.
- `get_trade_state` returns the acting character, partners (assigned characters: id, name, busy
  flag), the own tradeable stacks, the active trade from the viewer's perspective ("you" and
  "partner"), the last trade that closed within a minute and the last 10 completed trades. It
  never returns the DM item value or the partner's balance.
- Realtime: `trades` joins the `supabase_realtime` publication (guarded; RLS filters events).
  The client subscribes to `postgres_changes` for the campaign and invalidates the trade query.
  Polling stays on as the fallback: 3 s while a trade or invitation is live, 10 s when idle.
- UI (`src/features/trades`): a route layer under the campaign boundary renders the centered
  invitation (Escape or close postpones it to a floating dock; Decline answers), the trade
  window (two columns of 8 slots, gold stepper, a seam with one lock seal per side, any change
  unlocks both), a bottom-sheet item picker on phones and a completion summary. Party gets a
  "Trade" action on teammate cards, a character picker and the recent trade history. Trade rows
  appear in the existing inventory ledger and the DM audit timeline.
- PRE: the migration mirrors tables, policies and functions into an existing PRE with
  `pre_admin.remap`, like the ETL clone, and adds `pre.trades` to the publication.

## Consequences

- Partners are every assigned character of the campaign, not only those shared live: sharing
  hides combat state, not existence. Names and the busy flag are the only data exposed.
- A future PRE refresh recreates `pre.trades` without the publication membership; PRE then relies
  on polling until it is re-added.
- Gold and items move only inside the completion transaction; Players still cannot edit gold.
- Trades are not undoable from the inventory ledger; a reverse trade is the remedy.
