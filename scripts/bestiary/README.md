# Bestiary content pipeline (ADR 028)

The bestiary bundles the "Monsters A–Z" and "Animals" chapters of the System Reference Document
5.2.1, English and official Spanish editions, licensed CC-BY-4.0 by Wizards of the Coast LLC. See
`docs/decisions/028-bestiary.md` for attribution and adaptation notes.

The scripts run manually (not in CI) and need `pdfplumber` (they reuse `scripts/glossary/srd_pdf.py`):

1. Download the official PDFs from https://www.dndbeyond.com/srd into a folder outside the repo:
   `SRD_CC_v5.2.1.pdf` and `SP_SRD_CC_v5.2.1.pdf`.
2. `python3 -I scripts/bestiary/build_bestiary.py <pdf-dir> src/features/bestiary/content`
   (`BESTIARY_REUSE_RAW=1` reuses the `raw_{en,es}.json` it caches next to the PDFs).
3. Review the diff and run `npx vitest run src/features/bestiary` (content contract tests and a text
   round trip of every stat block through the paste parser).

- `srd_monsters.py`: stat block parser (name, meta line, AC and initiative, HP, speed, ability table,
  detail lines, sections and entries with inline markup). Handles wrapped leads, bold
  cross-references, numbered table rows and indented wrapped lines.
- `build_bestiary.py`: pairs English and Spanish blocks by their numbers, pairs entries by a
  language-neutral signature (dice, DCs, numbers and glossary terms), parses usages (recharge, per day,
  lair) and per-day spell lists (glossary spell ids), and writes `index.json` (catalogue and per-CR
  medians) and `{en,es}.json` (stat blocks and the reusable trait library). Known printing errata are
  listed in `XP_ERRATA` and in `srd_monsters.parse_abilities`.

## Creature art (ADR 030)

Every SRD creature has bundled art: `public/bestiary/art/<id>.webp` (720px), `public/bestiary/thumbs/<id>.webp`
(128px square) and its credit in `src/features/bestiary/content/art.json` (also listed in
`docs/bestiary-art-credits.md`). The curated choice is `art-selection.json` (one source per creature: a
Wikimedia Commons file, a Battle for Wesnoth portrait or a game-icons.net icon, optionally tinted and with
a thumbnail crop focus); `art-commons.json` keeps the Commons metadata of the chosen files.

1. `image_candidates.py <index.json> <out.json> [--leads-only]` collects free Wikipedia lead images and
   Commons search results; `contact_sheet.py` turns candidates into sheets to choose by eye.
2. Clone `github.com/wesnoth/wesnoth` (sparse: `data/core/images/portraits`) and `github.com/game-icons/icons`
   outside the repo; `node scripts/bestiary/render_icons.mjs <game-icons> scripts/bestiary/art-selection.json <icons-dir>`
   renders the icon plates.
3. `python3 -I scripts/bestiary/build_images.py scripts/bestiary/art-selection.json . --candidates
scripts/bestiary/art-commons.json --wesnoth <wesnoth-dir> <commit> --icons <icons-dir> <commit>`
   writes the images, `art.json` and the credits page, then `npx vitest run src/features/bestiary` checks
   coverage and licences. Wikimedia rate-limits anonymous clients; the scripts pace their calls.

### Single-style replacements painted in ChatGPT

`art-review.json` scores how well each bundled picture fits its creature (1 = unrepresentative and far
from a fantasy RPG look, 10 = a perfect illustration; reviewed by eye on 2026-11-06) and holds the
subject of the picture that replaces it. `python3 -I scripts/bestiary/art_catalogue.py` writes
`art/bestiary/bestiary-art-catalogue.xlsx` (a tracker: the current picture, the creature, the file name,
an editable Status and Notes, the prompt, and a Progress sheet that counts the statuses) and
`art/bestiary/catalogue.csv`: one row per creature from the worst fit to the best, with the prompt to
paste in ChatGPT and the path to save the picture at, `art/bestiary/source/<creature id>.png`. The
author paints them by hand under the rules of `docs/sprite-art.md` (no artist names, no third-party
references), except that each prompt names the official Dungeons & Dragons creature and asks for its
official design (RYT-087, ADR 030). Edit the review file or the script, not the outputs; running it again keeps
each row's status (read from the Excel file) and marks saved pictures `generated`.

`python3 -I scripts/bestiary/import_art.py` (`--check` only reports) imports every saved picture: it
refuses names that are not creature ids, pictures under 512px and pictures far from square, writes the
720px image and the 128px thumbnail, credits the picture to Rytta (`origin: generated`), records the
replaced source under `replaced` in `art-selection.json`, logs the source's checksum and C2PA provenance
in `art-generated.json` and rewrites the credits page and the catalogue. Unchanged sources are skipped.
The PNG sources stay out of git (about 2 MB each); without them `build_images.py` keeps the imported
renditions. To bring back the replaced art, restore its selection entry from `replaced` and rebuild, or
restore its two WebP files and `art.json` entry from git.
