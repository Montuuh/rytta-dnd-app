# RYT-093 validation: content manager

Date: 2026-11-13. Feature `src/features/content-library` (domain, data adapter, queries, manager
page, entry editor, dialogs), route `#/library` (account level), the editor-only item in the account
menu and the wider `.library-layout`. The bestiary creature editor gained two optional props
(`onSubmit`, `title`) so the library stores each language's stat block itself; with `onSubmit` it
hides the campaign side and the private notes. The manager page is a lazy export of the feature, so
the account menu checks the editor role without loading the manager.

## Checks

- `npm run check`: typecheck, lint, architecture, docs contracts, 375 unit and database tests, build.
- `src/features/content-library/domain/library.test.ts`: entry checks match the server's; Rytta
  content files (errors, duplicates, groups by kind, export round trip); batches of at most 200
  entries and about 1.5 MB; the bundled SRD 5.2.1 becomes 1161 valid entries (330 creatures,
  48 creature traits, 1 baseline table, 782 glossary entries) that keep the bundled shapes; every
  English and Spanish glossary body (1564) survives the text form unchanged.
- `tests/e2e/library.spec.ts`: 15 passed on identity-mobile (390), identity-tablet (820) and
  identity-desktop (1440).
  - SRD: upload of 1161 entries in batches, focus on the pack heading afterwards, creatures in
    Spanish alphabetical order, publish of version 1, accent-insensitive search with the exact name
    first, the wolf's numbers and stat blocks, and a stat block editor without side or private notes.
  - Spell drafts: save keeps focus on the button, JSON error refuses the save, the unsaved-changes
    guard asks before leaving, discard, delete with focus on "Deshacer borrado" and a read-only form,
    and undo.
  - A new subclass with an automatic key, and a content file whose refused entry stays in the report
    after the server check; focus returns to "Importar".
  - A new pack, and the visibility change of a published pack through its own call; Escape returns
    focus to "Editar paquete".
  - Accounts that are not editors see neither the menu item nor the library; the forbidden state
    links back to the campaigns.
  - Each step audits axe (wcag2a/2aa/21aa), horizontal overflow and 44 px targets, inside open
    dialogs too.
  - After the second UI review round it also covers:
    - focus after publishing;
    - the phone list position and the focused row after returning from an entry;
    - the notice clearing on another screen;
    - focus returning to "Editar" when the stat block editor closes;
    - a failed stat block save shown inside the dialog, then a retry;
    - the current row asking nothing;
    - browser back and forward restoring unsaved edits, with "Descartarlos";
    - the import report audited in the light theme.
  - After the third round it also covers:
    - another editor's save refusing these edits, with "Cargar la versión nueva";
    - the confirmation before going back to the published entry;
    - the "sin guardar" mark on rows with kept edits;
    - focus on the pack row and the pack heading when phones change screens.
  - The spec passed twice in a row on every size (`--repeat-each=2`, 30 runs).
- Full `npm run test:e2e`: 510 passed, 1 failed, 43 skipped. The failure, `bestiary.spec.ts:697`,
  belongs to RYT-091, which is still in progress.
- Earlier runs had two more failures:
  - `bestiary.spec.ts:325` on mobile: a click was intercepted under load; it passed when run alone.
  - A library dialog's close button was measured during its opening transition. The spec now waits
    for the transition.

## Captures

390, 820 and 1440 px in the dark (Hearth) and light (Parchment) themes, plus English at every
width. A selection is kept here:

- `01-packs-mobile-default.png`, `03-srd-creatures-mobile-default.png`, `04-publish-mobile-default.png`
- `05-wolf-laptop-default.png`, `05-wolf-mobile-parchment.png`, `06-statblock-tablet-default.png`
- `07-spell-laptop-default.png`, `07-spell-tablet-parchment.png`, `08-json-laptop-parchment.png`
- `09-import-mobile-default.png`, `10-leave-tablet-parchment.png`, `12-en-spell-mobile.png`
- `13-restored-mobile-parchment.png`

## Design critique and audit

Operate mode.

First pass, fixed:
- Tablet controls under 44 px: tabs, number steppers, select clear buttons, the notice's close button,
  and the class pills, now checkboxes.
- The laptop layout widened to 1360 px.
- The import report no longer repeats an empty count line, and counts read "Nuevas: 1 · …".
- The publish dialog groups changes by state.
- The notice's close button reads "Cerrar", and school names start with a capital.

The banner's accent side stripe became a 1 px border.

## UI review

The first round asked for changes: 4 blockers, 7 major and 14 minor findings. Fixed:

- Dialogs open on Cancel, and the file field has no unnamed clear button.
- Unsaved entry edits are guarded on links, the kind select, New entry and page unload.
- Opening an entry focuses its heading without scrolling. Phones keep the list position and use a
  compact header.
- Lists are sorted by the localized name, and search is ranked and ignores accents.
- Creature numbers are read from the stat block.
- The import report keeps the refused entries.
- Focus returns after dialogs, saves, deletes and uploads.
- A deleted entry is read-only. Delete moved to the entry head, so the save bar fits in the narrow
  editor column.
- The copy and the help text are shorter and appear only once.

The second round asked for changes too. Fixed:

- The app keeps its hash router, so browser and system back cannot be stopped. Instead, unsaved
  entry edits are kept in memory until they are saved or discarded. They come back with "Cambios sin
  guardar recuperados." and a "Descartarlos" action, including after leaving through the account menu.
- Phones keep the list position and focus the entry just left.
- Focus returns to the stat block's "Editar" button and, after publishing, to the pack heading.
- A failed stat block save shows its error inside the dialog.
- The refused count keeps its contrast in the light theme, and notices belong to the screen that
  raised them.
- The import report shows the key without stray quotes and hides the ready line once checked.
- The current row asks nothing.

The third round asked for changes as well. Fixed:

- Edits remember the server revision they started from. A save over a newer one is refused, with
  "Esta entrada ha cambiado mientras editabas." and a way to load the new version.
- The form ignores late responses from before the last save, and it compares entries without
  regard to key order, because the database returns JSON keys in its own order.
- Specific errors (identifier or key taken, changed meanwhile) show their own message instead of a
  network error.
- "Volver a la publicada" asks first and sits beside "Borrar".
- Phones focus the screen that replaces the pressed link.
- Kept edits belong to the account that made them, and their rows say "sin guardar".

The fourth round passed (2026-11-13). No blocker or major finding is open. These minor findings
remain as recommendations:
- A conflict can only be resolved by loading the other version; there is no keep-mine option, and
  the save bar's stale message repeats the banner with other advice.
- The "sin guardar" row mark can lag after "Descartarlos" until the list repaints.
- A failed save in the pack dialog leaves focus on the page.
- After a failed stat block save, a mouse click can leave focus on the page.
- On tablet and laptop, browser back leaves focus on the page.
- "Volver a la publicada" is not red.

## Not verified

- Uploading the SRD to production from a real editor session (Google sign-in): the owner account
  holds the editor role in production and PRE; the upload and the first publish are done from the
  manager.
- PostgREST request size and statement timeouts with real batches (the fixture accepts them).
- iOS Safari and real devices.
