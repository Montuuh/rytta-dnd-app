"""SRD 5.1 (2014) extraction for the collapsible "2014 rule" blocks (RYT-008).

SRD 5.1 uses a different layout, so pages are read per column with `pdftotext -x/-W` crops and
segmented by the known headings in curated.LEGACY. Run through extract_srd.py.
"""

from __future__ import annotations

import re
import subprocess
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from curated import EXHAUSTION_2014, LEGACY, LEGACY_STOPS

PAGES = {
    "en": ("SRD_CC_v5.1.pdf", [(93, 96), (358, 359)]),
    "es": ("SRD_CC_v5.1_ES.pdf", [(98, 101), (389, 390)]),
}
NOISE = re.compile(r"^(System\s+Reference\s+Document\s+5\.1|Documento de referencia del sistema 5\.1|"
                   r"Prohibida la reventa|o fotocopiar este documento|\d+)\s*.*$")


def column_text(path: str, page: int) -> list[str]:
    lines: list[str] = []
    for x in (0, 306):
        out = subprocess.run(["pdftotext", "-q", "-f", str(page), "-l", str(page), "-x", str(x), "-y", "0",
                              "-W", "306", "-H", "792", path, "-"], capture_output=True, text=True).stdout
        lines.extend(out.splitlines())
        lines.append("")
    return lines


def styled_column_text(path: str, page: int) -> list[str]:
    """English SRD 5.1 crops badly with pdftotext; read styled lines and mark paragraphs."""
    from srd_pdf import read_pages

    out: list[str] = []
    lines = read_pages(path, page, page, split=306)
    for column in (0, 1):
        col = [ln for ln in lines if ln.column == column]
        if not col:
            continue
        base = min(ln.x0 for ln in col)
        in_bullet = False
        for ln in col:
            text = ln.text
            heading = ln.main_style in ("h1", "h2", "h3", "hs")
            if heading:
                out.extend(["", text, ""])
                in_bullet = False
                continue
            if text.startswith("•"):
                in_bullet = True
                out.append(text)
                continue
            if ln.x0 > base + 5 and not in_bullet:
                out.append("")
            elif ln.x0 <= base + 5 and in_bullet:
                in_bullet = False
                out.append("")
            out.append(text)
        out.append("")
    return out


def clean(line: str) -> str:
    line = line.replace(" ", " ").replace("\t", " ").replace("­", "")
    line = re.sub(r"-?‐+", "-", line)
    line = re.sub(r"\s+", " ", line)
    return line.strip()


def segment(lang: str, pdf_dir: str) -> dict[str, dict]:
    name, ranges = PAGES[lang]
    path = f"{pdf_dir}/{name}"
    heads = {v[0 if lang == "en" else 1]: k for k, v in LEGACY.items()}
    stops = set(LEGACY_STOPS[lang])
    found: dict[str, dict] = {}
    current = None
    for a, b in ranges:
        for page in range(a, b + 1):
            source = styled_column_text(path, page) if lang == "en" else column_text(path, page)
            for raw in source:
                line = clean(raw)
                if re.match(r"^\d+$", line) or "Document 5.1" in line or "sistema 5.1" in line \
                        or "reventa" in line or "fotocopiar este documento" in line:
                    continue
                if line in heads and heads[line] not in found:
                    current = {"id": heads[line], "page": page, "paras": [[]]}
                    found[heads[line]] = current
                    continue
                if line in stops or (line in heads and heads[line] in found):
                    current = None
                    continue
                if current is None:
                    continue
                if not line:
                    if current["paras"][-1]:
                        current["paras"].append([])
                    continue
                if line.startswith("•") and current["paras"][-1]:
                    current["paras"].append([])
                current["paras"][-1].append(line)
    out = {}
    for key, entry in found.items():
        blocks = []
        items: list[str] = []
        for para in entry["paras"]:
            if not para:
                continue
            text = ""
            for ln in para:
                if text.endswith("-") and ln[:1].islower() and len(text) > 1 and text[-2].isalpha():
                    text = text[:-1] + ln
                else:
                    text = (text + " " + ln).strip()
            if text.startswith("•"):
                items.append(text.lstrip("• ").strip())
                continue
            if items:
                blocks.append({"t": "ul", "items": items})
                items = []
            # Drop the raw exhaustion table cells; a clean table replaces them below.
            if key == "condition.exhaustion" and re.fullmatch(r"(Level|Nivel|Effect|Efecto|[0-9 ]+|Death|Muerte\.?)", text):
                continue
            if key == "condition.exhaustion" and re.match(r"^(Disadvantage on|Speed halved|Hit point maximum|Speed reduced|Desventaja en|Velocidad reducida|Puntos de golpe máximos)", text):
                continue
            if key == "condition.exhaustion":
                if re.match(r"^[1-6] \S", text) or text.startswith("Efecto "):
                    continue
                text = re.sub(r"\s+(Level Effect|Nivel)$", "", text)
            blocks.append({"t": "p", "x": text})
        if items:
            blocks.append({"t": "ul", "items": items})
        if key == "condition.exhaustion":
            table = dict(EXHAUSTION_2014[lang])
            blocks.insert(1, {"t": "table", **table})
        out[key] = {"page": entry["page"], "blocks": blocks}
    return out
