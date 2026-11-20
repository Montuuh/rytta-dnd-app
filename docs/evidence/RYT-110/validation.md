# RYT-110 — Sheet: Metamagic options and Font of Magic conversions

Owner choices on the options page (2026-11-20): P4 A (one Convert entry under Sorcery Points),
P5 A (a created slot above the maximum, marked), P6 A (Metamagic in the sheet's choices).

## Changes

- Domain (`src/features/characters/domain/sorcery.ts`, `srd.ts`): the ten SRD 5.2.1 Metamagic
  options and costs (Heightened and Quickened 2, the rest 1); 2, 4 and 6 known at levels 2, 10
  and 17; the Creating Spell Slots table (1st: 2 points from level 2; 2nd: 3 from 3; 3rd: 5 from
  5; 4th: 6 from 7; 5th: 7 from 9).
- Metamagic: `build.metamagic` (unknown values are kept and grant nothing). Each known option is
  an entry under Sorcery Points with its cost, paid through the RYT-102 option model and refused
  when the points are short. The choices section lists all ten with a short rules line. Once the
  known count is reached, only the chosen ones stay listed; "Cambiar Metamagia" shows the rest,
  which cannot be ticked until one is cleared.
- Font of Magic: creating a slot spends its cost and refills a spent slot of that level, or adds a
  created slot above the table. Turning a slot into points uses an unexpended slot (a created one
  first) for points equal to its level, and is refused when the points would pass their maximum.
  Each is one play-state write (slots and points together, with the revision check). Created
  slots live in `tracker_uses` as `font-slot-<level>`: dashed pips, spent first when casting, and
  named in the history.
- Sync is unaffected: options are not trackers, so the tracker cap and spent points do not change.
- The Font of Magic dialog lists every level; a level that cannot be paid is drawn dashed and
  says why (cost and points left, minimum Sorcerer level, no slot left, or points at their
  maximum). Escape closes only the dialog, not the resources sheet under it.

## Verification

- Unit (`sorcery.test.ts`): known options only, costs, refusal without points, level gate; create
  refills before adding, cost and level limits, casting spends the created slot first; convert
  gives the slot level in points and is refused when not payable.
- Browser (`character-sheet.spec.ts`, 390 and 820 px, axe, overflow, 44 px targets): tick two
  options and the third is disabled; the options appear under Sorcery Points; create two level 1
  slots (one refills, one is extra: "4/4 +1"); spend Subtle; turn the created slot back into a
  point.

## Created slots and rests (owner request, 2026-11-20)

Before, any rest cleared created slots: the server's rest kept only uses of the sheet's
trackers. Migration `supabase/migrations/20261209120000_created_slots_survive_short_rest.sql`
patches the body of `private.rest_effect` (and `pre_private.rest_effect`) in place: a short rest
keeps `font-slot-` uses, a long rest clears them, and other unknown uses are still dropped. The
patch applies only when the exact expected text is found. The client's test mirror `applyRest`
follows the same rule.

- SQL: `tests/database/group-rest.test.ts` "RYT-110 keeps Font of Magic slots through a short rest
  and clears them on a long rest" on `public` and on PRE, with the helper denied to a Player, an
  outsider, the DM and anon. All database and character tests: 612 passed.
- Hosted: applied to `rytta-staging` (stored md5 `d62368071ac1c756b5d40ef73af9e5e6`, 2134
  characters, equal to the committed LF file; still security definer with an empty search_path;
  no execute for `authenticated`). A security review before production found no critical, high or
  medium issues; production was then patched: `private` and `pre_private` both carry the new
  filter, stored md5 equal, and `prosecdef`, `proconfig` (empty search_path), owner, ACL and
  volatility unchanged from the values read just before the apply.
- Not covered: a browser run of Font of Magic followed by a group short rest.

## UI review

Independent UI review of the RYT-140/108/110/111/150 batch: three rounds. Round 1 found three blockers in the Font of Magic dialog (Escape also closed the resources sheet, content not full width, unpayable levels looked selectable); round 2 found a cut mode label at 150 % text in Spanish. All were fixed; round 3 passed on the current source at 390 and 820 px, Hearth and Parchment, Spanish and English, 100 to 150 % text. Open notes: the glossary entry for species lineages is labelled as a class feature (pre-existing), and the sheet overflows horizontally at 200 % text with the dialog open.
