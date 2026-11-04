"""Parse SRD 5.2.1 monster stat blocks (English and Spanish) into structured dictionaries.

Used only by the manual bestiary build (scripts/bestiary/build_bestiary.py). It reuses the
glossary's styled-line reader; PDFs are downloaded outside the repository and never committed.
"""

from __future__ import annotations

import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "glossary"))

from blocks import inline_of, join_text, tidy  # noqa: E402
from srd_pdf import Line, read_pages  # noqa: E402

LABELS = {
    "en": {
        "ac": "AC", "initiative": "Initiative", "hp": "HP", "speed": "Speed",
        "skills": "Skills", "resistances": "Resistances", "vulnerabilities": "Vulnerabilities",
        "immunities": "Immunities", "gear": "Gear", "senses": "Senses", "languages": "Languages",
        "cr": "CR",
    },
    "es": {
        "ac": "CA", "initiative": "Iniciativa", "hp": "PG", "speed": "Velocidad",
        "skills": "Habilidades", "resistances": "Resistencias", "vulnerabilities": "Vulnerabilidades",
        "immunities": "Inmunidades", "gear": "Equipo", "senses": "Sentidos", "languages": "Idiomas",
        "cr": "VD",
    },
}
SECTIONS = {
    "en": {"Traits": "traits", "Actions": "actions", "Bonus Actions": "bonusActions",
           "Reactions": "reactions", "Legendary Actions": "legendaryActions"},
    "es": {"Atributos": "traits", "Acciones": "actions", "Acciones adicionales": "bonusActions",
           "Reacciones": "reactions", "Acciones legendarias": "legendaryActions"},
}
ABILITIES = {
    "str": "str", "dex": "dex", "con": "con", "int": "int", "wis": "wis", "cha": "cha",
    "fue": "str", "des": "dex", "sab": "wis", "car": "cha",
}
DETAIL_KEYS = ("skills", "resistances", "vulnerabilities", "immunities", "gear", "senses",
               "languages")
CHAPTERS = {"Monsters A–Z", "Animals", "Monstruos de la A a la Z", "Animales"}


def signed(text: str) -> int:
    return int(text.replace("−", "-").replace("–", "-").replace("+", ""))


def plain(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("\t", " ")).strip()


def label_of(line: Line, lang: str) -> tuple[str | None, str]:
    """Return (detail key, value) when a line opens with a bold stat label."""
    if not line.runs or line.runs[0].style not in ("b", "bi"):
        return None, ""
    head = plain(line.runs[0].text).rstrip(":").strip()
    for key, word in LABELS[lang].items():
        if head == word:
            rest = plain("".join(r.text for r in line.runs[1:]))
            return key, rest.lstrip(":").strip()
    return None, ""


def parse_abilities(text: str) -> dict:
    out = {}
    for m in re.finditer(r"([A-Za-z]{3})\s*(\d+)\s+([+−\-–]\d+)\s+([+−\-–]?\d+)", text):
        key = ABILITIES.get(m.group(1).lower())
        if key:
            mod = signed(m.group(3))
            save_text = m.group(4)
            # One printed save lost its minus sign (Young White Dragon, Int "−2 2"): an unsigned
            # save equal to a negative modifier is that modifier.
            save = -int(save_text) if save_text.isdigit() and mod < 0 and int(save_text) == -mod \
                else signed(save_text)
            out[key] = {"score": int(m.group(2)), "mod": mod, "save": save}
    return out


def entry_name(lead: str) -> str:
    return lead.strip().rstrip(".").strip()


class Block:
    def __init__(self, name: str, page: int, group: str | None):
        self.name = name
        self.page = page
        self.group = group
        self.meta = ""
        self.fields: dict[str, str] = {}
        self.abilities: dict = {}
        self.sections: list[dict] = []
        self.stage = "name"  # name → meta → stats → sections

    def to_dict(self) -> dict:
        return {
            "name": self.name, "page": self.page, "group": self.group, "meta": self.meta,
            "fields": self.fields, "abilities": self.abilities, "sections": self.sections,
        }


def parse_monsters(path: str, first: int, last: int, lang: str,
                   issues: list[str]) -> list[dict]:
    lines = read_pages(path, first, last)
    blocks: list[Block] = []
    group: str | None = None
    cur: Block | None = None
    field: str | None = None
    section: dict | None = None
    entry: dict | None = None
    para: str | None = None
    pending_lead: str | None = None
    prev_box = None

    def flush_para():
        nonlocal para
        if entry is not None and para is not None and para.strip():
            entry["paras"].append(tidy(para))
        para = None

    def flush_entry():
        nonlocal entry
        flush_para()
        if section is not None and entry is not None:
            section["entries"].append(entry)
        entry = None

    for line in lines:
        text = plain(line.text)
        if not text:
            continue
        box = (line.page, line.column)
        new_box = prev_box is not None and box != prev_box
        prev_box = box
        style = line.runs[0].style if line.runs else "r"
        if style == "h1":
            flush_entry()
            name = plain("".join(r.text for r in line.runs if r.style == "h1"))
            # Chapter titles (26pt) can wrap ("Monstruos de la A" / "a la Z").
            group = None if line.size >= 20 else name
            cur, section, field = None, None, None
            continue
        if style == "h2":
            flush_entry()
            name = plain("".join(r.text for r in line.runs))
            if cur is not None and cur.stage == "name":
                cur.name += " " + name  # a wrapped stat block title
                continue
            cur = Block(name, line.page, group)
            blocks.append(cur)
            section, field = None, None
            continue
        if cur is None:
            continue
        if cur.stage in ("name", "meta") and line.main_style == "i" and not cur.fields:
            cur.meta = (cur.meta + " " + text).strip()
            cur.stage = "meta"
            continue
        key, value = label_of(line, lang)
        if section is None and key:
            cur.stage = "stats"
            if key == "ac":
                # "AC 17  Initiative +7 (17)" (both labels in one line)
                full = plain("".join(r.text for r in line.runs))
                m = re.match(rf"{LABELS[lang]['ac']}:?\s*(.*?)\s*{LABELS[lang]['initiative']}:?\s*(.*)$", full)
                if not m:
                    raise ValueError(f"{cur.name}: bad AC line {full!r}")
                cur.fields["ac"] = m.group(1).strip()
                cur.fields["initiative"] = m.group(2).strip()
                field = None
                continue
            cur.fields[key] = value
            field = key
            continue
        if section is None and line.main_style == "g" and line.size < 8:
            continue  # MOD SAVE header
        if section is None and line.main_style == "g" and line.size < 11:
            cur.abilities.update(parse_abilities(line.text))
            field = None
            continue
        if line.main_style == "g" and line.size >= 11:
            flush_entry()
            title = plain(line.text)
            kind = SECTIONS[lang].get(title)
            if kind is None:
                raise ValueError(f"{cur.name}: unknown section {title!r} on page {line.page}")
            section = {"kind": kind, "intro": "", "entries": []}
            cur.sections.append(section)
            cur.stage = "sections"
            field = None
            continue
        if section is None:
            if field is None:
                issues.append(f"{cur.name}: stray stat line {text!r} on page {line.page}")
                continue
            cur.fields[field] = join_text(cur.fields[field], text)
            continue
        # Section body.
        if (section["kind"] == "legendaryActions" and entry is None and line.main_style == "i"
                and line.size < 9.3):
            section["intro"] = join_text(section["intro"], text)
            continue
        # Adjacent bold runs ("**Gaze (Recharge** **5–6).**") form one lead.
        inline = re.sub(r"\*\*(\s*)\*\*", r"\1", inline_of(line))
        # A period set outside the bold run ("**Lightning Absorption**.") still ends the lead.
        inline = re.sub(r"^(\s*\*\*[^*]+?)\*\*\.", r"\1.**", inline)
        if pending_lead:
            # The previous line held only the start of a wrapped lead.
            rest = inline.lstrip()
            inline = (pending_lead[:-2] + " " + rest[2:] if rest.startswith("**")
                      else pending_lead + " " + rest)
            pending_lead = None
        lead = re.match(r"^\s*\*\*([^*]+?)\*\*", inline)
        lead_text = lead.group(1).strip() if lead else ""
        # A bold cross-reference wrapping onto this line ("…dos nuevas **gelatinas** /
        # **ocres.** Cada…") continues the paragraph rather than opening an entry.
        wrapped_bold = bool(para and para.rstrip().endswith("**")
                            and not para.rstrip().endswith((".**", ":**")))
        if wrapped_bold and lead:
            para = para.rstrip()[:-2] + " " + inline.lstrip()[2:]
            continue
        # A lead that wraps ("**Provocar pesadillas (1/día; requiere una bolsa de**" /
        # "**almas).** Mientras…") waits for its second line.
        if lead and re.fullmatch(r"\s*\*\*[^*]+\*\*\s*", inline) and not lead_text.endswith(
                (".", ":")):
            pending_lead = inline.strip()
            continue
        # Numbered leads ("**1–4.**" table rows, "**2/Day:**") belong to the current entry.
        numbered = bool(lead and re.match(r"^\d", lead_text))
        if lead and lead_text.endswith(".") and not numbered:
            flush_entry()
            # The lead can be split into two bold runs ("**Tentacle. **").
            rest = inline[lead.end():]
            entry = {"name": entry_name(lead_text), "paras": []}
            para = rest
            continue
        if entry is None:
            issues.append(f"{cur.name}: text before any entry {text!r} on page {line.page}")
            continue
        raw_first = line.runs[0].text if line.runs else ""
        # An indent opens a paragraph only after a finished sentence (some Spanish pages indent
        # wrapped lines too).
        finished = not para or re.search(r"[.:!?)”»]\**\s*$", para) is not None
        starts = ((raw_first.startswith(" ") and finished) or numbered
                  or bool(lead and lead_text.endswith(":")))
        if new_box and para is not None and text[:1].islower():
            starts = False
        if starts:
            flush_para()
            para = inline
        else:
            para = join_text(para or "", inline)
    flush_entry()
    return [b.to_dict() for b in blocks]
