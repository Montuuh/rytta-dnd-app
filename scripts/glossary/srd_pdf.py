"""Low-level SRD PDF reader: turns two-column SRD pages into styled lines.

Used only by the manual glossary extraction (scripts/glossary/extract_srd.py). It needs
pdfplumber and the official SRD PDFs downloaded outside the repository; it is not part of CI.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import pdfplumber

STYLE_BY_FONT = (
    ("BoldItalic", "bi"),
    ("Bold", "b"),
    ("Italic", "i"),
)


def style_of(fontname: str, size: float) -> str:
    if "GillSans-SemiBold" in fontname:
        if size >= 17:
            return "h1"
        if size >= 13.5:
            return "h2"
        if size >= 11.5:
            return "h3"
        return "hs"  # small semibold (table headers, stat labels)
    if "GillSans" in fontname:
        return "g"  # sans body (tables, lists of names)
    for marker, style in STYLE_BY_FONT:
        if marker in fontname:
            return style
    return "r"


@dataclass
class Run:
    style: str
    text: str


@dataclass
class Line:
    page: int
    column: int
    top: float
    x0: float
    size: float
    runs: list[Run] = field(default_factory=list)

    @property
    def text(self) -> str:
        return "".join(r.text for r in self.runs).strip()

    @property
    def main_style(self) -> str:
        counts: dict[str, int] = {}
        for run in self.runs:
            counts[run.style] = counts.get(run.style, 0) + len(run.text.strip())
        return max(counts, key=counts.get) if counts else "r"


def _baseline(ch: dict) -> float:
    # Fonts report different ascents, so "top" misorders mixed styles; the text matrix
    # baseline is stable across fonts.
    return -ch["matrix"][5]


def _lines_from_chars(chars, page_no: int, column: int) -> list[Line]:
    chars = [c for c in chars if c["text"].strip() or c["text"] == " "]
    for ch in chars:
        ch["top"] = _baseline(ch)
    rows: list[list[dict]] = []
    for ch in sorted(chars, key=lambda c: c["top"]):
        for row in rows:
            if abs(row[0]["top"] - ch["top"]) < 2.5:
                row.append(ch)
                break
        else:
            rows.append([ch])
    lines: list[Line] = []
    for row in rows:
        row.sort(key=lambda c: c["x0"])
        line = Line(page_no, column, row[0]["top"], row[0]["x0"], max(c["size"] for c in row))
        prev = None
        for ch in row:
            style = style_of(ch["fontname"], ch["size"])
            text = ch["text"]
            gap = ch["x0"] - prev["x1"] if prev is not None else 0
            if prev is not None and gap > 7 and style in ("g", "hs") and text != " ":
                _append(line, style, "\t")
            elif prev is not None and gap > ch["size"] * 0.18 and text != " ":
                if not line.runs or not line.runs[-1].text.endswith(" "):
                    gap_style = line.runs[-1].style if line.runs else style
                    _append(line, gap_style, " ")
            _append(line, style, text)
            prev = ch
        lines.append(line)
    lines.sort(key=lambda ln: ln.top)
    return lines


def _append(line: Line, style: str, text: str) -> None:
    if line.runs and line.runs[-1].style == style:
        line.runs[-1].text += text
    else:
        line.runs.append(Run(style, text))


def _is_footer(ch: dict, height: float) -> bool:
    # The running footer ("System Reference Document 5.2.1" + page number) is GillSans 11pt;
    # body text can sit on the same baseline, so the font decides, not the position.
    return ch["top"] > height - 50 and "GillSans" in ch["fontname"] and ch["size"] >= 10.5


def read_pages(path: str, first: int, last: int, split: float = 297.0) -> list[Line]:
    """Return styled lines for 1-based printed pages first..last (pdf index = page - 1)."""
    out: list[Line] = []
    with pdfplumber.open(path) as pdf:
        for page_no in range(first, last + 1):
            page = pdf.pages[page_no - 1]
            body = [c for c in page.chars if c["top"] > 30 and not _is_footer(c, page.height)]
            left = [c for c in body if c["x0"] < split]
            right = [c for c in body if c["x0"] >= split]
            out.extend(_lines_from_chars(left, page_no, 0))
            out.extend(_lines_from_chars(right, page_no, 1))
    return out


def markup(line: Line) -> str:
    parts = []
    for run in line.runs:
        t = run.text
        if run.style in ("bi", "b"):
            parts.append(f"**{t}**")
        elif run.style == "i":
            parts.append(f"_{t}_")
        elif run.style in ("h1", "h2", "h3"):
            parts.append(f"<{run.style}>{t}")
        elif run.style in ("g", "hs"):
            parts.append(f"~{t}~")
        else:
            parts.append(t)
    return "".join(parts)
