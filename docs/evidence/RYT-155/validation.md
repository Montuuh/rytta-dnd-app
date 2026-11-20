# RYT-155 — Combat log keeps a teammate's concentration private

## Change

Migration `supabase/migrations/20261212120000_combat_log_concentration_private.sql` patches
`get_combat_state` (and `pre.get_combat_state`) in place. For a viewer who is not the DM's full
view, and an event about a character whose concentration the projection already hides from that
viewer (not their own off the table screen, and not shared: live sharing off, an alias, or no
Player owns it), or about a combatant that left the fight; any unknown hides:

- `concentration` events, and undo events of one, are left out of the list (without the spell they
  would read as an end of concentration, which may be false);
- other events keep their place without `spell`, `concentration`, `concentration_dc` and
  `concentration_lost` (a damage event, for example).

The rule is applied when the log is read, so a teammate who stops sharing also stops showing
earlier concentration events. Creatures, the DM's view and the viewer's own character are
unchanged. Nothing stored is rewritten; no write path, table, policy or grant changes. The patch
requires each expected line exactly once and keeps owner, security definer, search_path and
grants.

## Verification

- SQL (`tests/database/combat.test.ts`, public and PRE) "RYT-155 keeps a teammate concentration
  out of the combat log where the projection hides it": the DM and Cato's own Player read the
  spell and the DC; a teammate and the table screen see Cato's damage event without the DC and no
  concentration event, while Arin (sharing) keeps the spell; under an alias Arin's goes too;
  an undo of Cato's concentration is not returned to the teammate; a character no Player owns
  shows no concentration keys; outsiders, another campaign's DM and anon still read nothing. The
  test fails without the migration. The RYT-139 case now expects the earlier event to go once Arin stops sharing. All
  database tests: 493 passed.
- No interface change: the client already renders events without these keys.
- Security review before production: round 1 was no-go on one medium finding: for a character no
  Player owns the mask evaluated to NULL and showed the details to Players. Fixed (`is not distinct
  from`, and any unknown hides) together with a low one (undo events of a hidden concentration).
- Round 2 of the security review: go. Hosted (2026-11-20): applied to `rytta-staging`, then
  production. Stored md5 `beb35d28e734167505c0f38c002daf1a`, 3942 characters, equal to the
  committed LF file. Production `public.get_combat_state` and `pre.get_combat_state` carry the
  patch, stay security definer with an empty search_path, and execute only for `authenticated`.
