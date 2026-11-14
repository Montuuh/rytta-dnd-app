# RYT-099 verification

Date: 2026-11-14. Amends [ADR 041](../../decisions/041-party-portraits-claim-leave.md): uploaded
pictures are sharp enough for the portrait plates and the full-screen viewer.

## Cause

- Portraits were saved as 512px squares and the DM's creature images were centre-cropped to 512px,
  WebP at 0.85. The Party plates and the viewer now show them far larger (a 390px phone has about
  1100 device pixels across), so they were upscaled more than twice and looked soft.
- The reduction drew a large photo straight into the small square with the browser's default
  smoothing, which skips source pixels and looks jagged.
- Item pictures could drop to WebP quality 0.45 to fit 1 MB.
- Safari cannot encode WebP from a canvas and returns PNG: creature and item uploads refused it.

## Change

- `src/shared/lib/image-encode.ts`: high-quality smoothing with halving steps for large reductions,
  and one encoder that tries WebP at 0.9, 0.85, 0.8 and 0.75 within the 1 MB bucket limit, then
  shrinks the picture (75 %, 50 %) instead of lowering quality further. Browsers without a WebP
  encoder get JPEG, or PNG for item art that needs transparency.
- Portraits and creature images are saved as 1024px squares; item pictures keep a 1024px long side.
  The portrait editor's live preview stays at 512px so dragging stays smooth.
- Creature and item uploads accept JPEG and PNG as well; the buckets and storage path rules already
  allowed `webp|png|jpg`. No database change.
- Pictures uploaded before this change stay at their old size (the original file is not kept);
  uploading them again makes them sharp.

- Encoding the 1024px picture takes about half a second on a mid phone: the portrait editor's Save
  shows loading from the tap and a Cancel, Escape or close meanwhile drops the result (nothing is
  uploaded); the creature image reads "Saving…" from the tap. WebP support is detected once per
  page; opaque item art falls back to JPEG and see-through art to PNG.

## Checks

- `npm run check`: passed (58 files, 413 unit/SQL tests, build). New unit tests: halving steps,
  quality and size fallback order, accepted types, file extensions.
- e2e: a 2400x1600 photo becomes a 1024x1024 WebP under 1 MB at upload (390 and 820), and a
  cancel while the portrait is being prepared uploads nothing. Bestiary, combat, campaign-items,
  inventory and character-sheet specs after the review fixes: 195 passed, 16 skipped, 0 failed
  (an earlier bestiary failure under load passed alone and in three repeated runs).
- Independent UI review: CHANGES_REQUIRED (Save gave no feedback while encoding and a cancel
  meanwhile still uploaded), fixed, then PASS. Follow-ups noted by the review: the loading state
  appears once the first draw ends (about 0.5 s on a slow phone), and a cancel after the upload
  has started still lets it finish (older behaviour).
- Not covered: Safari's JPEG/PNG fallback on a real device (Chromium encodes WebP).
