# Glossary content pipeline (RYT-008)

The glossary bundles rules text from the System Reference Document 5.2.1 (and SRD 5.1 for the
2014 blocks), English and Spanish editions, licensed CC-BY-4.0 by Wizards of the Coast LLC.
See `docs/decisions/025-glossary.md` for attribution and adaptation notes.

The scripts run manually (not in CI) and need `pdfplumber` and `pdftotext`:

1. Download the official PDFs from https://www.dndbeyond.com/srd into a folder outside the repo:
   `SRD_CC_v5.2.1.pdf`, `SP_SRD_CC_v5.2.1.pdf`, `SRD_CC_v5.1.pdf`, `SRD_CC_v5.1_ES.pdf`.
2. `python3 -I scripts/glossary/extract_srd.py <pdf-dir> <raw-dir>` writes raw extraction JSON.
3. `python3 -I scripts/glossary/build_content.py <raw-dir> src/features/glossary/content`.
4. `python3 -I scripts/glossary/class_features.py <pdf-dir> src/features/glossary/content [--report]`
   merges the 232 SRD 5.2.1 class and subclass features (RYT-071, ADR 035) as category `feature`;
   `--report` prints the English–Spanish pairs for review. Re-run it after step 3. It also splits
   the options a resource pays for (Flurry of Blows, Divine Spark, Divine Sense…) out of their
   parent feature into entries of their own (RYT-102); the parent keeps its text.
5. `python3 -I scripts/glossary/origin_features.py <pdf-dir> src/features/glossary/content [--report]`
   merges the 33 species traits (`feature.species-<species>-<trait>`) and 17 feats
   (`feature.feat-<feat>`) as category `feature` without a class (RYT-102). Run it after step 4.
6. Review the diff and run `npm run test` (content contract tests).

- `srd_pdf.py`: two-column PDF reader with font styles (heading, bold lead-in, italic).
- `blocks.py`: paragraphs, tables and Rytta inline markup (`*em*`, `**strong**`).
- `rules_map.py`: reviewed EN→ES pairs for the Rules Glossary headings.
- `curated.py`: hand-written data (abilities, skills, damage types, quick facts, aliases,
  auto-link exclusions, 2014 headings, table overrides).
- `legacy.py`: SRD 5.1 conditions and combat actions.
- `class_features.py`: class features (reviewed pairs for levels with several features, reviewed
  tables, subclass spell lists named from the glossary's spell pairs, options split out).
- `origin_features.py`: species traits and feats (reviewed name pairs, full-width tables and
  Spanish letter-spacing fixes).
