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
