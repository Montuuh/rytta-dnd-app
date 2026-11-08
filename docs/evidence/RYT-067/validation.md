# RYT-067 verification: single-style bestiary art, fit review, catalogue and import

Delivery of 2026-11-06 on `main` (base d303101). Decision: [ADR 030, RYT-067 amendment](../../decisions/030-bestiary-art.md).
Tools: [scripts/bestiary/README.md](../../../scripts/bestiary/README.md).

## What changed

- **Fit review** (`scripts/bestiary/art-review.json`): the 330 bundled pictures were judged by eye on
  labelled contact sheets and scored 1–10 with a one-line review and the subject of the replacement.
  Scores: 1 → 45, 2 → 64, 3 → 95, 4 → 19, 5 → 27, 6 → 18, 7 → 16, 8 → 26, 9 → 20, 10 → 0. Average by
  kind: icons 1.5 (83), photos 2.7 (89), old artwork 4.1 (74), Battle for Wesnoth portraits 7.3 (84).
- **Catalogue** (`scripts/bestiary/art_catalogue.py` → `art/bestiary/bestiary-art-catalogue.xlsx` and
  `art/bestiary/catalogue.csv`): one row per creature, worst fit first, with the current thumbnail, the
  review, the shared-style prompt (no artist or product names; dragons built from colour and age), the
  file name `<id>.png` and the path `art/bestiary/source/<id>.png`. The status the author sets in the
  Excel file survives regeneration. Summary formulas were recalculated in Excel: 330 rows, 330
  thumbnails, counts equal to the script's.
- **Tracker layout** (follow-up the same day): the Excel file opens on a Tracker sheet ordered for the
  work (current picture at 96px, creature, file name, Status and Notes to edit, prompt, then the
  review), each row tinted by its status, and a Progress sheet (counts and share per status, by fit and
  by current picture). Recalculated in Excel with test statuses (one generated, one keep, one rejected):
  counts 327/1/0/1/1, the rejected row tinted; status and notes survived a regeneration; the test values
  were then cleared.
- **Import** (`scripts/bestiary/import_art.py`, `--check` to report only): refuses unknown names,
  pictures under 512px and pictures far from square; writes the 720px WebP and the 128px thumbnail,
  the `generated` credit, the selection with the `replaced` source and `art-generated.json` (checksum,
  size, C2PA agent, model and date); skips unchanged sources; rewrites the credits page (with a
  paragraph on ChatGPT image generation) and the catalogue. `build_images.py` rebuilds generated art
  from its source and keeps the imported renditions when the source is absent (sources are ignored by
  git, about 2 MB each).
- **App:** `artOrigins` gains `generated`; the viewer shows Author Rytta, License © Rytta, Source
  "Rytta’s art credits" / "Créditos de arte de Rytta" (the credits page) and the note "Painted for
  Rytta with ChatGPT image generation (OpenAI) and resized by Rytta." in English and Spanish.

## Checks

- Import on an isolated copy of the art files (scratch directory, never the repository): `--check`
  listed 2 to import and refused `ape.png` (300 × 300), `bat.png` (1024 × 600) and `beholder.png`
  (not an SRD id) with exit 1; the import wrote 720 × 720 and 128 × 128 WebPs, the credits, the
  selection with `replaced`, the provenance log (C2PA `ChatGPT` / `gpt-image` / `2026-11-05T21:57:17Z`
  read from a real ChatGPT PNG manifest; none for the picture without one, with a note), statuses
  `imported`, kept `keep` and `rejected` rows; a second run skipped both as unchanged; a changed source
  was imported again; a removed source was reported. The credits page diff only adds the ChatGPT
  paragraph and the two rows; prettier passes.
- `npm run check`: typecheck, lint, architecture, docs, AI contracts, 43 test files / 306 tests
  (including the generated credit schema case), build. Passed.
- Viewer with a fixture owlbear imported temporarily (a synthetic drawing, reverted after the review),
  identity Playwright projects at 390 × 844 and 820 × 1180, Spanish and English: credit texts, source
  link, no horizontal overflow, axe wcag2a/2aa/21aa without violations, 44px targets, Escape closes;
  4 passed. Captures: [es 390](viewer-es-mobile.png), [en 390](viewer-en-mobile.png),
  [es tablet](viewer-es-tablet.png), [en tablet](viewer-en-tablet.png).

## Not covered

- No real painted picture is imported yet: the author generates them by hand; the shipped art is
  unchanged.
- `build_images.py` with a `generated` choice was not run end to end (it needs the Commons cache and the
  Wesnoth and game-icons checkouts); the branch reuses the same rendition code as the import.
- The import is a manual script without automated Python tests, like the other content scripts.

## UI review

Independent `ui-ux` review: **PASS** on source fingerprint
`87efeec31901efe8af604f550833a5c70918b21e15e8977cfb1830c38e395f02`
([report](../ui-review/ryt-067/review.md)), browser-tested in Chromium in Spanish and English, dark and
light, at 390, 820 and 1440px and 150% text, with the other three origins as regression checks. Three
optional P3 notes stay open: the label says "Rytta" several times (shorter note wording suggested), a
long source link wraps its icon at 390px and 150% text (as Wikimedia Commons already did), and no
permanent test shows a `generated` credit until the first real picture is imported. The fixture was
reverted after the review; the fingerprint is unchanged (art and `public/` are outside it).

Prettier then split one over-long line of the note call in `creature-art.tsx` (format only). Focused
re-review: **PASS** on fingerprint `7fc1d3f9b03a734f9d7d0a5e3a7e92eaacac41eb51bfc55bc8b9082a396550c4`,
by diff inspection (restoring the line gives the earlier fingerprint) and a browser check of the other
origins on the reverted tree; the `generated` credit itself was browser-tested on the earlier snapshot.
