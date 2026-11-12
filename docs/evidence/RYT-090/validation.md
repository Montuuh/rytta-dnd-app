# RYT-090 validation

Character sheet led by its portrait. User choices from the options artifact
(8uZMRdqdyT8RPk4Thq5yC7): P1 A, P2 c, P3 b, P4 b, P5 b, P6 a, P7 b, P8 b.

## Design flow

- Brief (`ui-ux-pro-max`): portrait as the hero, HP and AC/initiative on the first screen,
  avoid pills and generic buttons. The searches returned no product-specific match; the
  project tokens and widgets were used. Options artifact published before building.
- Widgets chosen over buttons/pills: a portrait plate that opens a viewer, an AC shield, a
  segmented HP control with colored icons, a pressed-state inspiration badge, an ability row.
- `impeccable` critique and audit ran in a single context (sub-agents not authorized for it);
  the detector found nothing on the changed files. Findings acted on from the captures: the
  subtitle wrapped with a leading separator (now two lines), "Add portrait" covered the
  monogram, the viewer actions stacked unevenly on phones, focus returned before the new
  picture loaded, and the hidden file input had no name once a portrait existed.

## Checks

- `npm run check`: pass (after moving `initials` to its own module for fast refresh).
- `npx playwright test tests/e2e/character-sheet.spec.ts -g RYT-090`: pass on identity-mobile
  and identity-tablet (axe, touch targets, viewer Escape returns focus, remove flow, focus to
  Add portrait, inspiration pressed state, ring and Add portrait placement at 150% text).
- First round: character-sheet, characters, inventory, rest, glossary and campaign-items e2e:
  199 passed, 13 skipped, 1 failed: the glossary "sticky editor footer at 100% text" test timed
  out while captures ran in parallel; rerun alone it passes.
- After the review fixes: character-sheet, inventory, characters and rest e2e: 94 passed,
  10 skipped; `npm run check` pass.

## Independent review

- Round 1 `ui-ux`: CHANGES_REQUIRED. F1 the HP ring was clipped at 150% text; F2 the plate
  clipped long names and Add portrait overlapped the name; F3 to F7 minor (plate focus ring,
  unlabelled save on phones, uneven HP segments, upload error over the name, edit row layout).
- Fixes: rem-sized ring with a wrapping vitals row; a spacer-based minimum height so the
  plate grows with its content (aspect-ratio was turning content height into a minimum
  width); the content layer passes taps through to the picture (caught by the e2e).
- Round 2 `ui-ux`: PASS on fingerprint dab20650…c3573. Remaining notes: R1 the upload error
  at the bottom of the plate can sit under the ring's corner with long text; R2 cosmetic.
- Captures: `docs/evidence/ui-review/ryt-090/` (390px and 820px, dark and light, ES and EN,
  before/after, no portrait, viewer, edit mode, inspiration on).

## Not tested

- Hosted Supabase: no schema change; removal reuses `set_character_portrait` with a null
  path, which the existing RPC already accepts. Not exercised against PRE.
- iOS Safari and real devices; the removed portrait's storage object is kept, as after a
  replacement.
