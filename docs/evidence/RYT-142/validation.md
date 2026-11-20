# RYT-142 — Initiative modifier derived by the server, and hidden re-rolls kept hidden

## Change

Migration `supabase/migrations/20261210120000_initiative_modifier_from_sheet.sql`:

- `private.initiative_cap(campaign, character)` (and `pre_private`): the initiative bonus the sheet
  allows, the client's rule: the Dexterity modifier of `baseAbilities.dex + bonuses.dex` (capped
  at 30) plus the proficiency bonus of the sheet's level when a feature is named Alert or Alerta.
  No execute for any client role.
- `public.log_roll` (and `pre.log_roll`) patched in place: an app initiative roll of a character
  made by someone who is not the campaign DM, with a flat modifier above the cap, is refused with
  "Initiative bonus" and nothing is written. A lower modifier is accepted. DM rolls, recorded
  rolls and other kinds are unchanged; so is the call shape the production frontend uses.
- `public.reset_initiative_roll` (and `pre.`) patched in place: a DM re-roll of a hidden combatant
  is stored with visibility `roller_dm`, so no Player reads it even when the table shows rolls to
  everyone. It was already unlinked from the encounter.
- The patch reads each function with `pg_get_functiondef`, requires the exact expected text once,
  and fails otherwise. Owner, security definer, search_path and grants are kept; grants are
  restated.

Frontend: the initiative entry computes the bonus at the sheet's level (before, Alert always added
+2), and so does the DM's re-roll. On an "Initiative bonus" refusal the entry reads the sheet
again: a changed bonus says "Tu ficha se ha actualizado y no se guardó ninguna tirada. Vuelve a
tirar." and offers a fresh roll; the same bonus says "Rytta no acepta el bonificador de tu ficha y
no guardó ninguna tirada. Pide al DM que fije tu total." and offers no retry that would fail
again. Refusals use the error style of the line. No number is shown for a refused roll.

## Verification

- SQL (`tests/database/one-roll-per-fight-and-rest.test.ts`, public and PRE, 68 passed):
  Alert at level 5 with DEX 15 allows +5 and refuses +6 with nothing stored; a penalty is
  accepted; the DM rolls +9 for a character; a Player's +30 is refused; a hidden combatant's DM
  re-roll is `roller_dm` and unreadable by both Players at a "table" visibility campaign while
  the DM reads it. Denials: the helper refuses a Player, an outsider, another campaign's DM, the
  DM and anon; an outsider and another campaign's DM still cannot roll for the character.
- Browser: `dice.spec.ts` "RYT-142 initiative: a refused modifier re-reads the sheet; the same
  bonus sends the Player to the DM" and "RYT-142 initiative: after a refusal a changed sheet lets
  the Player roll again"; initiative specs in dice and combat at 390 and 820 px: 82 passed.
- Security review before production: no critical or high findings. Applied from it: a hidden
  re-roll is narrowed to `roller_dm` only when the campaign shows rolls to the table (a narrower
  setting is kept); a negative cap still lets a plain d20 roll; earlier hidden re-rolls readable
  by Players: counted in production on 2026-11-20, none, so no data change; `docs/security.md`
  updated; the cap is documented as a consistency guard (a Player edits their own sheet).
- The helper is plpgsql so a PRE refresh can copy it before the rest helpers it calls, and a
  partial PRE without them gets neither the helper nor the patches (`pre.test.ts` and
  `item-lifecycle.test.ts` build such copies). All database tests: 491 passed.
- Hosted: `rytta-staging` received the first revision (md5 `773376cde30c2abde5cd2b1c4c46b874`)
  and was then brought to the final behaviour by an equivalent checked block (helper recreated as
  plpgsql, the two changed lines replaced); staging has no PRE. Production received the final
  file: stored md5 `9a29d292f2554179023cad852a4b9448`, 6430 characters, equal to the committed LF
  file. `public` and `pre` `log_roll` and `reset_initiative_roll` carry the patch and keep
  security definer, the empty search_path and execute for `authenticated` only;
  `private.initiative_cap` and `pre_private.initiative_cap` have no client grant.

## UI review

Two rounds. Round 1 (CHANGES_REQUIRED): the refusal told the Player to reload the sheet but the
button only retried the same request; refusals looked like plain hints; the DM re-roll computed
Alert at level 1. All fixed; round 2 passed at 390 and 820 px, both themes and languages, 100 and
150 % text, reduced motion and keyboard only. Open minor notes for a later pass: the "ask the DM"
state does not clear by itself when the sheet's bonus changes later (closing and reopening the
entry does), and the disabled button is not described by the reason line.

Load note: `dice.spec.ts` RYT-137 ran 5 times at 390 and 820 with 6 workers: 299 of 300 passed;
the one failure was the keyboard focus case after a row-menu reset on tablet, which passes alone.
