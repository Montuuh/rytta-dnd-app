# ui-ux review: RYT-053 creature art and the DM's own creature image

- Ticket: RYT-053 "Art for every SRD creature and the DM's own creature image" (ADR 030)
- Reviewer: `ui-ux` (role `.codex/agents/ui-ux.toml`, applied by an independent agent)
- Date: 2026-11-05
- Current verdict: **PASS** for fingerprint
  `64f648f89493e4f7ed9e2384e54065704793356cfe51ee6dd6c06cb201f3ea13` (round 2, see
  "Re-review (round 2)" at the end)
- Round 1 reviewed source fingerprint: `46f3366c3bed356a0c8ff4b8cd4a46f382d3ce177b3ccdde0767c442a36d70d2`
  (checked with `node scripts/check-ui-review.mjs --fingerprint` before and after the review)
- Base: `main` at 268940d plus the uncommitted RYT-053 working tree

## Round 1 verdict: CHANGES_REQUIRED

The viewer, credit label, menu, fallback and light/dark/English rendering are good. But one
blocking layout defect is visible every time an image is saved, restored or removed (or fails),
at every viewport. There are also two P2 issues in the remove confirmation.

## Findings

### P1-1 (blocking): the saving/saved/error line breaks the stat block heading

- Paths: `src/features/combat/ui/creature-art.tsx:256-269` (status and alert rendered inside
  `.combat-creature-image`); `src/features/combat/ui/combat.css:1614` (`.combat-creature-image
  { display: contents }`), `combat.css:1649-1654` (`.combat-image-error`) and `combat.css:1664-1671`
  (`.combat-image-status { order: 10; flex: 1 1 100% }`); `src/features/bestiary/ui/bestiary.css:9-17`
  (`.sb-head` is `display: flex` with no `flex-wrap`).
- Viewports/themes/languages: 390px, 820px and 1440px, light and dark, Spanish and English.
- Reproduction: open the Wolf (SRD) stat block, tap the token, choose Change image… and pick a
  file. Or, on a campaign creature with an image, choose Remove image… and confirm while the RPC fails.
- What happens: because the wrapper is `display: contents`, the status/alert becomes a flex item of
  `.sb-head`. Its `flex-basis: 100%` cannot wrap, so it squeezes `.sb-title` to about one character.
  The creature name stacks one letter per line ("W / o / l / f", "G / o / b / l / i / n"). The status
  text overlaps the name, the type line wraps word by word and the SRD/Campaign badge collapses into
  an empty circle. This happens in the saving, saved, restored and removed states and in the failure
  alert. It lasts as long as the notice stays, which is until the next action or until the user
  leaves the creature.
- Impact: the ADR 030 "visible saving/saved status" fix makes the heading unreadable at the moment
  the DM confirms the action. It looks broken on every device. It also pushes the stat block down on
  phones.
- Evidence: `saving-light-en-mobile.png`, `saved-light-en-mobile.png`, `saved-light-en-tablet.png`,
  `saved-light-en-desktop.png`, `menu-restore-light-en-tablet.png`, `remove-failed-desktop.png`.
- Fix direction (implementation's choice): give the token, the status and the alert a real column
  (for example a grid/flex column wrapper instead of `display: contents`, or a status row under
  `.sb-head`), or let `.sb-head` wrap with the title keeping its basis. Then re-capture all three
  viewports in the saving, saved and failed states.
- Not caught by tests: the RYT-053 and RYT-043 specs assert the status text but take no screenshot
  of these states.

### P2-2: Escape in the remove confirmation also closes the bestiary sheet

- Paths: `src/features/combat/ui/creature-art.tsx:270-305` (the confirm `Modal` does not report
  itself through `onViewing`); `src/features/combat/ui/bestiary.tsx:182-183` (`overlayOpen` covers the
  viewer but not the confirm); Mantine 9.7.4 closes every open modal from a window keydown listener
  in the capture phase (`ModalBase/use-modal.mjs`).
- Viewports: 390px and 820px (below 62em, where the stat block is a full-screen sheet). Desktop
  behaves correctly: only the dialog closes and focus returns to the token.
- Reproduction: Campaign source, open Goblin, add an image, tap the token, choose Quitar la imagen…,
  then press Escape in "¿Quitar la imagen de Goblin?".
- Observed in the browser: the dialog and the `.bst-sheet` both close (sheet count 0), the token is
  unmounted, and focus cannot return to it.
- Impact: Escape means "cancel" here, but it throws the DM out of the creature and loses their place
  and focus. This breaks the "dialogs over the phone sheet own Escape" rule that the viewer already
  follows.
- Fix direction: report the confirm as an overlay too (for example `onViewing`/an `onOverlay`
  callback covering `viewing || confirming`), and add a mobile/tablet assertion that the sheet
  survives Escape on the confirm.

### P2-3: the confirm's destructive button is filled red and fails axe colour contrast

- Path: `src/features/combat/ui/creature-art.tsx:292-296` (`<Button color="red">`, with Mantine's
  filled default variant).
- Viewports/theme: all viewports, dark theme, Spanish. Axe (wcag2a/aa, wcag21aa) scoped to the
  dialog reports `color-contrast` on the "Quitar la imagen" label. Light theme was not run through
  axe for this dialog.
- Design system: docs/design-system.md (RYT-035) says destructive actions use `color="red"` with the
  subtle, light or outline variant mapped to `--danger`. The bestiary's own delete dialog does this
  (`bestiary.tsx:565-567`, `variant="light"`). The filled salmon slab also looks louder than any
  other action in the sheet (`confirm-remove-mobile.png`).
- Fix direction: `variant="light"` (or outline) like the delete dialog, and an axe check on the
  confirm in the e2e spec.

### P3-4: the remove confirmation promises a "monogram"

- Paths: `src/shared/i18n/bestiary-es.ts:389-390`, `src/shared/i18n/bestiary-en.ts:386-387`
  (`bestiary.art.removeBody`).
- In the bestiary, a campaign creature with a type shows its type glyph, not initials (RYT-052,
  `creature-art.tsx:155`). The copy is only exact for untyped creatures and for combat tokens. Use a
  neutral phrase such as "will show no image" or "will show its token without an image".

### P3-5: the viewer names the image twice for screen readers

- Path: `src/features/combat/ui/creature-art.tsx:375` (`<figure aria-label="Imagen de X">`) and
  `:386` (img `alt` with the same text). The figure already has a figcaption. Dropping the figure's
  `aria-label` avoids a duplicate announcement. The loading `Loader` at `:378` puts `aria-label` on
  an element with no role, so it is not announced; the plate's `aria-busy` partly covers this.

### P3-6 (consider): Restore discards the DM's uploaded image without asking

- Path: `creature-art.tsx:230-232`. This matches ADR 030 ("restoring SRD art does not" ask), and the
  restored notice is shown. The DM's own image cannot be recovered without uploading it again,
  though, while Remove on a campaign creature asks first. This is a product call; I am recording it
  and it does not block.

## What works (verified)

- Menu contents follow the ADR in the browser. SRD with bundled art only: View, Change. SRD with the
  DM's image: View, Change, divider, Restore the original art. Campaign creature with an image: View,
  Change, Quitar la imagen… (red). Without any image the token is still the labelled file picker
  (RYT-043 spec).
- Viewer: initial focus on Close (44px). Tab cycles licence link → source link → Change image… →
  Close, with focus trapped. Escape and Close return focus to the token, and the phone sheet stays
  open behind the viewer. Links are underlined, with an external icon, `target=_blank`,
  `rel=noopener noreferrer` and the visually hidden "(opens in a new tab)" / "(se abre en otra
  pestaña)". Credit rows have a uniform 44px rhythm. Photo corners sit on the print. On phones the
  viewer is full screen with Change image… sticky at the foot. Axe is clean on the viewer in light
  English at 390/820/1440 and in dark Spanish (existing spec).
- Fallback: with the DM's private image returning 404, the token shows the bundled thumbnail and the
  viewer shows the bundled art with its full credit instead of a broken image
  (`viewer-fallback-light-en-*.png`). The existing spec covers missing bundled art (ogre: type glyph,
  "No se puede mostrar esta imagen ahora.").
- The failure copy is distinct: "No se pudo quitar la imagen. Inténtalo de nuevo." for a failed
  removal, and the save/unreadable messages for uploads.
- 150% text, dark Spanish: the viewer on a 390px phone scrolls (886/842px) with the sticky action
  visible at the foot. A two-line author wraps cleanly and there is no horizontal overflow
  (scrollWidth ≤ innerWidth at 390, 820 and 1440).
- Light theme: the mat, corners (chestnut) and label have good contrast. Dark list thumbnails are
  toned down, and the dark `.bst-row` / detail filter applies only under the dark scheme.
- The quiet seal (surface disc with an accent ring) is clearly secondary to the filled "add image"
  seal and reads as "menu" rather than "missing".

## Scenarios tested

Browser (Playwright, Chromium, in-memory Supabase fixture, reduced motion):

1. Requested run: `npx playwright test tests/e2e/bestiary.spec.ts tests/e2e/combat.spec.ts -g
   "RYT-053|RYT-043 the DM adds" --project=identity-mobile --project=identity-tablet
   --project=identity-desktop --output=test-results/ui-ux-053`. Result: 6 passed (RYT-053 and
   RYT-043 × 390/820/1440).
2. Temporary spec `tests/e2e/ui-ux-053.tmp.spec.ts` (now deleted). The file name is not in the
   identity projects' `testMatch`, so it ran under `--project=desktop` with `test.use` overriding
   `baseURL` to the identity build (port 4174), the viewport (390×844, 820×1180, 1440×1000) and
   `hasTouch`:
   - light theme, English: list, token, menu, viewer (axe, focus, Tab order, Escape), delayed upload
     (saving state), saved state, menu with Restore, own image 404 → fallback viewer;
   - dark, Spanish, campaign creature: upload, menu with Remove, confirm dialog (initial focus, axe),
     Escape on the confirm (sheet survival), failed removal (500) → alert copy and layout;
   - dark, Spanish, 150% root font: list, adult red dragon (Wesnoth portrait) viewer, viewer
     metrics and overflow, scrolled end of the viewer.

Screenshot inspection: the implementer's `docs/evidence/RYT-053/{token,menu,viewer}-{mobile,tablet}.png`
(dark, Spanish) and all captures listed below.

Code inspection: `creature-art.tsx`, `bestiary.tsx` (diff), `token.tsx`, `creatures.ts`, the RYT-053
CSS blocks in `bestiary.css` and `combat.css`, the `bestiary.art.*` strings in both languages, and
Mantine 9.7.4 modal Escape handling.

## Evidence

`docs/evidence/ui-review/ryt-053/`:

- `token-light-en-{mobile,tablet,desktop}.png`, `menu-light-en-*.png`, `viewer-light-en-*.png`
- `saving-light-en-*.png`, `saved-light-en-*.png`, `menu-restore-light-en-*.png` (P1-1)
- `viewer-fallback-light-en-*.png`
- `menu-remove-*.png`, `confirm-remove-*.png` (P2-3), `after-confirm-escape-desktop.png`,
  `remove-failed-desktop.png` (P1-1)
- `list-light-en-*.png`, `list-150-*.png`, `viewer-150-*.png`, `viewer-150-end-*.png`

The phone and tablet `after-confirm-escape` and `remove-failed` captures do not exist: after Escape
closed the sheet (P2-2) the token was gone and those steps timed out. Recorded here, not hidden.

## Limitations

- Chromium emulation only; iOS Safari, a real touch device, VoiceOver and TalkBack were not tested.
  The Desktop Chrome profile shows a scrollbar gutter (about 15px on the right in the captures) that
  phones do not have.
- No hosted Supabase, so signed URLs, storage policies and RLS denial were not reviewed here (they
  are database scope). The fixture's private images are SVG placeholders.
- The light-theme list capture was taken before the lazy thumbnails loaded (pale hexagons); dark
  thumbnails were verified in the implementer's captures and the existing spec.
- Not run: axe on the confirm dialog in light theme, Windows high-contrast mode, the camera/file
  picker UI on real phones, motion-on rendering of the 220ms "develop" animation, and DM combat
  tokens with bundled art (covered only by the passing RYT-043/combat code path and code reading).
- I did not review the art selection itself (licences and content suitability); the content test
  and ADR cover it.

## Re-review request

After fixing P1-1, P2-2 and P2-3, ask for a focused re-review. It should cover the saving, saved,
restored and failed states at 390/820/1440 in both themes, Escape on the confirm over the sheet, and
axe on the confirm dialog.

---

## Re-review (round 2)

- Date: 2026-11-05
- Reviewed source fingerprint: `64f648f89493e4f7ed9e2384e54065704793356cfe51ee6dd6c06cb201f3ea13`
  (checked with `node scripts/check-ui-review.mjs --fingerprint` before and after this round)
- Scope: the fixes for P1-1, P2-2, P2-3, P3-4 and P3-5, plus the states and paths they touch.

### Verdict: PASS

No blocking or P2 findings remain. The round 1 findings are resolved as follows.

| Finding | Status | Verification |
| --- | --- | --- |
| P1-1 status/alert breaks the heading | Fixed | Browser: `.sb-head` now wraps (`bestiary.css:9-19`, `.sb-title { flex: 1 1 9rem }`). In all 6 combinations (dark Spanish and light English at 390/820/1440), in the saving, saved, restored, save-failed, removed and remove-failed states, the title stays at full width (259/689/492px), the badge keeps the title's width, the notice starts below the token (statusTop > tokenBottom in every case) and nothing overflows horizontally. At 150% text on a 390px phone (adult red dragon) the name, type and badges keep their column and the notice wraps onto its own line under the heading. |
| P2-2 Escape on the confirm closes the sheet | Fixed | Browser, 390/820, both themes: Escape closes only "¿Quitar la imagen de Goblin?" / "Remove the image of Goblin?". `.bst-sheet` stays (count 1) and focus returns to the token. A second Escape then closes the sheet, so Escape is handed back. Desktop: the dialog closes and focus returns to the token. Code: `creature-art.tsx:77-84` reports `viewing \|\| confirming`, and the cleanup hands Escape back on unmount. |
| P2-3 filled red confirm button, axe contrast | Fixed | `creature-art.tsx:292-295` uses `color="red" variant="light"`. Axe (wcag2a/aa, wcag21aa) on the open confirm, after the menu has gone, reports no violations in dark Spanish or light English at any of the three widths. It now matches the delete dialog visually (`r2/confirm-*.png`). |
| P3-4 "monogram" copy | Fixed | The confirm body reads "La criatura se quedará sin imagen. Puedes elegir otra cuando quieras." / "The creature will have no image. You can choose another at any time." (seen in the browser). |
| P3-5 duplicate image name, unannounced loader | Fixed | Code: the figure has no `aria-label` (`creature-art.tsx:376`). The loader sits in `role="status"` with visually hidden "Cargando la imagen" (`:379-382`). The loading state itself was not captured, because the fixture signs URLs instantly. |
| P3-6 Restore without a question | Accepted | A product call per ADR 030. The restored notice is visible under the token. |

Other observations from this round:

- After a successful removal, the token becomes the file picker again and focus lands on it ("Añadir
  una imagen de Goblin" / "Add an image of Goblin"). The removed notice shows under it.
- The failure copy stays distinct by operation: "No se pudo guardar la imagen. Vuelve a intentarlo."
  vs "No se pudo quitar la imagen. Inténtalo de nuevo." (and the English equivalents), in
  `--danger` under the token.
- `.sb-head` wrapping does not affect stat blocks without media (the combat console uses
  `hideName`; the editor preview has no token). The regression run below includes those specs.

### Scenarios tested (round 2)

Browser (Playwright, Chromium, in-memory Supabase fixture, reduced motion):

1. Regression: `npx playwright test tests/e2e/bestiary.spec.ts tests/e2e/combat.spec.ts -g
   "RYT-05|RYT-04|bestiary|stat block" --project=identity-mobile --project=identity-tablet
   --project=identity-desktop`. Result: 78 passed, which includes the updated RYT-053 and RYT-043
   specs.
2. Temporary spec `tests/e2e/ui-ux-053.tmp.spec.ts` (deleted after the run; run under
   `--project=desktop` with `test.use` pointing at the identity build on port 4174 and overriding
   viewport/touch). Dark + Spanish and light + English, each at 390×844, 820×1180 and 1440×1000:
   - SRD Wolf: delayed upload (saving), saved, restore, failed upload (500): heading geometry and
     captures;
   - campaign Goblin: upload (saved), Remove… → confirm (axe, body copy), Escape on the confirm
     (sheet survival, focus), second Escape (sheet closes on phone/tablet), failed removal (500),
     successful removal (focus on the picker);
   - 150% root font, 390px, dark Spanish: adult red dragon saved state.

Screenshot inspection: the implementer's new `docs/evidence/RYT-053/saved-{mobile,tablet}.png`, and
the captures below.

### Evidence (round 2)

`docs/evidence/ui-review/ryt-053/r2/`:
`{saving,saved,restored,save-failed}-{dark,light}-{mobile,tablet,desktop}.png`,
`{campaign-saved,confirm,remove-failed,removed}-{dark,light}-{mobile,tablet,desktop}.png`,
`saved-150-dark-mobile.png`.

### Limitations (round 2)

- The round 1 limitations still apply: Chromium emulation only, no iOS Safari, real devices or
  screen readers, and no hosted Supabase.
- The viewer's private-image loading state was not observed rendering, because the fixture's signed
  URLs resolve immediately. The `role="status"` loader was verified in code only.
- I did not re-run the full `npm run check` or the whole e2e suite. The coordinator reports that
  `npm run check` passes (256 tests); only the focused browser runs above were executed by me.

This approval applies only to fingerprint
`64f648f89493e4f7ed9e2384e54065704793356cfe51ee6dd6c06cb201f3ea13`.
