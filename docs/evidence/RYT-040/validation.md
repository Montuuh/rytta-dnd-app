# Delivery RYT-040: Edit and delete homebrew glossary entries

Date: 2026-11-03. Worktree branch `worktree-agent-a4d68530bd38f1772`, cut from `main` at `c9ed08f`.
Not pushed or merged. Status set to `review`; the independent ui-ux review is still pending and
`docs/evidence/ui-review-current.json` was not touched.

## Outcome

The user reported that homebrew rules in the glossary could be neither edited nor deleted. The
backend was never the problem (see root cause). Edit and delete now exist everywhere a homebrew
rule is shown, with designed controls, a named delete confirmation and a recoverable conflict.

## Root cause

Not SQL. `public.save_glossary_entry` and `public.delete_glossary_entry` are correct:

- Hosted function bodies in `public`/`private` and `pre`/`pre_private` are identical once the
  schema names are normalised (md5 of `pg_get_functiondef`), and both are `SECURITY DEFINER`,
  executable by `authenticated` and not by `anon`.
- A rolled-back probe in PRE as the campaign DM created an entry (revision 1), edited it
  (revision 2), got `Stale revision` for a delete with revision 1 and deleted with revision 2.
  The DM saw the row through RLS; the Player with the module off saw none. Nothing was committed
  and production `public` was not written (only read-only catalogue queries).
- Both hosted tables hold 0 rows, so there was no existing data to edit.

The defect was in the UI. Before this change:

1. Edit and delete existed only as items of an unlabeled `⋯` menu in the header of the page
   reader. The e2e mock hid this: the old test drove that menu and passed.
2. A house rule shown inside an SRD entry (how homebrew is mostly met) had no controls at all.
   Its title linked to the entry, which opened the read-only reference sheet.
3. The reference sheet, where every inline homebrew term opens, had no controls.
4. The `⋯` menu of an SRD entry offered only "Add a house rule", so an entry that already had one
   looked like it could not be changed.
5. A stale revision only said "reopen it", with no way out of the form, and the confirmation
   dialog was a plain modal titled "Delete entry".

No migration was added and no database was changed.

## Scope and ownership

Paths: `src/features/glossary/**` (api, ui, css), `src/shared/i18n/glossary-{es,en}.ts`,
`tests/e2e/glossary.spec.ts`, `tests/e2e/fixtures/identity.ts`, `docs/design-system.md`,
`docs/backlog/items.json` and this folder.

- New `EntryActions`: 44px pencil and red trash icon buttons with tooltips and named labels
  (`Editar «Descanso duro»`), folding into one `⋯` menu below 48em. An SRD entry shows one
  "Add a house rule" icon (hidden inside the reference sheet).
- Editor and delete modal moved from the page into the glossary layer (`useHomebrewManager`),
  so the page, a house rule inside an SRD entry and the reference sheet share them. They open
  above the sheet (z-index 410); Escape closes only the topmost; focus returns to the control
  that opened them (a menu item would already be unmounted).
- Editor: sticky footer (delete icon, Cancel, Save changes), full-height on phones, delete
  from the form replaces it with the confirmation, and a stale revision shows an alert with
  "Load the current one" or "Save mine" (re-fetches the live revision), or says the entry was
  deleted meanwhile.
- Delete modal: the entry name is in the title, one line of consequence, Cancel holds initial
  focus, red `light` confirm. It deletes the revision on screen at click time.
- Editing a house rule inside its SRD entry stays on that entry and focuses its headword.
- Non-goals: no change to permissions or SQL, no undo for delete.

## Acceptance

| Acceptance | Result |
| --- | --- |
| Edit in place, see the saved revision without reloading | e2e: house rule edited inside its SRD entry, aside updates, URL unchanged, headword focused |
| Delete after explicit confirmation; gone from index and search | e2e: modal names the entry, Escape keeps it, confirm sends `expected_revision: 1`; absent from search, Homebrew tab and the SRD entry |
| Stale revision shows a recoverable conflict | e2e: load current, save over it (revisions 1, 2, 3 sent) and entry-deleted-meanwhile |
| Players never see edit or delete controls | **Not met, by design of RYT-008.** ADR 025 and the migration record the user decision of 2026-11-03 that DM and Players share homebrew permissions (Players need the DM's module switch). The RPCs enforce exactly that, so hiding the controls would only misreport it. The existing Player e2e covers edit and delete. Producer decision needed if Players must lose write access (it is an SQL change). |

## Verification

| Check | Result |
| --- | --- |
| `npm run check` | exit 0: typecheck, lint, architecture, docs, AI contracts, 205 unit/SQL tests, build |
| `CI=1 npm run test:e2e` | exit 0, 324 passed, 48 skipped (projects not applicable to a spec) |
| `glossary.spec.ts`, identity desktop, tablet and mobile | all tests pass at every size |

New or changed e2e (all three identity sizes, Spanish unless noted):

- DM edits a house rule where it appears and recovers from a stale revision (axe and 44px
  audit with the editor and the conflict alert open).
- Deleting asks first, names the entry, Cancel is focused, Escape returns focus to the trigger,
  confirm removes it from index, search, Homebrew tab and the SRD entry.
- A homebrew definition opened in place edits and deletes above the reference sheet.
- Edit and delete overlays in English and light theme (real stored preference, axe clean).
- Deleting from the editor replaces the form with the confirmation.
- Existing Player create, edit, delete test updated to the new controls.

Initial failures while building (all fixed): strict-mode locator collisions (two buttons named
"Cancelar", two terms named "Descanso duro"); the `⋯` menu opened behind the z-index 400 sheet
(menu now 500); focus not returning to the `⋯` trigger on phones; the editor's SRD select clear
button was a sub-44px target once a value was set (the select no longer offers a clear button:
choosing the selected entry again removes it, and the hint says so); a global phone rule capped
drawers at 92dvh, so the sticky footer sat above the bottom; the footer buttons wrapped at 390px
(delete became an icon); the delete confirmation wrapped awkwardly (full-width rows on phones).
The first light-theme capture used an attribute hack that painted a white button on white; it was
replaced by the real stored preference.

Role matrix for the RPCs (PGlite `tests/database/glossary.test.ts`, unchanged and passing in
`npm run check`): anon, outsider, inactive member, Player with the module off and a DM of another
campaign are denied; DM and Player with the module on can write. RPCs were not changed, so no new
SQL tests were added.

## Handoff and review

Screenshots (390px `mobile`, 820px `tablet`), inspected:

- `docs/evidence/RYT-040/house-rule-actions-{mobile,tablet}.png`
- `docs/evidence/RYT-040/entry-homebrew-{mobile,tablet}.png`
- `docs/evidence/RYT-040/editor-edit-{mobile,tablet}.png`
- `docs/evidence/RYT-040/edit-conflict-{mobile,tablet}.png`
- `docs/evidence/RYT-040/delete-confirm-{mobile,tablet}.png`
- `docs/evidence/RYT-040/sheet-actions-{mobile,tablet}.png`
- `docs/evidence/RYT-040/editor-edit-light-en-{mobile,tablet}.png`
- `docs/evidence/RYT-040/delete-confirm-light-en-{mobile,tablet}.png`

Untested layers: real hosted PostgREST and a real Google session (the e2e uses a route mock of
the RPCs; the PRE probe called the SQL functions directly with a simulated JWT, not through
PostgREST); real iOS Safari; 150% text and reduced-motion passes for the new overlays were
reduced-motion only (no 150% text capture of the editor); the conflict flow with two real
accounts. Independent ui-ux verdict: pending.

## Round 2: independent ui-ux review (CHANGES_REQUIRED) fixes

The review is in `docs/evidence/RYT-040/ui-review.md` (committed as written). Every finding was
fixed; the focused re-review is pending.

| Finding | Fix | Regression |
| --- | --- | --- |
| F1 blocker: refetch moved focus to the H1 below 62em and dropped typed text | The page's headword-focus effect now fires only when the entry identity changes or a focus was requested (saved entry), never on a catalog refresh | `background refreshes keep focus and typed text in the open editor` (clock advanced 61 s, refetch observed; fails on the old effect, verified at 390px) |
| F2 major: conflict focus | The conflict alert (`tabIndex=-1`) takes focus when it appears; "Cargar la actual" moves focus to the Name field | focus asserted in the conflict test |
| F3 major: footer clipped at 150% on 390px | Footer wraps; Cancel and Save share rows and grow to full width on phones; delete stays on the left | `the editor footer reflows at 150% text on a phone` (Save inside the viewport, 44px high, no overflow) |
| F4 moderate: deleted-meanwhile dead end | After a stale save the form checks whether the entry still exists. If not, it says so, hides delete, and the primary action becomes "Guardar como nueva" (new id, revision null); Cancel closes | `the DM edits a house rule ... stale revision` (gone branch) and `a deleted entry being edited can be saved as a new one` |
| F5 moderate: bare scroll icon | An SRD entry shows a labelled subtle button, "+ Regla de la casa" / "+ House rule", with the full accessible name "Añadir una regla de la casa a «X»" (no longer the lore glyph, works on touch) | label asserted in the house-rule test |
| F6 minor: focus to body when the opener is gone | Falls back to the reference-sheet headword, the page headword, then `main` | gone branch asserts the headword is focused |
| F7 minor: silent discard | A dirty form asks "¿Descartar los cambios?" (Seguir editando holds focus, Escape closes only the question); an untouched form closes at once. The question opens a tick after the key event, otherwise the same Escape would close it immediately | `closing a dirty editor asks before discarding the edits` |
| F8 nit | Accessible names read `Acciones de «X»` / `Actions for “X”` | e2e helpers |

New captures: `edit-gone-{mobile,tablet}.png`, `editor-150-{mobile,tablet}.png` (150% text);
`house-rule-actions-*` now show the labelled add button. Other captures were regenerated.

Round 2 results: `npm run check` exit 0 (205 unit/SQL tests, build); `CI=1 npm run test:e2e` exit 0,
336 passed, 48 skipped. The e2e run was retried after other agents held ports 4173/4174 ("already
used" fails fast); the passing run used its own servers.

## Round 3: ui-ux round 2 findings (N1 to N3)

The report is the "Round 2" section of `docs/evidence/RYT-040/ui-review.md` (committed as written).

| Finding | Fix | Regression |
| --- | --- | --- |
| N1 major: focused fields hidden under the sticky footer | The drawer scroll container gets `scroll-padding-bottom` equal to the footer height plus 16px, kept in sync with a `ResizeObserver` (the footer grows with large text). The footer buttons are now flex items of the footer, so at large text the rows are [trash][Cancelar] and a full-width Guardar, never a row for the trash alone (150% ES footer is two rows) | `focused fields stay clear of the sticky editor footer at 100% / 150% text` (all sizes): Tab through more than 10 controls, each at least min(height, 44px) visible above the footer, footer height capped, then axe and the 44px audit with the last control focused. Fails with the padding removed (verified at 390px) |
| N2 minor: failed "Guardar como nueva" silent | The save error alert renders in every state, so offline, duplicate-name and invalid errors show under the deleted notice; edits are kept for a retry | `a failed "Guardar como nueva" shows why` (offline shows the message, back online it saves) |
| N3 minor: ragged discard buttons on phones | One shared `gl-dialog-actions` class for the delete confirmation and the discard question: two full-width rows below 48em | the dirty-editor test asserts equal x and width of both buttons at 390px |

New or refreshed captures: `editor-focus-{100,150}-{mobile,tablet}.png`, `discard-confirm-mobile.png`, `editor-150-*`.
