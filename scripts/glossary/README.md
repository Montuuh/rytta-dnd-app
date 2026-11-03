# Glossary content pipeline (RYT-008)

The glossary bundles rules text from the System Reference Document 5.2.1 (and SRD 5.1 for the
2014 blocks), English and Spanish editions, licensed CC-BY-4.0 by Wizards of the Coast LLC.
See `docs/decisions/023-glossary.md` for attribution and adaptation notes.

The scripts run manually (not in CI) and need `pdfplumber` and `pdftotext`:

1. Download the official PDFs from https://www.dndbeyond.com/srd into a folder outside the repo:
   `SRD_CC_v5.2.1.pdf`, `SP_SRD_CC_v5.2.1.pdf`, `SRD_CC_v5.1.pdf`, `SRD_CC_v5.1_ES.pdf`.
2. `python3 -I scripts/glossary/extract_srd.py <pdf-dir> <raw-dir>` writes raw extraction JSON.
3. `python3 -I scripts/glossary/build_content.py <raw-dir> src/features/glossary/content`.
4. Review the diff and run `npm run test` (content contract tests).

- `srd_pdf.py`: two-column PDF reader with font styles (heading, bold lead-in, italic).
- `blocks.py`: paragraphs, tables and Rytta inline markup (`*em*`, `**strong**`).
- `rules_map.py`: reviewed EN→ES pairs for the Rules Glossary headings.
- `curated.py`: hand-written data (abilities, skills, damage types, quick facts, aliases,
  auto-link exclusions, 2014 headings, table overrides).
- `legacy.py`: SRD 5.1 conditions and combat actions.
