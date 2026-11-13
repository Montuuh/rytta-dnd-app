# RYT-095–098 verification

Date: 2026-11-13. Decision record: [ADR 041](../../decisions/041-party-portraits-claim-leave.md).
Tickets: RYT-095 (leave a campaign), RYT-096 (claim a free character), RYT-097 (party led by
portraits), RYT-098 (one image viewer).

## Design

- Options page answered by the user (all recommendations), plus one follow-up: free characters are
  only the ones that never had a Player.
- Design critique (review + mechanical detector) on the rendered captures. Applied: DM plate face
  crop, one-row DM head with a quiet reserve link, 8px teammate HP band, no off-centre halo on empty
  portraits, inline teammate conditions, one wording for unfinished sheets ("Ficha sin terminar" /
  "Terminar ficha"), exhaustion pips named by what a tap does, wider teammate cards at 820, tonal
  "Jugar" claim buttons with aligned footers, no disabled claim slabs on a full roster, secondary
  free cards in My characters, claim dialog with the portrait, centred claim and leave dialogs,
  Leave grouped under the campaign name away from Sign out, the viewer's remove confirmation moved
  out of the tapped slot with a 400 ms guard, upscaling capped at 2× and a left-aligned caption.
  Kept by the user's choice: the trade control is an icon on the teammate's portrait.
- Detector: 0 findings on the changed markup; browser overlay flagged only the empty-portrait halo
  (fixed) and the global body font (out of scope).

## Data

| Layer | Result |
| --- | --- |
| PGlite (`npm run test:db`) | 180 passed. `party-claim.test.ts` (17): overview nulls for unshared teammates, portraits of free characters, list and claim denials (anon, outsider, former member, DM, Player and DM of another campaign, cross-campaign ids), claim, idempotent retry, race, limit, archived, absent, never-assigned rule (Player left, DM unassign), pending and expired invitations, unfinished encounters (draft, hidden, active, ended), backfill without audit rows, grants, PRE mirror without production references. |
| Security review | Approve with fixes. Applied: free characters exclude unfinished encounters (M1, M2), PRE always re-applied (L2), class labels truncated (L3); the "free" definition (M3) went to the user, who chose "only never-assigned". State-based idempotency documented (L1). |
| Hosted PRE | Remapped DDL ran in a rolled-back transaction: seven functions in `pre`/`pre_private`, no production references, `ever_assigned` added and backfilled without audit rows, `claim_character` executable by `authenticated` only, helpers not executable. |
| Production | Applied with `apply_migration` as `party_claim_characters` (version `20261113184459`), which also re-applied the remapped DDL to PRE. After: 15 characters, 9 marked as having had a Player, 5 free; 419 audit rows before and after; audit triggers enabled; anon cannot execute the new RPCs; helpers not executable by `authenticated`. Advisors: same categories as before; the three new warnings are the intended security-definer RPCs. |

## Interface

- `npm run check`: passed (typecheck, lint, contracts, 57 files and 406 unit/SQL tests, build).
- Full Playwright suite: 564 passed, 45 skipped (the `limitMatrix` rule), 0 failed. New coverage:
  no new-character card or trade launcher, DM header create, DM counters through
  `set_character_resources`, unshared teammate without live data in the DOM and the response, trade
  from the portrait icon (also with an unshared teammate), claim in two taps with focus on the new
  character, claim from My characters, lost race, limit, DM never sees free characters, leave from
  the card menu and the profile menu, last DM disabled, dialog errors, the shared viewer (zoom,
  Escape over drawers, focus return, rows keeping their action, no nested buttons, double tap on
  Remove does nothing).
- Captures at 390x844 and 820x1180 in Hearth and Parchment (ES, plus EN), and 1440 for Party:
  `docs/evidence/RYT-095/`, `docs/evidence/RYT-096/`, `docs/evidence/RYT-097/`,
  `docs/evidence/RYT-098/`. Portrait art in captures is bestiary art served only by the test mocks.

- Independent UI review: PASS, then a focused re-review PASS after two accessibility fixes (the
  trade icon's focus ring now has a dark backing over light art; exhaustion pip names start with the
  visible number) and copy polish ("Comerciar con", "Ahora juegas con", "Ficha sin terminar", the
  leave status no longer returns after a reload, the claim-list retry on its own).

## Not covered

- Real Supabase Storage signed URLs, PostgREST and two concurrent sessions racing for a claim
  (PGlite has one connection; the campaign lock serialises claims).
- iOS Safari (pinch was tested with synthetic events in Chromium).
- The hosted frontend: nothing was released.
