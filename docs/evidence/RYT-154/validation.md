# RYT-154 — Art prompts for every image picker

Date: 2026-11-22. Delivered with RYT-148 (block D). Owner choices on 2026-11-22: a "Copy art
prompt" text button beside each picker (P3 A), the prompt entirely in English with names as
written (P4 B, replacing the ticket's "interface language plus an English block"), and only the
data on screen (P5 A).

## What changed

- `src/shared/lib/art-prompt.ts`: one art direction (from docs/interface-art.md) and a template per
  kind (character, creature, item, shop, card, map) with the framing, aspect ratio, size and
  background each picker keeps. `copyArtPrompt` writes it to the clipboard; nothing calls an image
  service.
- `src/shared/ui/copy-art-prompt.tsx`: the button, a polite confirmation, and the prompt selected
  in a read-only box when the clipboard is refused.
- Pickers: item forge, shop image, story card, map upload, quick build (name step) and the
  creation wizard's last step for the character portrait, creature art (under the token without
  any image; in the pencil menu with the DM's own image). With only the bundled SRD art the pencil
  keeps opening the file chooser directly, so that view offers no prompt: a text button there made
  the stat block's sticky column overflow on 1024×768.

## Acceptance

| Criterion | Evidence | Result |
| --- | --- | --- |
| Art direction and one template per kind in one documented module with unit tests | `src/shared/lib/art-prompt.test.ts` (4 tests) | Met |
| Each picker shows Copy art prompt; the text matches the entity on screen and the kind | `expectArtPrompt` in `shops`, `inventory`, `tabletop` (story card and map), `combat` (token picker) and `bestiary` (pencil menu) specs read the clipboard | Met (portrait pickers checked in code, no browser test) |
| The prompt states size, aspect ratio and background | Unit tests per kind | Met |
| No network call to an image service | The module only writes to the clipboard | Met |
| 390 and 820 px, both themes and languages, keyboard, axe; independent UI review | Picker specs run at 390 and 820 px with their existing axe and touch-target audits; UI review below | Met |

## UI review

Independent UI review: CHANGES_REQUIRED first (the art prompt sat between the creature token and
its name; an empty live region was display:none; a refused copy from the pencil menu offered no
manual copy; the footer's name; the weight of Switch account and the contact link; the button's
inset), all fixed; PASS on 2026-11-22 for the current source (report kept locally under
`docs/evidence/ui-review/ryt-148-154/`). Non-blocking notes: the refused-copy line repeats the
manual box's label, and the stat block at 1024×768 with that box open was not re-checked.

## Checks

- `npm run check`: passed.
- `npm run test:e2e`: 1465 passed, 150 skipped, 0 failed before the review fixes; after them the
  bestiary, combat, account-help, shops, legal and account specs at 390, 820 and desktop: 247
  passed.
