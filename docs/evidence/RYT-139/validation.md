# RYT-139 — One concentration for sheet and fight

## Change

Migration `supabase/migrations/20261211120000_one_concentration_sheet_and_fight.sql` keeps the two
marks in step while the character's encounter is live (status initiative or active):

- Sheet to fight: changing `character_vitals.concentration` (casting from the sheet, ending it, a
  long rest) sets the same mark on the character's combatant, cut to the fight's 80 characters,
  and writes one `concentration` event to the combat log (`detail.from = 'sheet'`), so the DM's
  console shows it and the reminder on damage uses it.
- Fight to sheet: changing the combatant's mark (the DM or the Player in the console, dropping to
  0 hit points, an undo) sets the sheet's mark. A fight mark the sheet's rules refuse leaves the
  sheet as it was instead of failing the combat action.
- Joining: when an encounter goes live, and when a character combatant is added to a live one,
  the fight takes the sheet's mark, so a spell cast before the fight is there.
- Ending a fight clears the fight's marks after the encounter is already ended, so the sheet's
  concentration stays. Outside a live encounter the sheet behaves as in RYT-134.
- Triggers return at once when called from another trigger, so the two directions never call
  each other back. Writes still go only through the authorised, idempotent RPCs; no RPC
  signature, table, policy or grant changed.

Frontend: the sheet's concentration marker and the cast dialog no longer say that the DM keeps a
separate record; the unused `inEncounter` prop of the cast dialog is gone.

## Verification

- SQL (`tests/database/combat.test.ts` "RYT-139 keeps one concentration for the sheet and the
  fight while the encounter is live", public and PRE): a mark cast before the fight reaches the
  combatant when the fight goes live; a cast from the sheet reaches the combatant with one log
  event; a replay of the same request id changes no revision and adds no event; the DM ending and
  setting it in the console ends and sets the sheet; the Player ending it on the sheet ends the
  fight's; dropping to 0 hit points ends both; ending the fight keeps the sheet's mark. Denials:
  another Player, an outsider, another campaign's DM and anon cannot set it; the three trigger
  functions have no execute for anon or authenticated. All database tests: 492 passed.
- Browser: `casting.spec.ts` "RYT-139 during a live encounter the sheet keeps one concentration:
  no separate-record note"; casting and character-sheet specs at 390 and 820 px: 181 passed.
- Security review before production: go, with one medium finding fixed before applying: the
  sheet's log event showed the spell to teammates who do not see that character's concentration;
  it is now visible to the table only with live sharing on and no alias (SQL test: Bea sees the
  event while Arin shares, not after Arin stops; the DM sees both). Also applied: a hidden
  combatant's mark stays out of the Player's sheet (SQL test); when a fight goes live the sheet
  decides also when it has none, so a mark left from before a return to draft goes; the cut to 80
  characters drops a trailing space. Known and unchanged here: `set_concentration` and
  `apply_combat_hp` already log the spell with the fight's own visibility. Not covered by a test:
  a return to draft, and a fight mark the sheet's check refuses.
- Hosted (2026-11-20): applied to `rytta-staging`, then production. Stored md5
  `473fb4652eab6d2742c7d0368426288f`, 8597 characters, equal to the committed LF file in both.
  Production has the three functions and four triggers in `public`/`private` and in
  `pre`/`pre_private`; the functions are security definer with no client execute.

## UI review

PASS in one round at 390 and 820 px, Hearth and Parchment, Spanish and English, 100 and 150 %
text, reduced motion and keyboard: the marker and the cast dialog read cleanly after the removal,
with no leftover gap, and axe is clean. The reviewer judged that no new copy is needed (the old
note asked the Player to tell the DM; that action is gone). Pre-existing, optional: at 390 px in
Spanish the marker's End button wraps to its own row.
