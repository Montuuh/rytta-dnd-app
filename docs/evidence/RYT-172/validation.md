# RYT-172: library entries carry their own picture

Date: 2026-11-23 (block P). The owner chose the recommended options on the block P options page.
Decision record: [ADR 053](../../decisions/053-pack-entry-pictures.md).

## What changed

- **Storage and data (P1 A, P2 A, P4 A).** Migration `20261224120000_pack_images.sql`. The editor
  offers pictures for creatures, items and classes (P1 A); subclasses are drawn nowhere.
  - Private bucket `pack-images` (2 MB, WebP, PNG, JPEG) at `<env>/<pack id>/<uuid>.<ext>`.
  - Creature, item, class and subclass entries name their picture in `data.index.image`; the entry
    check refuses anything else. The picture is published with the pack version.
  - Upload: content editors, into an existing pack. Read: editors and the pack owner (drafts too);
    anyone else only pictures a published version names, of a public pack or of one offered to
    their campaign. No update or delete through the API.
  - `get_campaign_pack_images(campaign)`: the DM receives every picture of the campaign's enabled
    packs at their pinned versions; other members only classes and subclasses, items the
    storeroom holds and creatures of public packs, never hidden entries.
  - `shop_item_json` returns the item's `basic_key`, so shop tiles can show its pack picture.
- **Library (P3 A).** `src/features/content-library/ui/entry-image.tsx`, `entry-picture.ts`.
  - The editor shows the picture the app will show and where it comes from (pack, app painting,
    category painting, none) and what comes back if it is removed.
  - Upload or Change through the square crop editor (shared with portraits); Remove. Focus returns
    to the section's button.
  - The entry list shows a 40 px thumbnail (an icon when there is none).
- **App (P5 A).** The campaign's pack pictures come through a context of `CampaignBoundary`.
  - Items (inventory, storeroom, shops): the campaign's upload, then the pack picture, then the
    category painting.
  - Creatures (bestiary lists, stat block, combat portraits and tokens, tabletop): the campaign's
    image, then the pack picture, then the bundled art.
  - Classes (creation, sheet, party, roster, tokens): the pack picture, then the SRD emblem.

## Production data

- Applied to staging, then production with the PRE mirror (public first, then PRE).
- Stored statement matches the LF file: md5 `011b06fce0bb78934a2f98e2d2eb233c`, 10712 characters.
- Before the apply no entry, version or PRE version named a picture, and no `pack-images` bucket
  existed.
- After: the bucket and its two policies exist; `pre.get_campaign_pack_images` and the PRE index
  exist and read `pre_private`; `pre_private.shop_item_json` returns `basic_key`; anon cannot
  execute the reader.
- Smoke test (rolled back): a production Player read their campaign's pictures (none yet) and
  could not upload.
- Security advisors: the new reader is reported as a security definer RPC callable by
  `authenticated`, like every other RPC of the app; nothing else new.

## Acceptance

| Criterion | Evidence | Result |
| --- | --- | --- |
| Upload by editors only; reading as decided; anon never | `tests/database/pack-images.test.ts`: editors, owner and super admin may upload, DM, Player, other DM and outsider may not, anon refused; malformed, other-environment and missing-pack paths refused; a public pack's published picture is readable by any signed-in account but a draft or unnamed object is not; a private pack's picture is read by its owner and editors (drafts too) and, once offered, by the campaign's members only when published | Met |
| A campaign sees a picture only at its pinned version; members only | Same file: the DM sees it after accepting the version; a new draft and a new published version wait for the DM; a Player gets an item only when the storeroom holds it, never a hidden entry, and no creature of a private pack; outsider, other DM and anon refused | Met |
| Library editor: picture, origin, change through the square editor, remove, thumbnails; 390/820, themes, languages, axe | `tests/e2e/pack-images.spec.ts` (ES Hearth and EN Parchment at 390, ES at 820) | Met |
| Screens prefer the campaign upload, then the pack picture, then the app painting | Inventory tile e2e (signed pack picture for the pack item, category painting for the others); code review of the creature, shop and class paths; the full suite passes unchanged without pack pictures | Met for items in the browser; creatures, shops and classes by code and unchanged suites |

## Checks

- `npm run check`: typecheck, lint, contracts, 1244 unit and PGlite tests, build.
- `npm run test:e2e`, full suite before the design and security fixes: 1604 passed, 2 failed
  (`scaffold.spec.ts` update notice on desktop, `bestiary.spec.ts` RYT-145 on mobile); both
  passed when run alone.
- After the fixes: `pack-images.spec.ts`, `library.spec.ts` and `inventory.spec.ts` 42 of 42 at
  390 and 820 px.
- Security review: no blocking finding. Fixed before the apply: Players no longer receive the
  DM-only creature and item lists of private packs or hidden entries; a non-editor reads only
  pictures a published version names (listing included); canonical paths; rows that do not read
  are skipped alone; existence checks and separate policy guards.

## UI review

- Design critique: fixed the title falling under the picture at 390 px, the wrapping Remove
  button (shorter labels), copy that claimed the picture before saving, and empty list
  thumbnails.
- Independent UI review, first round: CHANGES_REQUIRED. Blocking: the crop editor showed a round
  portrait guide and round previews for a square picture. Minor: a portrait label on the canvas,
  English fallback copy, Remove wrapping alone at 390 px, a doubled upload error, and subclass
  pictures that no screen shows.
- Fixed: the square editor takes a square shape (guide and previews), its own canvas label,
  reworded English, stacked buttons, one error, and no picture section for subclasses (ADR 053).
- Second round: PASS.
- Minor notes left: on a slow network the category painting or app emblem can show for a moment
  before the pack picture; the zoom tooltip covers its label while focused (also before).

## Not tested

- A real upload and signed URL against hosted Storage (the browser tests mock Storage).
- Creature, shop and class pack pictures in the browser (no fixture carries them).
- The pack-images bucket in PRE through the app (paths start with `pre/`).
