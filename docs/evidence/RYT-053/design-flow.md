# RYT-053 design flow (docs/ui-design-flow.md)

## 1. Brief (`ui-ux-pro-max`)

DM-only Operate surface used at the table: tap a creature's image to view or change it. Searches
used: image lightbox and modal focus, lazy images with reserved space, alt text, anchored menus.
Direction:

- The token itself is the trigger. A short menu anchored to it holds view, change, and restore or
  remove. There are no extra buttons beside the token.
- The viewer is a modal (full screen on phones).
- Attribution is a quiet caption, not licence badges or "SRD art" pills.
- There is one action in the viewer.

## 2. Refinement (`frontend-design`)

The field-journal world gives a specimen plate. The print sits on the raised mat, held by accent
photo corners, with a museum label beneath it: italic terms, author, licence and source. The print
develops from sepia in 220ms, and only when motion is allowed. Avoided:

- template chrome (eyebrows, dot-joined meta strings)
- a thick accent border-left on the label (replaced by a hairline rule)
- licence badges

## 4. Impeccable critique and audit

Two isolated assessments ran in parallel:

- **A, design review:** 22/36 on the heuristics. The design is specific to the product in the viewer
  and in the ink plates. The list's mix of styles weakens it.
- **B, detector and technical audit:** the detector is clean. Scores were accessibility 3,
  performance 3, theming 3, responsive 3 and anti-patterns 4. There were no P0 or P1 findings.

Live overlay injection was not possible, because the app runs only against the Playwright
fixture. Both assessments therefore read the code and the screenshots.

Fixed:

- **Art that misrepresented creatures.**
  - The non-red dragons used Wesnoth drakes of the wrong colour. They are now dragon ink plates in
    their own colour.
  - Prehistoric animals were fossil skeletons. They now use life restorations.
  - Authors were empty or written as prose. They are now curated.
  - The list thumbnails are toned down slightly in the dark theme.
- **Photo corners.** They held the mat rather than the print. They now sit on the print's own
  corners.
- **Phone viewer.** The action floated mid-screen. It is now sticky at the foot, full width.
- **Viewer fallback.** When the private image failed, the token showed the bundled art but the
  viewer did not. The viewer now does the same, with the credit.
- **Removing a campaign image.** It now asks first, and a failed remove has its own message.
  Saving, saved and removed notices are shown, not only announced.
- **Credit rows.** Uneven heights are now uniform 44px rows. The links are underlined, with an
  external-link icon and "opens in a new tab" for screen readers.
- **Smaller fixes.**
  - The figure is named after the creature.
  - The adaptation note was ambiguous. It now says it is resized and that the thumbnail is a square
    crop.
  - The seal was loud; with an image it is now quieter.
  - The title font comes from the heading token.
  - Escape is handed back through a ref.
  - The English spelling is "License".
  - Uploaded images reserve their 512px size.
- **Tests.** They now cover opening the menu by keyboard, Escape on the menu over the phone sheet,
  remove with its confirmation, and the broken-art fallback.

Kept on purpose:

- **Two taps to view.** The user asked for a choice between viewing and changing when tapping the
  image.
- **Mixed art styles.** These are the free sources the user chose (ADR 030). A single-style set can
  replace the files later.
- **No `srcset` for the 720px art.** It is about 55 KB per image on average.
