"""Manual SRD → Rytta magic items extraction (RYT-176).

Usage (outside CI; PDFs are not committed):
  python3 -I scripts/items/magic_items_extract.py <SRD_CC_v5.2.1.pdf> <SP_SRD_CC_v5.2.1.pdf> <raw-dir>

Reads the "Magic Items A–Z" section of the SRD 5.2.1 in English and in the official Spanish
edition and writes one raw JSON per language: heading, page, subtitle and plain text of every
item. build-magic-items.mjs pairs the two languages and builds the catalogue rows.
"""

from __future__ import annotations

import json
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "glossary"))

from blocks import heading_text, inline_of, is_table_line, join_text, tidy  # noqa: E402
import pdfplumber  # noqa: E402
from srd_pdf import _baseline, _is_footer, _lines_from_chars  # noqa: E402

DOCS = {
    "en": {"pages": (209, 254), "start": "Magic Items A", "stop": "Monsters"},
    "es": {"pages": (228, 278), "start": "Objetos mágicos de la A", "stop": "Monstruos"},
}


def read_lines(path: str, first: int, last: int, split: float = 297.0):
    """read_pages, plus tables that span both columns.

    A full-width table has sans text running through the gutter. Its rows, and the sans rows
    right above and below them (a header or a wrapped cell that stays on one side), are read
    across the whole page instead of being cut in two.
    """
    out, wide_pages = [], []
    with pdfplumber.open(path) as pdf:
        for page_no in range(first, last + 1):
            page = pdf.pages[page_no - 1]
            body = [c for c in page.chars if c["top"] > 30 and not _is_footer(c, page.height)]
            sans = [c for c in body if "GillSans" in c["fontname"] and c["text"].strip() and c["size"] < 10.4]
            tops = sorted({round(_baseline(c), 1) for c in sans})
            band = [t for t in tops if any(290 < c["x0"] < 311 and abs(_baseline(c) - t) < 2.5 for c in sans)]
            if band:
                low, high, grown = min(band), max(band), True
                while grown:
                    grown = False
                    for t in tops:
                        if (low - 16 <= t < low - 2.5) or (high + 2.5 < t <= high + 16):
                            low, high, grown = min(low, t), max(high, t), True
                wide = [c for c in sans if low - 2.5 <= _baseline(c) <= high + 2.5]
                ids = {id(c) for c in wide}
                body = [c for c in body if id(c) not in ids]
                wide_pages.append(page_no)
            else:
                wide = []
            left = [c for c in body if c["x0"] < split]
            right = [c for c in body if c["x0"] >= split]
            # A full-width table sits under the left column's text and above the right column's.
            out.extend(_lines_from_chars(left + wide, page_no, 0))
            out.extend(_lines_from_chars(right, page_no, 1))
    return out, wide_pages


def section_lines(lines, start: str, stop: str):
    """Lines after the section's h1 heading and before the next chapter's."""
    out, inside = [], False
    for line in lines:
        if line.runs and line.runs[0].style == "h1":
            title = heading_text(line)
            if not inside and title.startswith(start):
                inside = True
                continue
            if inside and title.startswith(stop):
                break
            if inside and not out:
                continue  # the section heading wrapped onto a second line
        if inside:
            out.append(line)
    return out


def split_items(lines):
    items, current, fresh = [], None, False
    for line in lines:
        if line.runs and line.runs[0].style == "h3" and line.main_style == "h3":
            title = heading_text(line)
            if current is not None and fresh:
                current["heading"] = join_text(current["heading"], title)
                continue
            current = {"heading": title, "page": line.page, "lines": []}
            items.append(current)
            fresh = True
            continue
        if current is None:
            continue
        fresh = False
        current["lines"].append(line)
    return items


def plain(text: str) -> str:
    text = re.sub(r"\s+", " ", text.replace("**", "").replace("*", "")).strip()
    # A name in italics that breaks at a line end keeps its hyphen ("Fire-" / "ball").
    return re.sub(r"(?<=[a-záéíóúñ])- (?!(?:or|and|o|y|u|e) )(?=[a-záéíóúñ])", "", text)


def unfold(head, rows):
    """A table printed as two side-by-side halves reads as one list."""
    half = len(head) // 2
    if len(head) < 4 or len(head) % 2 or head[:half] != head[half:]:
        return head, rows
    left = [row[:half] for row in rows]
    right = [row[half:] for row in rows if any(row[half:])]
    return head[:half], left + right


def cells_of(line):
    """The cells of a table line with the x where each starts."""
    # Not line.text: it strips a leading empty cell, and the cells after it would shift.
    texts = "".join(run.text for run in line.runs).split("\t")
    xs = [line.x0, *line.stops]
    return [(xs[at] if at < len(xs) else xs[-1], tidy(text)) for at, text in enumerate(texts) if text.strip()]


def column_of(x: float, anchors) -> int:
    return min(range(len(anchors)), key=lambda at: abs(anchors[at] - x))


def is_header(line) -> bool:
    """Column headings are small semibold; a row with bold names in it is a little larger."""
    return line.main_style == "hs" and line.size < 9.4


def table_rows(lines) -> list[str]:
    """One table as text lines: the header and each row with " | " between cells.

    A long cell wraps onto lines that hold that cell alone; they are joined back to their row.
    """
    parsed = [(line, cells_of(line)) for line in lines]
    parsed = [(line, cells) for line, cells in parsed if cells]
    if not parsed:
        return []
    width = max(len(cells) for _, cells in parsed)
    full = [cells for _, cells in parsed if len(cells) == width]
    anchors = [sorted(cells[at][0] for cells in full)[len(full) // 2] for at in range(width)]
    head, rows, in_head = [""] * width, [], True
    for line, cells in parsed:
        placed = [(column_of(x, anchors) if len(cells) < width else at, text) for at, (x, text) in enumerate(cells)]
        if is_header(line):
            # A table that continues in the next column repeats its header.
            if in_head:
                for at, text in placed:
                    head[at] = join_text(head[at], text)
            continue
        in_head = False
        first = placed[0][1]
        starts_row = (
            len(cells) == width
            or not rows
            or (placed[0][0] == 0 and (len(cells) > 1 or not (first[:1].islower() or first.startswith("("))))
        )
        if starts_row:
            row = [""] * width
            for at, text in placed:
                row[at] = join_text(row[at], text)
            rows.append(row)
        else:
            for at, text in placed:
                rows[-1][at] = join_text(rows[-1][at], text)
    if any(head):
        head, rows = unfold(head, rows)
    out = [" | ".join(plain(cell) for cell in head)] if any(head) else []
    out.extend(" | ".join(plain(cell) for cell in row if cell) for row in rows)
    return out


def tables_text(lines) -> str:
    """Consecutive table lines: a caption line starts a new table."""
    out, current = [], []

    def flush():
        nonlocal current
        out.extend(table_rows(current))
        current = []

    for line in lines:
        if line.main_style == "hs" and line.size >= 10.4 and "\t" not in line.text:
            flush()
            if out:
                out.append("")
            out.append(plain(tidy(line.text)))
            continue
        current.append(line)
    flush()
    return "\n".join(out)


COLUMN_X = (63.0, 313.5)
SUPERSCRIPTS = {"2": "²", "3": "³"}


def paragraphs(lines, language: str) -> list[str]:
    """Plain paragraphs of running text.

    The English edition starts a paragraph with a leading space; the Spanish one indents its
    first line. Both start one with a bold lead-in ("Name."), and a list item that begins at
    the margin with its lead-in hangs: its other lines are the indented ones.
    """
    out, para, hanging, prev_box, open_lead, superscript = [], None, False, None, False, None
    for line in lines:
        runs = [run for run in line.runs if run.text.strip()]
        if not runs:
            continue
        # A superscript (m², m³) sits on a row of its own, above the line it belongs to.
        if line.size < 7 and line.text.strip() in SUPERSCRIPTS:
            superscript = SUPERSCRIPTS[line.text.strip()]
            continue
        box = (line.page, line.column)
        new_box = prev_box is not None and box != prev_box
        prev_box = box
        text = inline_of(line)
        if superscript:
            text = re.sub(r"(\d m) ?(?=[ .,;)])", lambda m: m[1] + superscript, text, count=1)
            superscript = None
        bold = runs[0].style in ("b", "bi") and (
            runs[0].text.strip().endswith((".", ":")) or all(run.style in ("b", "bi") for run in runs)
        )
        indented = line.x0 - COLUMN_X[line.column] > 5
        if language == "en":
            starts = line.runs[0].text.startswith(" ") or bold
        else:
            starts = bold or (indented and not hanging)
        # A column or page break can carry an indent artefact; a lowercase start continues.
        if new_box and para is not None and text.strip()[:1].islower():
            starts = False
        # No paragraph starts in lower case, and a lead-in that wraps is still the same one.
        if para is not None and (plain(text)[:1].islower() or open_lead):
            starts = False
        open_lead = all(run.style in ("b", "bi") for run in runs) and not text.rstrip(" *").endswith((".", ":"))
        if para is None or starts:
            if para:
                out.append(plain(tidy(para)))
            para = text
            hanging = bold and not indented
        else:
            para = join_text(para, text)
    if para:
        out.append(plain(tidy(para)))
    return out


def body_text(lines, language: str) -> str:
    parts, group, in_table, tables = [], [], False, set()

    def flush():
        nonlocal group
        if not group:
            return
        if in_table:
            parts.append(tables_text(group))
            tables.add(len(parts) - 1)
        else:
            found = paragraphs(group, language)
            # A table set inside a paragraph: the paragraph goes on after it.
            if found and found[0][:1].islower() and len(parts) >= 2 and len(parts) - 1 in tables:
                parts[-2] = join_text(parts[-2], found.pop(0))
            parts.extend(found)
        group = []

    for line in lines:
        table_line = is_table_line(line)
        if table_line != in_table:
            flush()
            in_table = table_line
        group.append(line)
    flush()
    return "\n\n".join(part for part in parts if part)


ABILITY = re.compile(r"([^\W\d]{3})\s+(\d+)\s+([+−-]\d+)\s+([+−-]\d+)")


def stat_block_text(heading: str, lines) -> str:
    out, labels = [heading], ("mod", "save")
    for line in lines:
        text = tidy(line.text.replace("\t", " "))
        if not text:
            continue
        if line.main_style == "g" and line.size < 8:
            words = text.lower().split()
            if len(words) >= 2:
                labels = (words[0], words[1])
            continue
        if line.main_style == "g" and line.size < 11:
            scores = [
                f"{m[1].capitalize()} {m[2]} ({labels[0]} {m[3]}, {labels[1]} {m[4]})"
                for m in ABILITY.finditer(text)
            ]
            out.append(", ".join(scores) if scores else text)
            continue
        if line.main_style == "g" or (line.runs and line.runs[0].style in ("b", "bi")) or len(out) < 2:
            out.append(text)
        else:
            out[-1] = join_text(out[-1], text)
    return "\n".join(out)


def is_stat_line(line) -> bool:
    return line.size < 9.9 or line.main_style == "g"


def item_of(raw, language: str):
    lines = raw["lines"]
    subtitle = []
    while lines and lines[0].main_style == "i" and not subtitle_done(subtitle, lines[0].text):
        subtitle.append(lines[0].text)
        lines = lines[1:]
    body, blocks, at = [], [], 0
    while at < len(lines):
        line = lines[at]
        if line.runs and line.runs[0].style == "h2":
            end = at + 1
            while end < len(lines) and is_stat_line(lines[end]) and lines[end].runs[0].style != "h2":
                end += 1
            blocks.append(stat_block_text(heading_text(line), lines[at + 1 : end]))
            at = end
            continue
        body.append(line)
        at += 1
    text = "\n\n".join(part for part in [body_text(body, language), *blocks] if part)
    return {
        "heading": raw["heading"],
        "page": raw["page"],
        "subtitle": plain(" ".join(subtitle)),
        "text": text,
    }


SUBTITLE_END = re.compile(
    r"(common|(?<!very )rare|legendary|artifact|varies|común|infrecuente|(?<!muy )rar[oa]|"
    r"legendari[oa]|artefacto|variable|\))$",
    re.IGNORECASE,
)


def subtitle_done(subtitle, next_text: str) -> bool:
    """The subtitle ends with a rarity or a bracket, unless the next italic line carries on.

    A few items start their rules text with their own name in italics, so "every italic line"
    would swallow the first line of the text.
    """
    if not subtitle:
        return False
    text = " ".join(subtitle).strip()
    carries_on = re.match(r"\s*(\(|or |o |u |rare|rar[oa])", next_text, re.IGNORECASE)
    return bool(SUBTITLE_END.search(text)) and not carries_on


def main(en_pdf: str, es_pdf: str, out_dir: str) -> None:
    os.makedirs(out_dir, exist_ok=True)
    for language, pdf in (("en", en_pdf), ("es", es_pdf)):
        doc = DOCS[language]
        read, wide = read_lines(pdf, *doc["pages"])
        lines = section_lines(read, doc["start"], doc["stop"])
        items = [item_of(raw, language) for raw in split_items(lines)]
        with open(os.path.join(out_dir, f"magic-items.{language}.json"), "w", encoding="utf-8") as fh:
            json.dump(items, fh, ensure_ascii=False, indent=1)
        longest = max(items, key=lambda item: len(item["text"]))
        print(language, len(items), "items; longest:", longest["heading"], len(longest["text"]))
        print(" full-width tables on pages", wide)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
