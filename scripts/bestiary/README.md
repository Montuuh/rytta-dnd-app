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
