"""Turns styled SRD lines into glossary blocks using Rytta's inline mini-markup.

Inline markup (parsed by src/features/glossary/domain/inline.ts, never as HTML):
  *text*        emphasis (SRD italics, e.g. spell names)
  **text**      strong
  [[id|label]]  reference to another glossary entry (added later by the linker pass)
Blocks: {"t": "p", "x": str, "lead"?: str} | {"t": "table", "caption"?: str, "head"?: [str], "rows": [[str]]}
"""

from __future__ import annotations

import re

from srd_pdf import Line

HYPHENS = ("-", "‑", "­")


def inline_of(line: Line) -> str:
    out = []
    for run in line.runs:
        text = run.text.replace("*", "")
        if not text:
            continue
        if run.style == "i" and text.strip():
            lead = text[: len(text) - len(text.lstrip())]
            tail = text[len(text.rstrip()):]
            out.append(f"{lead}*{text.strip()}*{tail}")
        elif run.style in ("b", "bi") and text.strip():
            lead = text[: len(text) - len(text.lstrip())]
            tail = text[len(text.rstrip()):]
            out.append(f"{lead}**{text.strip()}**{tail}")
        else:
            out.append(text)
    return "".join(out)


def join_text(a: str, b: str) -> str:
    a = a.rstrip()
    b = b.strip()
    if not a:
        return b
    if not b:
        return a
    if a.endswith(HYPHENS) and len(a) > 1 and a[-2].isalpha() and b[:1].islower():
        return a[:-1] + b
    return a + " " + b


def tidy(text: str) -> str:
    text = re.sub(r"\*\*\s*\*\*", "", text)  # empty strong
    text = re.sub(r"\*\*([^*]+?)\*\*\*\*([^*]+?)\*\*", r"**\1\2**", text)
    text = re.sub(r"(?<![*\w])\*([^*]+?)\* \*([^*]+?)\*(?![*\w])", r"*\1 \2*", text)
    text = re.sub(r"\s+", " ", text)
    text = text.replace("‑", "-").replace("­", "")
    return text.strip()


def is_table_line(line: Line) -> bool:
    return line.main_style in ("g", "hs")


def split_lead(text: str) -> tuple[str | None, str]:
    m = re.match(r"^\*\*([^*]+?)\*\*\s*(.*)$", text)
    if m and m.group(1).strip().endswith((".", ":")):
        return m.group(1).strip(), m.group(2).strip()
    return None, text


def build_blocks(lines: list[Line]) -> list[dict]:
    blocks: list[dict] = []
    para: str | None = None
    table: list[tuple[str, list[str]]] | None = None

    def flush_para():
        nonlocal para
        if para is not None and para.strip():
            text = tidy(para)
            lead, rest = split_lead(text)
            block = {"t": "p", "x": rest}
            if lead:
                block = {"t": "p", "lead": lead, "x": rest}
            blocks.append(block)
        para = None

    def flush_table():
        nonlocal table
        if table:
            rows = [cells for _, cells in table]
            block: dict = {"t": "table", "rows": []}
            if len(rows[0]) == 1 and len(rows) > 1 and len(rows[1]) > 1:
                block["caption"] = rows[0][0]
                table.pop(0)
                rows = rows[1:]
            if table and table[0][0] == "hs" and len(rows) > 1:
                block["head"] = rows[0]
                rows = rows[1:]
            block["rows"] = rows
            blocks.append(block)
        table = None

    prev_box = None
    for line in lines:
        raw_first = line.runs[0].text if line.runs else ""
        box = (line.page, line.column)
        new_box = prev_box is not None and box != prev_box
        prev_box = box
        if is_table_line(line):
            flush_para()
            cells = [tidy(c) for c in line.text.split("\t") if c.strip()]
            if table is None:
                table = []
            table.append((line.main_style, cells))
            continue
        flush_table()
        text = inline_of(line)
        starts_para = raw_first.startswith(" ") or (line.runs and line.runs[0].style in ("b", "bi"))
        # A column or page break can carry an indent artefact; a lowercase start continues.
        if new_box and para is not None and text.strip()[:1].islower():
            starts_para = False
        if para is None or starts_para:
            flush_para()
            para = text
        else:
            para = join_text(para, text)
    flush_para()
    flush_table()
    return blocks


def heading_text(line: Line) -> str:
    return re.sub(r"\s+", " ", "".join(r.text for r in line.runs)).strip()
