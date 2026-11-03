"""Manual SRD → Rytta glossary extraction (RYT-008).

Usage (outside CI; PDFs are not committed):
  python3 -I scripts/glossary/extract_srd.py <pdf-dir> <out-dir>

Reads SRD 5.2.1 (EN, ES) and writes raw extraction JSON for review. build_content.py turns
the reviewed raw files into src/features/glossary/content/*.json.
"""

from __future__ import annotations

import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))

from blocks import build_blocks, heading_text, join_text  # noqa: E402
from legacy import segment  # noqa: E402
from srd_pdf import read_pages  # noqa: E402

DOCS = {
    "en": ("SRD_CC_v5.2.1.pdf", {"rules": (176, 191), "spells": (107, 175), "weapons": (89, 90)}),
    "es": ("SP_SRD_CC_v5.2.1.pdf", {"rules": (194, 211), "spells": (118, 193), "weapons": (97, 98)}),
}
FIRST_WEAPON = {"en": "Ammunition", "es": "A dos manos"}


def split_entries(lines, first_heading: str | None = None, stop: str | None = None):
    entries = []
    current = None
    started = first_heading is None
    for line in lines:
        if line.runs and line.runs[0].style in ("h1", "h2"):
            if current:
                entries.append(current)
                current = None
            if stop and stop in heading_text(line):
                break
            continue
        if line.runs and line.runs[0].style == "h3" and line.main_style in ("h3", "g", "hs"):
            title = heading_text(line)
            if not started:
                if title == first_heading:
                    started = True
                else:
                    continue
            # A heading that wraps onto a second heading line continues the same title.
            if current and not current["lines"] and current.get("_just"):
                current["heading"] += " " + title
                continue
            if current:
                entries.append(current)
            current = {"heading": title, "page": line.page, "lines": [], "_just": True}
            continue
        if current is None:
            continue
        current["_just"] = False
        current["lines"].append(line)
    if current:
        entries.append(current)
    return entries


STAT_LABELS = ("Casting Time", "Range", "Components", "Component", "Duration",
               "Tiempo de lanzamiento", "Alcance", "Componentes", "Duración")


def spell_header(lines):
    """Split the italic level line and the stat lines (Casting Time…) from the body."""
    meta, stats, body = [], [], []
    for line in lines:
        text = line.text.replace("\t", " ").strip()
        if not stats and not body and line.main_style == "i":
            meta.append(text)
            continue
        if not body and line.main_style in ("g", "hs"):
            label, sep, value = text.partition(":")
            if sep and label.strip() in STAT_LABELS:
                stats.append([label.strip(), value.strip()])
                continue
            if stats:
                stats[-1][1] = join_text(stats[-1][1], text)
                continue
        body.append(line)
    return " ".join(meta), stats, body


def main(pdf_dir: str, out_dir: str) -> None:
    os.makedirs(out_dir, exist_ok=True)
    for lang, (name, sections) in DOCS.items():
        path = os.path.join(pdf_dir, name)
        a, b = sections["rules"]
        rules_lines = read_pages(path, a, b)
        first = "Ability Check" if lang == "en" else "Acción"
        rules = []
        for entry in split_entries(rules_lines, first):
            rules.append({"heading": entry["heading"], "page": entry["page"],
                          "blocks": build_blocks(entry["lines"])})
        a, b = sections["spells"]
        spells = []
        for entry in split_entries(read_pages(path, a, b)):
            meta, stats, body = spell_header(entry["lines"])
            blocks = build_blocks(body)
            while blocks and not stats or (blocks and len(stats) < 4 and blocks[0].get("lead", "").rstrip(":") in STAT_LABELS):
                lead = blocks[0].get("lead", "").rstrip(":")
                if lead not in STAT_LABELS:
                    break
                stats.append([lead, blocks.pop(0)["x"]])
            for stat in stats:
                if stat[0] == "Component":
                    stat[0] = "Components"
            spells.append({"heading": entry["heading"], "page": entry["page"], "meta": meta,
                           "stats": stats, "blocks": blocks})
        a, b = sections["weapons"]
        weapons = [{"heading": e["heading"], "page": e["page"], "blocks": build_blocks(e["lines"])}
                   for e in split_entries(read_pages(path, a, b), FIRST_WEAPON[lang])]
        legacy = segment(lang, pdf_dir)
        for kind, data in (("rules", rules), ("spells", spells), ("weapons", weapons), ("legacy", legacy)):
            with open(os.path.join(out_dir, f"raw-{kind}.{lang}.json"), "w", encoding="utf-8") as fh:
                json.dump(data, fh, ensure_ascii=False, indent=1)
        print(lang, "rules", len(rules), "spells", len(spells), "weapons", len(weapons), "legacy", len(legacy))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
