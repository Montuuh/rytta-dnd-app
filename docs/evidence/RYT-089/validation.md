# RYT-089 verification: a bestiary per campaign

Date: 2026-11-12. Decision: [ADR 039](../../decisions/039-campaign-bestiary.md).

## Design flow

- Options page published on 2026-11-12 (six questions). The user chose: link, not copy; one
  download button for all 330 creatures; edit in place; existing campaigns start without the
  official bestiary; the campaign's bestiary rules everywhere; creatures can be removed.
- Design brief, refinement, implementation, then two isolated
  design review passes on the rendered result (A: critique, B: detector and technical audit).

## Database

Migration `20261115120000_campaign_bestiary.sql` (tables `campaign_srd_bestiary` and
`campaign_srd_removed`, `combatant_templates.srd_override`, `get_srd_bestiary`,
`set_srd_bestiary`, `save_combatant_template` and `list_combatant_templates` redefined).

| Layer | Result |
| --- | --- |
| PGlite (`npm run test:db`) | 155 passed. `campaign-bestiary.test.ts`: download, remove, replay, invalid actions; one version per creature, no switching, removal deletes versions but not "based on" copies; denials for Player, outsider, another campaign's DM, a former member and anon; direct writes denied; another campaign's `remove_all` leaves this one; the private helper is not callable; the 1000 cap; live encounters get a new revision and the combatant's `template_id` becomes null; the PRE mirror has no `public.`/`private.` references. `pre.test.ts` counts 43 tables. |
| Security review | `security-reviewer`: approve with fixes. Applied: PRE source scan, `security invoker` helper, live fight refresh, removal cap, more denial tests, the `security.md` paragraph. Left as a follow-up: a deleted version's image stays in the private bucket (M1). |
| Hosted PRE | The remapped DDL ran inside a transaction that was rolled back. Checked: no production references, RLS on, no anon or authenticated writes, helper not executable. With the PRE DM: download, version, remove wolf → `versions_removed = 1`. The PRE Player gets `Forbidden` and reads 0 rows. |
| Production | Applied with `apply_migration` as `campaign_bestiary` (version `20261112180139`). Verified: anon cannot execute, `authenticated` cannot execute the helper, both tables have RLS and no INSERT grant, not in realtime. Data after: 2 campaigns, 1 template, 0 versions, 0 downloads. Advisors: the same categories as before (security definer warning, `rls_enabled_no_policy` info on `rest_votes`, leaked password protection). |

## Interface

- `npm run check`: passed (typecheck, lint, contracts, 52 files and 361 unit/SQL tests, build).
- e2e at `identity-mobile` (390), `identity-tablet` (820) and `identity-desktop` (1440):
  `bestiary.spec.ts`, `bestiary-official.spec.ts`, `combat.spec.ts` and `encounter-builder.spec.ts`
  123 passed, 7 skipped (the `limitMatrix` rule). `bestiary-official.spec.ts` covers the empty
  state, the download question (Cancel returns focus), an untouched save that creates no version,
  the version note and its way back (focus on the creature's Edit button), removing one creature,
  bringing it back, removing the whole official bestiary (focus on the download), axe, overflow
  and 44px targets.
- Captures inspected at 390x844 and 820x1180 in Hearth (dark) and Parchment (light): empty state,
  download dialog, downloaded list, official stat block, its menu, editor, saved version, official
  menu, head at 150% text (no overflow), the restore question, the restored creature and the
  danger menu items in Parchment. With motion on, the download dialog still shows its title while
  it closes; after going back to the official version focus is on "Editar" at both sizes and
  themes. Evidence: `empty-*`, `download-*` and `version-*` here, and the curated captures in
  the review report.

## design review

- A (critique): 26/40. Applied: the head wraps as two rows on phones; an untouched official
  creature is not saved as a version; one primary action in the empty state; the official tab is
  hidden until downloaded; a named "Bestiario oficial" menu; loss first in the dialogs; one version
  note with "Volver a la versión oficial" instead of two pills; consistent dialog icons; focus
  returns to the menu button and to the download after removing everything; the version save
  notice; a version keeps the official creature's other-language name for search.
- Not applied from A: favourites carried from `srd:` to `hb:` keys, an undo in the removal notice,
  the pre-existing duplicate key warning.
- B (detector, overlay and technical audit): detector clean; audit 17/20. Applied: destructive
  menu items in the theme's `--danger` (Mantine red was 3.28:1 on Parchment, now AA in both
  themes; the creature's "Eliminar" too); the confirm dialog keeps its last question while it
  fades out (it closed empty, with an unnamed button for about 200ms); focus after going back to
  the official version lands on the creature's Edit button (the stat block no longer closes and
  reopens: the official key is selected before the version is deleted); balanced dialog titles and
  bodies; the empty state reuses `.bst-empty`; the version note reads
  "Modificada en esta campaña", matching the row's "Modificada"; the notice close button is
  labelled "Cerrar" instead of "Cancelar" (pre-existing).
- Not applied from B: Mantine Menu's focus sentinel trips axe `aria-required-children` and needs
  ArrowDown to reach the first item (library behaviour, every menu, pre-existing); the other
  `color="red"` uses across the app (105, outside this delivery).

## Not verified

- Hosted Supabase integration through the browser (e2e use fixture route mocks).
- Real devices and iOS safe areas.

## Review

### Round 1 (fingerprint `5dfb0fe5…`): CHANGES_REQUIRED

Joint UI review with RYT-088, see the review report.

- B1 (blocking): without the official bestiary, "Add combatants" said it searched the SRD and the
  encounter ideas advised another creature type. Fixed: the search help names the campaign's own
  creatures, and both screens say the campaign lacks the official bestiary with "Abrir el
  bestiario" (a link to the DM bestiary, where it is downloaded). New e2e:
  `RYT-089 without the official bestiary, the fight screens say why and lead to the bestiary`.
- m3: the English restore question now matches its button ("Restore the official version of
  Wolf?"); the removal body points to the "Official bestiary" menu without quoting an item label.
- m4: a campaign version is listed among the official creatures in the add-to-fight search,
  marked "Modificada".
- Evidence: the 150% head capture is retaken.
- Left as stated minors: two full-width head buttons on phones (m1); right after saving a version
  at 390, the save notice and the two-row note push AC/HP under the action bar (m2); the version
  note's side rule versus the builder's hairline (m5).

### Round 2 (fingerprint `4268b5d7…`): PASS

Joint re-review with RYT-088 after both sets of fixes, appended to the same report. Checked in the
browser: both combat screens without the official bestiary at 390 and 820, ES and EN, both themes,
150% text (reason, 44px link with a visible focus ring, keyboard reach, Escape, Enter opens the
bestiary with the download in view); the English restore and removal copy; the version in the SRD
group of the add-to-fight search; the retaken capture. Checks on this fingerprint: `npm run check`
passed (52 files, 361 tests, build); e2e bestiary, bestiary-official, combat and encounter-builder
at 390/820/1440: 125 passed, 7 skipped. Recorded in `docs/evidence/ui-review-current.json`
(the UI review check passes).

After the PASS, test only: the 44px check of the "Abrir el bestiario" link measured nothing (its
selector matched no element); the spec now measures the link itself (6 passed at 390 and 820).

Non-blocking findings left for follow-up:

- In Hearth, the danger menu items of RYT-088/089 drop to 3.97:1 while highlighted (keyboard or
  hover); at rest they pass.
- In a campaign with neither the official bestiary nor its own creatures, opening "Del bestiario"
  shows "Ninguna criatura coincide." before typing, over the first line of the hint at 390.
- Seen in code only: if the SRD index fails to load, the hint could say "sus 0 criaturas".
- Outside this delivery: older delete items with Mantine red fail AA in Parchment (for example
  "Borrar encuentro", 3.28:1).
- From round 1: m1 (two full-width head buttons on phones), m2 (save notice plus the note at 390),
  m5; favourites on `srd:` keys, no undo after removing, the Mantine menu focus sentinel; a deleted
  version's image stays in storage (ADR 039).

