# RYT-129 — Combat recap credits damage correctly

## Change

Migration `supabase/migrations/20261208120000_combat_summary_attribution.sql` replaces the private
helper `private.combat_summary(uuid)` (and its PRE mirror `pre_private.combat_summary`) with the
same signature. Damage is still credited to whoever held the turn, but only when the target is on
the other side: party and allies against enemies. Damage to an ally or to oneself, healing and
temporary hit points are never damage dealt. Damage taken, healing and downed are unchanged.

Not changed: tables, policies, grants (execute stays revoked from public, anon and authenticated),
the Player projection (hidden creatures are still masked by `get_combat_state`) and the summaries
of encounters that ended before the migration (no data rewrite).

## Verification

- SQL test `RYT-129 credits damage dealt only between opposing sides` in
  `tests/database/combat.test.ts`, run on `public` and on a PRE copied before the combat
  migration: the DM downing Arin (20) on Cato's turn is not Cato's damage; Cato hurting himself is
  not counted; Cato's hit on a goblin is (3); a goblin's hit on Bea counts (5) and its hit on the
  other goblin does not. The old rule would have credited Cato with 23.
- Denials in the same test: Player, outsider and the DM cannot call the helper (`permission
  denied`); an outsider and a DM of another campaign cannot read the encounter; anon is denied
  both. The Player recap still hides the never-revealed ogre.
- `npm run check`: all unit and SQL tests pass.
- Hosted (2026-11-20): applied to `rytta-staging` first, then production (`Rytta`). Stored
  statement md5 `7c5e2b4679f382d05d0998eff6a1f424`, length 2620, equal to the committed file (no
  backslash escapes). Production has the new body in `private` and `pre_private`; `authenticated`
  has no execute on either.

## Not covered

- The recap at 390px with a real ended fight in production: the recap UI is unchanged and reads
  the corrected numbers; no new encounter was ended in production for this check.
